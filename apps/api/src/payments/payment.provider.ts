import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

/**
 * Métodos que um provedor pode declarar em `methods`. A Cora oferece 'pix' e 'boleto';
 * 'cartao' e 'pix_automatico' só aparecem para o cliente quando o provedor ativo os declarar.
 */
export type ChargeMethod = 'pix' | 'boleto' | 'cartao' | 'pix_automatico';
export type ChargeStatus = 'pending' | 'confirmed' | 'failed' | 'refunded';

export interface CreateChargeInput {
  /** Identificador interno (pagamento.id). Usado como Idempotency-Key quando for UUID. */
  externalReference: string;
  method: ChargeMethod;
  /** Valor em reais. */
  value: number;
  /** Vencimento no formato AAAA-MM-DD (fuso de Brasília). */
  dueDate: string;
  customerName: string;
  customerCpf: string;
  customerEmail: string;
  description: string;
  /** Permite forçar uma nova chave de idempotência (nova tentativa após falha). */
  idempotencyKey?: string;
  /** Até quando a cobrança vale (fim da reserva). Usado pelo cartão para expirar o link de pagamento. */
  expiresAt?: Date;
  /** Caminho do site para onde o cliente volta depois de pagar no provedor (ex.: /checkout/<cota>). */
  returnPath?: string;
}

export interface CreatedCharge {
  provider: string;
  transactionId: string;
  status: 'pending' | 'confirmed';
  /** Pix copia e cola (EMV). */
  qrCode: string | null;
  /** URL da imagem PNG do QR Code, quando fornecida pelo provedor. */
  qrCodeUrl?: string | null;
  boleto?: { digitableLine: string | null; barcode: string | null; url: string | null };
  /** Endereço da página segura do provedor onde o cliente paga com cartão. */
  checkoutUrl?: string | null;
}

export interface PaymentWebhook {
  transactionId: string;
  status: ChargeStatus;
  /** Valor efetivamente pago, em reais, quando o provedor informa. */
  paidAmount?: number;
}

export interface PaymentProvider {
  readonly name: string;
  readonly methods: ChargeMethod[];
  /** Valor mínimo de cobrança aceito pelo provedor (reais). */
  readonly minAmount: number;
  createCharge(input: CreateChargeInput): Promise<CreatedCharge>;
  /**
   * Interpreta um webhook. Retorna null para eventos que devem ser ignorados.
   * Provedores sem assinatura (Cora) confirmam o estado consultando a API.
   */
  resolveWebhook(rawBody: string, headers: Record<string, string | undefined>, query?: Record<string, string | undefined>): Promise<PaymentWebhook | null>;
  fetchStatus?(transactionId: string): Promise<{ status: ChargeStatus; paidAmount?: number }>;
  cancelCharge?(transactionId: string): Promise<void>;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Converte qualquer texto em UUID estável quando a referência não for UUID. */
export function toIdempotencyKey(reference: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference)) return reference.toLowerCase();
  const hex = createHash('sha1').update(reference).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/* -------------------------------------------------------------------------- */
/* Cora — Integração Direta (mTLS + client_credentials)                       */
/* -------------------------------------------------------------------------- */

export interface CoraTransportRequest {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  headers: Record<string, string>;
  body?: string;
}
export interface CoraTransportResponse { status: number; body: string }
export type CoraTransport = (request: CoraTransportRequest) => Promise<CoraTransportResponse>;

interface CoraCredentials { clientId: string; cert: string; key: string }

function readPem(config: ConfigService, name: 'CERT' | 'KEY'): string {
  const pem = config.get<string>(`CORA_${name}_PEM`, '');
  if (pem) return pem.replace(/\\n/g, '\n');
  const base64 = config.get<string>(`CORA_${name}_BASE64`, '');
  if (base64) return Buffer.from(base64, 'base64').toString('utf8');
  const path = config.get<string>(`CORA_${name}_PATH`, '');
  if (path) return readFileSync(path, 'utf8');
  return '';
}

export class CoraProvider implements PaymentProvider {
  readonly name = 'cora';
  readonly methods: ChargeMethod[] = ['pix', 'boleto'];
  readonly minAmount: number;
  private readonly host: string;
  private readonly port: number | undefined;
  private readonly clientId: string;
  private readonly webhookSecret: string;
  private readonly transport: CoraTransport;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService, transport?: CoraTransport) {
    const environment = config.get<string>('CORA_ENV', 'stage');
    const override = config.get<string>('CORA_BASE_URL', '');
    const target = (override || `matls-clients.api${environment === 'production' ? '' : '.stage'}.cora.com.br`).replace(/^https?:\/\//, '').replace(/\/$/, '');
    // CORA_BASE_URL aceita "host" ou "host:porta" (a porta serve para ambiente de teste com uma Cora simulada).
    const [hostname = '', port] = target.split(':');
    this.host = hostname;
    this.port = port ? Number(port) : undefined;
    this.clientId = config.get<string>('CORA_CLIENT_ID', '');
    this.webhookSecret = config.get<string>('PAYMENT_WEBHOOK_SECRET', '');
    this.minAmount = Number(config.get<string>('CORA_MIN_AMOUNT', '5'));
    this.transport = transport ?? this.defaultTransport();
  }

  private credentials(): CoraCredentials {
    const cert = readPem(this.config, 'CERT');
    const key = readPem(this.config, 'KEY');
    if (!this.clientId || !cert || !key) {
      throw new ServiceUnavailableException('Credenciais da Cora não configuradas (CORA_CLIENT_ID, CORA_CERT_* e CORA_KEY_*).');
    }
    return { clientId: this.clientId, cert, key };
  }

  private defaultTransport(): CoraTransport {
    let cached: CoraCredentials | null = null;
    return (request) => new Promise<CoraTransportResponse>((resolve, reject) => {
      try { cached ??= this.credentials(); } catch (error) { reject(error); return; }
      const req = httpsRequest({
        host: this.host,
        ...(this.port ? { port: this.port } : {}),
        path: request.path,
        method: request.method,
        headers: request.body ? { ...request.headers, 'content-length': String(Buffer.byteLength(request.body)) } : request.headers,
        cert: cached.cert,
        key: cached.key,
        timeout: 20_000,
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('timeout', () => req.destroy(new Error('Tempo limite na comunicação com a Cora.')));
      req.on('error', reject);
      if (request.body) req.write(request.body);
      req.end();
    });
  }

  private async accessToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expiresAt > Date.now()) return this.token.value;
    if (!this.clientId) throw new ServiceUnavailableException('CORA_CLIENT_ID não configurado.');
    const response = await this.transport({
      method: 'POST',
      path: '/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(this.clientId)}`,
    });
    if (response.status !== 200) throw new ServiceUnavailableException(`Falha ao autenticar na Cora: HTTP ${response.status}`);
    const parsed = JSON.parse(response.body) as { access_token?: string; expires_in?: number };
    if (!parsed.access_token) throw new ServiceUnavailableException('A Cora não retornou token de acesso.');
    this.token = { value: parsed.access_token, expiresAt: Date.now() + Math.max(60, (parsed.expires_in ?? 3600) - 300) * 1000 };
    return this.token.value;
  }

  private async call(method: CoraTransportRequest['method'], path: string, body?: unknown, idempotencyKey?: string): Promise<CoraTransportResponse> {
    const send = async (force: boolean) => {
      const token = await this.accessToken(force);
      return this.transport({
        method,
        path,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    };
    const first = await send(false);
    if (first.status !== 401) return first;
    return send(true);
  }

  /** Chamada autenticada à API da Cora (mTLS + Bearer), reutilizada pelo módulo fiscal. */
  async request(method: CoraTransportRequest['method'], path: string, body?: unknown, idempotencyKey?: string): Promise<CoraTransportResponse> {
    return this.call(method, path, body, idempotencyKey);
  }

  async createCharge(input: CreateChargeInput): Promise<CreatedCharge> {
    if (!this.methods.includes(input.method)) throw new BadRequestException('Método de pagamento não suportado pela Cora.');
    const cents = Math.round(input.value * 100);
    if (cents < Math.round(this.minAmount * 100)) {
      throw new BadRequestException(`O valor mínimo de cobrança é R$ ${this.minAmount.toFixed(2).replace('.', ',')}.`);
    }
    const payload = {
      code: input.externalReference,
      customer: {
        name: input.customerName.slice(0, 60),
        ...(input.customerEmail ? { email: input.customerEmail.slice(0, 60) } : {}),
        document: { identity: input.customerCpf.replace(/\D/g, ''), type: 'CPF' },
      },
      services: [{ name: 'Cota de bolão', description: input.description.slice(0, 100), amount: cents }],
      payment_terms: { due_date: input.dueDate },
      payment_forms: input.method === 'pix' ? ['PIX'] : ['BANK_SLIP', 'PIX'],
    };
    const response = await this.call('POST', '/v2/invoices', payload, input.idempotencyKey ?? toIdempotencyKey(input.externalReference));
    if (response.status < 200 || response.status >= 300) {
      throw new ServiceUnavailableException(`A Cora recusou a cobrança (HTTP ${response.status}). ${this.safeMessage(response.body)}`);
    }
    const data = JSON.parse(response.body) as CoraInvoice;
    if (!data.id) throw new ServiceUnavailableException('A Cora não retornou o identificador da cobrança.');
    const slip = data.payment_options?.bank_slip;
    return {
      provider: this.name,
      transactionId: data.id,
      status: data.status === 'PAID' ? 'confirmed' : 'pending',
      qrCode: data.pix?.emv ?? null,
      qrCodeUrl: input.method === 'pix' ? slip?.url ?? null : null,
      ...(input.method === 'boleto' ? { boleto: { digitableLine: slip?.digitable ?? slip?.digitable_line ?? null, barcode: slip?.barcode ?? null, url: slip?.url ?? null } } : {}),
    };
  }

  async fetchStatus(transactionId: string): Promise<{ status: ChargeStatus; paidAmount?: number }> {
    if (!/^inv_[A-Za-z0-9_-]+$/.test(transactionId)) throw new BadRequestException('Identificador de cobrança inválido.');
    const response = await this.call('GET', `/v2/invoices/${transactionId}`);
    if (response.status === 404) return { status: 'failed' };
    if (response.status !== 200) throw new ServiceUnavailableException(`Falha ao consultar a Cora: HTTP ${response.status}`);
    const data = JSON.parse(response.body) as CoraInvoice;
    return { status: mapCoraStatus(data.status), paidAmount: typeof data.total_paid === 'number' ? data.total_paid / 100 : undefined };
  }

  async cancelCharge(transactionId: string): Promise<void> {
    if (!/^inv_[A-Za-z0-9_-]+$/.test(transactionId)) return;
    const response = await this.call('DELETE', `/v2/invoices/${transactionId}`);
    if (response.status === 404) return;
    if (response.status < 200 || response.status >= 300) throw new ServiceUnavailableException(`Falha ao cancelar na Cora: HTTP ${response.status}`);
  }

  async resolveWebhook(rawBody: string, headers: Record<string, string | undefined>, query: Record<string, string | undefined> = {}): Promise<PaymentWebhook | null> {
    if (this.webhookSecret) {
      const presented = query.token ?? headers['x-webhook-token'] ?? '';
      if (!presented || !safeEqual(presented, this.webhookSecret)) throw new UnauthorizedException('Token de webhook inválido.');
    }
    let resourceId = headers['webhook-resource-id'];
    let eventType = headers['webhook-event-type'] ?? '';
    if (!resourceId && rawBody) {
      try {
        const parsed = JSON.parse(rawBody) as { resource_id?: string; id?: string; event_type?: string };
        resourceId = parsed.resource_id ?? parsed.id;
        eventType = eventType || parsed.event_type || '';
      } catch { /* corpo vazio é o formato padrão da Cora */ }
    }
    if (!resourceId || !eventType.startsWith('invoice.')) return null;
    // A notificação da Cora não é assinada: o estado real é sempre confirmado na API.
    const current = await this.fetchStatus(resourceId);
    return { transactionId: resourceId, status: current.status, paidAmount: current.paidAmount };
  }

  /** Cadastra os webhooks de cobrança (pago e cancelado) apontando para a URL informada. */
  async registerWebhooks(url: string): Promise<Array<{ trigger: string; id?: string; status: number }>> {
    const results: Array<{ trigger: string; id?: string; status: number }> = [];
    for (const trigger of ['paid', 'canceled']) {
      const response = await this.call('POST', '/endpoints', { url, resource: 'invoice', trigger }, randomUUID());
      let id: string | undefined;
      try { id = (JSON.parse(response.body) as { id?: string }).id; } catch { /* ignore */ }
      results.push({ trigger, id, status: response.status });
    }
    return results;
  }

  private safeMessage(body: string): string {
    return body.replace(/[\r\n]+/g, ' ').slice(0, 180);
  }
}

interface CoraInvoice {
  id?: string;
  status?: string;
  total_amount?: number;
  total_paid?: number;
  pix?: { emv?: string };
  payment_options?: { bank_slip?: { url?: string; barcode?: string; digitable?: string; digitable_line?: string } };
}

export function mapCoraStatus(status?: string): ChargeStatus {
  switch (status) {
    case 'PAID': return 'confirmed';
    case 'CANCELLED':
    case 'CANCELED': return 'failed';
    default: return 'pending'; // DRAFT, OPEN, IN_PAYMENT, INITIATED, LATE
  }
}

/* -------------------------------------------------------------------------- */
/* Mercado Pago — cartão (Checkout Pro)                                       */
/* -------------------------------------------------------------------------- */

export interface MercadoPagoRequest { method: 'GET' | 'POST'; path: string; headers: Record<string, string>; body?: string }
export interface MercadoPagoResponse { status: number; body: string }
export type MercadoPagoTransport = (request: MercadoPagoRequest) => Promise<MercadoPagoResponse>;

/**
 * Segundo provedor, só para cartão de crédito e débito. O cliente é levado à página segura do Mercado Pago (Checkout Pro),
 * paga lá e volta ao site: o número do cartão nunca passa pelo servidor do BL. O aviso de pagamento não é confiado:
 * o BL consulta o pagamento na API do Mercado Pago antes de confirmar. A cobrança é identificada por `mp_<id do pagamento BL>`.
 */
export class MercadoPagoProvider implements PaymentProvider {
  readonly name = 'mercadopago';
  readonly methods: ChargeMethod[] = ['cartao'];
  readonly minAmount: number;
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly webhookSecret: string;
  private readonly signatureSecret: string;
  private readonly maxInstallments: number;
  private readonly transport: MercadoPagoTransport;

  constructor(private readonly config: ConfigService, transport?: MercadoPagoTransport) {
    this.token = config.get<string>('MERCADOPAGO_ACCESS_TOKEN', '');
    this.baseUrl = config.get<string>('MERCADOPAGO_BASE_URL', 'https://api.mercadopago.com').replace(/\/$/, '');
    this.webhookSecret = config.get<string>('PAYMENT_WEBHOOK_SECRET', '');
    this.signatureSecret = config.get<string>('MERCADOPAGO_SIGNATURE_SECRET', '');
    this.minAmount = Number(config.get<string>('MERCADOPAGO_MIN_AMOUNT', '5')) || 5;
    this.maxInstallments = Math.min(12, Math.max(1, Number(config.get<string>('MERCADOPAGO_MAX_INSTALLMENTS', '1')) || 1));
    this.transport = transport ?? this.defaultTransport();
  }

  private defaultTransport(): MercadoPagoTransport {
    return async (request) => {
      const response = await fetch(`${this.baseUrl}${request.path}`, { method: request.method, headers: request.headers, body: request.body, signal: AbortSignal.timeout(20_000) });
      return { status: response.status, body: await response.text() };
    };
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    if (!this.token) throw new ServiceUnavailableException('Credencial do Mercado Pago não configurada (MERCADOPAGO_ACCESS_TOKEN).');
    const headers: Record<string, string> = { accept: 'application/json', authorization: `Bearer ${this.token}` };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;
    let response: MercadoPagoResponse;
    try { response = await this.transport({ method, path, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw new ServiceUnavailableException('Não foi possível falar com o Mercado Pago. Tente novamente em instantes.'); }
    if (response.status < 200 || response.status >= 300) {
      if (response.status === 401 || response.status === 403) throw new ServiceUnavailableException('O Mercado Pago recusou a credencial. Confira MERCADOPAGO_ACCESS_TOKEN.');
      throw new ServiceUnavailableException(`Mercado Pago respondeu HTTP ${response.status}.`);
    }
    try { return JSON.parse(response.body) as T; } catch { throw new ServiceUnavailableException('Resposta inválida do Mercado Pago.'); }
  }

  async createCharge(input: CreateChargeInput): Promise<CreatedCharge> {
    if (input.method !== 'cartao') throw new BadRequestException('O Mercado Pago está habilitado só para cartão.');
    if (input.value < this.minAmount) throw new BadRequestException(`O valor mínimo para pagamento no cartão é R$ ${this.minAmount.toFixed(2).replace('.', ',')}.`);
    const site = (this.config.get<string>('APP_PUBLIC_URL', '') || this.config.get<string>('WEB_ORIGIN', '')).replace(/\/$/, '');
    const api = (this.config.get<string>('PUBLIC_API_URL', '') || site).replace(/\/$/, '');
    const back = input.returnPath && input.returnPath.startsWith('/') && !input.returnPath.startsWith('//') ? input.returnPath : '/minha-conta';
    const [firstName = '', ...rest] = input.customerName.trim().split(/\s+/);
    const preference = await this.call<{ id?: string; init_point?: string; sandbox_init_point?: string }>('POST', '/checkout/preferences', {
      items: [{ id: input.externalReference, title: input.description.slice(0, 120), quantity: 1, currency_id: 'BRL', unit_price: Number(input.value.toFixed(2)) }],
      payer: { name: firstName, surname: rest.join(' '), email: input.customerEmail, identification: { type: 'CPF', number: input.customerCpf } },
      external_reference: input.externalReference,
      ...(api ? { notification_url: `${api}/api/v1/webhooks/pagamento/${this.name}${this.webhookSecret ? `?token=${encodeURIComponent(this.webhookSecret)}` : ''}` } : {}),
      ...(site ? { back_urls: { success: `${site}${back}`, pending: `${site}${back}`, failure: `${site}${back}` }, auto_return: 'approved' } : {}),
      payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }, { id: 'bank_transfer' }, { id: 'account_money' }], installments: this.maxInstallments },
      binary_mode: true,
      statement_descriptor: 'BOLAO LIVRE',
      ...(input.expiresAt ? { expires: true, expiration_date_from: new Date().toISOString(), expiration_date_to: input.expiresAt.toISOString() } : {}),
    }, toIdempotencyKey(input.idempotencyKey ?? input.externalReference));
    const url = this.token.startsWith('TEST-') ? preference.sandbox_init_point ?? preference.init_point : preference.init_point;
    if (!preference.id || !url) throw new ServiceUnavailableException('O Mercado Pago não devolveu o link de pagamento.');
    return { provider: this.name, transactionId: `mp_${input.externalReference}`, status: 'pending', qrCode: null, checkoutUrl: url };
  }

  /** `data.id` vem no corpo (`{ type: 'payment', data: { id } }`) ou na URL (`?type=payment&data.id=…` / `?topic=payment&id=…`). */
  private paymentIdFrom(rawBody: string, query: Record<string, string | undefined>): string | null {
    let body: { type?: string; topic?: string; action?: string; data?: { id?: string | number } } = {};
    try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { body = {}; }
    const type = body.type ?? query.type ?? query.topic ?? (body.action ?? '').split('.')[0];
    if (type !== 'payment') return null;
    const id = body.data?.id ?? query['data.id'] ?? query.id;
    return id === undefined || id === '' ? null : String(id);
  }

  private verifySignature(headers: Record<string, string | undefined>, dataId: string): void {
    if (!this.signatureSecret) return;
    const signature = headers['x-signature'] ?? '';
    const parts = Object.fromEntries(signature.split(',').map((piece) => piece.trim().split('=') as [string, string]));
    const requestId = headers['x-request-id'] ?? '';
    if (!parts.ts || !parts.v1) throw new UnauthorizedException('Assinatura do Mercado Pago ausente.');
    const expected = createHmac('sha256', this.signatureSecret).update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`).digest('hex');
    if (!safeEqual(parts.v1, expected)) throw new UnauthorizedException('Assinatura do Mercado Pago inválida.');
  }

  async resolveWebhook(rawBody: string, headers: Record<string, string | undefined>, query: Record<string, string | undefined> = {}): Promise<PaymentWebhook | null> {
    if (!this.webhookSecret) throw new UnauthorizedException('Segredo de webhook não configurado.');
    if (!query.token || !safeEqual(query.token, this.webhookSecret)) throw new UnauthorizedException('Token de webhook inválido.');
    const paymentId = this.paymentIdFrom(rawBody, query);
    if (!paymentId) return null; // outros tópicos (ordens, estornos, etc.) não são pagamento
    this.verifySignature(headers, paymentId);
    // O aviso nunca é confiado: o estado vem da API do Mercado Pago.
    const payment = await this.call<MpPayment>('GET', `/v1/payments/${encodeURIComponent(paymentId)}`);
    return this.toWebhook(payment);
  }

  private toWebhook(payment: MpPayment): PaymentWebhook | null {
    if (!payment.external_reference) return null;
    return { transactionId: `mp_${payment.external_reference}`, status: mapMercadoPagoStatus(payment.status), paidAmount: payment.transaction_amount };
  }

  async fetchStatus(transactionId: string): Promise<{ status: ChargeStatus; paidAmount?: number }> {
    const reference = transactionId.replace(/^mp_/, '');
    const found = await this.call<{ results?: MpPayment[] }>('GET', `/v1/payments/search?external_reference=${encodeURIComponent(reference)}&sort=date_created&criteria=desc&limit=20`);
    const payments = found.results ?? [];
    const approved = payments.find((payment) => mapMercadoPagoStatus(payment.status) === 'confirmed');
    if (approved) return { status: 'confirmed', paidAmount: approved.transaction_amount };
    const refunded = payments.find((payment) => mapMercadoPagoStatus(payment.status) === 'refunded');
    if (refunded) return { status: 'refunded' };
    return { status: 'pending' }; // sem pagamento, recusado ou em análise: segue a reserva
  }
}

interface MpPayment { id?: number | string; status?: string; external_reference?: string; transaction_amount?: number }

/**
 * approved = pago. Recusa (rejected) NÃO libera a cota: no Checkout Pro o cliente pode tentar outro cartão
 * dentro da mesma cobrança, e a reserva expira sozinha. cancelled/expired encerram a cobrança.
 */
export function mapMercadoPagoStatus(status?: string): ChargeStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'approved': return 'confirmed';
    case 'refunded':
    case 'charged_back': return 'refunded';
    case 'cancelled': return 'failed';
    default: return 'pending'; // pending, in_process, authorized, in_mediation, rejected
  }
}

/* -------------------------------------------------------------------------- */
/* Asaas (mantido)                                                            */
/* -------------------------------------------------------------------------- */

export class AsaasProvider implements PaymentProvider {
  readonly name = 'asaas';
  readonly methods: ChargeMethod[] = ['pix'];
  readonly minAmount: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = config.get<string>('PAYMENT_API_KEY', '');
    this.baseUrl = config.get<string>('PAYMENT_API_BASE_URL', 'https://api-sandbox.asaas.com/api/v3').replace(/\/$/, '');
    this.webhookSecret = config.get<string>('PAYMENT_WEBHOOK_SECRET', '');
    this.minAmount = Number(config.get<string>('PAYMENT_MIN_AMOUNT', '0'));
  }

  async createCharge(input: CreateChargeInput): Promise<CreatedCharge> {
    if (!this.apiKey) throw new ServiceUnavailableException('Credencial do provedor de pagamento não configurada.');
    const customerResponse = await fetch(`${this.baseUrl}/customers`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ name: input.customerName, cpfCnpj: input.customerCpf, email: input.customerEmail }),
    });
    if (!customerResponse.ok) throw new ServiceUnavailableException(`Falha ao criar cliente no provedor: HTTP ${customerResponse.status}`);
    const customer = await customerResponse.json() as { id?: string };
    if (!customer.id) throw new ServiceUnavailableException('Provedor não retornou o identificador do cliente.');
    const paymentResponse = await fetch(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ customer: customer.id, billingType: 'PIX', value: input.value, dueDate: input.dueDate, description: input.description, externalReference: input.externalReference }),
    });
    if (!paymentResponse.ok) throw new ServiceUnavailableException(`Falha ao criar cobrança Pix: HTTP ${paymentResponse.status}`);
    const payment = await paymentResponse.json() as { id?: string; status?: string; invoiceUrl?: string };
    if (!payment.id) throw new ServiceUnavailableException('Provedor não retornou o identificador da cobrança.');
    const qrResponse = await fetch(`${this.baseUrl}/payments/${payment.id}/pixQrCode`, { headers: this.headers() });
    const qr = qrResponse.ok ? await qrResponse.json() as { payload?: string } : {};
    return { provider: this.name, transactionId: payment.id, status: payment.status === 'RECEIVED' ? 'confirmed' : 'pending', qrCode: qr.payload ?? payment.invoiceUrl ?? null };
  }

  async resolveWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<PaymentWebhook | null> {
    if (!this.webhookSecret) throw new UnauthorizedException('Segredo de webhook não configurado.');
    const presented = headers['asaas-access-token'] ?? headers['x-webhook-signature'];
    const expected = headers['asaas-access-token'] ? this.webhookSecret : createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    if (!presented || !safeEqual(presented, expected)) throw new UnauthorizedException('Assinatura de webhook inválida.');
    const payload = JSON.parse(rawBody) as { event?: string; payment?: { id?: string; value?: number } };
    if (!payload.payment?.id) throw new UnauthorizedException('Webhook sem identificador de pagamento.');
    const statuses: Record<string, ChargeStatus> = { PAYMENT_RECEIVED: 'confirmed', PAYMENT_CONFIRMED: 'confirmed', PAYMENT_REFUNDED: 'refunded', PAYMENT_DELETED: 'failed' };
    const status = statuses[payload.event ?? ''];
    // Creation, update and overdue events are not cancellations.
    if (!status) return null;
    if (status === 'confirmed' && (!Number.isFinite(payload.payment.value) || payload.payment.value! <= 0)) throw new UnauthorizedException('Webhook sem valor válido.');
    return { transactionId: payload.payment.id, status, paidAmount: payload.payment.value };
  }

  private headers(): Record<string, string> {
    return { accept: 'application/json', 'content-type': 'application/json', access_token: this.apiKey };
  }
}

/* -------------------------------------------------------------------------- */
/* Teste / desabilitado (mantidos)                                            */
/* -------------------------------------------------------------------------- */

export class TestPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly methods: ChargeMethod[] = ['pix', 'boleto'];
  readonly minAmount = 0;

  constructor(private readonly config: ConfigService) {
    if (config.get<string>('PAYMENT_TEST_MODE', 'false') !== 'true') {
      throw new ServiceUnavailableException('O provedor de teste exige PAYMENT_TEST_MODE=true.');
    }
  }

  async createCharge(input: CreateChargeInput): Promise<CreatedCharge> {
    const transactionId = `test_${input.externalReference}`;
    return {
      provider: this.name,
      transactionId,
      status: 'pending',
      qrCode: `PIX-TESTE-BL-${transactionId}`,
      ...(input.method === 'boleto' ? { boleto: { digitableLine: '00000.00000 00000.000000 00000.000000 0 00000000000000', barcode: '00000000000000000000000000000000000000000000', url: null } } : {}),
    };
  }

  async resolveWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<PaymentWebhook | null> {
    const secret = this.config.get<string>('PAYMENT_WEBHOOK_SECRET', '');
    const presented = headers['x-webhook-signature'];
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!secret || !presented || !safeEqual(presented, expected)) {
      throw new UnauthorizedException('Assinatura de webhook de teste inválida.');
    }
    const payload = JSON.parse(rawBody) as { transactionId?: string; status?: string; paidAmount?: number };
    if (!payload.transactionId || !['confirmed', 'failed', 'refunded'].includes(payload.status ?? '')) throw new UnauthorizedException('Evento de teste inválido.');
    return { transactionId: payload.transactionId, status: payload.status as ChargeStatus, paidAmount: payload.paidAmount };
  }
}

export class DisabledPaymentProvider implements PaymentProvider {
  readonly name = 'disabled';
  readonly methods: ChargeMethod[] = [];
  readonly minAmount = 0;

  async createCharge(): Promise<CreatedCharge> {
    throw new ServiceUnavailableException('Os pagamentos estão temporariamente indisponíveis.');
  }

  async resolveWebhook(): Promise<PaymentWebhook | null> {
    throw new ServiceUnavailableException('Webhooks de pagamento indisponíveis: provedor não configurado.');
  }
}

/** Provedor opcional do cartão (CARD_PAYMENT_PROVIDER=mercadopago). Vazio = cartão desligado. */
export function buildCardProvider(config: ConfigService): PaymentProvider | null {
  const provider = (config.get<string>('CARD_PAYMENT_PROVIDER', '') || '').trim().toLowerCase();
  if (!provider) return null;
  if (provider === 'mercadopago') return new MercadoPagoProvider(config);
  throw new ServiceUnavailableException(`Provedor de cartão não suportado: ${provider}`);
}

export function buildPaymentProvider(config: ConfigService): PaymentProvider {
  const provider = config.get<string>('PAYMENT_PROVIDER', 'disabled');
  if (provider === 'disabled') return new DisabledPaymentProvider();
  if (provider === 'cora') return new CoraProvider(config);
  if (provider === 'asaas') return new AsaasProvider(config);
  if (provider === 'mock') return new TestPaymentProvider(config);
  throw new ServiceUnavailableException(`Provedor de pagamento não suportado: ${provider}`);
}
