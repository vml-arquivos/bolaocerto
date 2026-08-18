import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

export interface CreatePixPaymentInput {
  externalReference: string;
  value: number;
  customerName: string;
  customerCpf: string;
  customerEmail: string;
  description: string;
}

export interface CreatedPixPayment {
  provider: string;
  transactionId: string;
  status: 'pending' | 'confirmed';
  qrCode: string | null;
}

export interface PaymentWebhook {
  transactionId: string;
  status: 'confirmed' | 'failed' | 'refunded';
}

export interface PaymentProvider {
  createPixPayment(input: CreatePixPaymentInput): Promise<CreatedPixPayment>;
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): PaymentWebhook;
}

export class AsaasProvider implements PaymentProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = config.get<string>('PAYMENT_API_KEY', '');
    this.baseUrl = config.get<string>('PAYMENT_API_BASE_URL', 'https://api-sandbox.asaas.com/api/v3').replace(/\/$/, '');
    this.webhookSecret = config.get<string>('PAYMENT_WEBHOOK_SECRET', '');
  }

  async createPixPayment(input: CreatePixPaymentInput): Promise<CreatedPixPayment> {
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
      body: JSON.stringify({ customer: customer.id, billingType: 'PIX', value: input.value, dueDate: new Date().toISOString().slice(0, 10), description: input.description, externalReference: input.externalReference }),
    });
    if (!paymentResponse.ok) throw new ServiceUnavailableException(`Falha ao criar cobrança Pix: HTTP ${paymentResponse.status}`);
    const payment = await paymentResponse.json() as { id?: string; status?: string; invoiceUrl?: string };
    if (!payment.id) throw new ServiceUnavailableException('Provedor não retornou o identificador da cobrança.');
    const qrResponse = await fetch(`${this.baseUrl}/payments/${payment.id}/pixQrCode`, { headers: this.headers() });
    const qr = qrResponse.ok ? await qrResponse.json() as { payload?: string } : {};
    return { provider: 'asaas', transactionId: payment.id, status: payment.status === 'RECEIVED' ? 'confirmed' : 'pending', qrCode: qr.payload ?? payment.invoiceUrl ?? null };
  }

  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): PaymentWebhook {
    if (!this.webhookSecret) throw new UnauthorizedException('Segredo de webhook não configurado.');
    const presented = headers['asaas-access-token'] ?? headers['x-webhook-signature'];
    const expected = headers['asaas-access-token'] ? this.webhookSecret : createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    if (!presented || presented.length !== expected.length || !timingSafeEqual(Buffer.from(presented), Buffer.from(expected))) throw new UnauthorizedException('Assinatura de webhook inválida.');
    const payload = JSON.parse(rawBody) as { event?: string; payment?: { id?: string } };
    if (!payload.payment?.id) throw new UnauthorizedException('Webhook sem identificador de pagamento.');
    const status = payload.event === 'PAYMENT_RECEIVED' || payload.event === 'PAYMENT_CONFIRMED' ? 'confirmed' : payload.event === 'PAYMENT_REFUNDED' ? 'refunded' : 'failed';
    return { transactionId: payload.payment.id, status };
  }

  private headers(): Record<string, string> {
    return { accept: 'application/json', 'content-type': 'application/json', access_token: this.apiKey };
  }
}

export function buildPaymentProvider(config: ConfigService): PaymentProvider {
  const provider = config.get<string>('PAYMENT_PROVIDER', 'asaas');
  if (provider === 'asaas') return new AsaasProvider(config);
  throw new ServiceUnavailableException(`Provedor de pagamento não suportado: ${provider}`);
}
