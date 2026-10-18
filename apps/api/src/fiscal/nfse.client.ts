import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

export type FiscalHttp = (method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, idempotencyKey?: string) => Promise<{ status: number; body: string }>;

export type ReceiptStatus = 'aguardando' | 'aguardando_certificado' | 'emitida' | 'erro';

export interface ReceiptAddress { street: string; number: string; district: string; city: string; state: string; zip_code: string; complement?: string }

export interface ReceiptEmitInput {
  chargeId: string;
  email: string;
  address: ReceiptAddress;
  /** Alíquota do ISS em porcentagem (5 = 5%). */
  issPct: number;
  issWithheld?: boolean;
  description?: string;
  cnae?: string;
  serviceCode?: string;
  municipalTaxCode?: string;
}

export interface ReceiptInfo { id: string; status: ReceiptStatus; pdf: string | null; xml: string | null; number: string | null }

export interface IssuerInput {
  municipalRegister: string;
  stateRegister?: string;
  taxRegime: string;
  specialTaxRegime: string;
  rpsSerial: string;
  rpsLastNumber: string;
}

const RECEIPT_ID = /^[A-Za-z0-9_-]{4,100}$/;

/** Status da Cora -> status interno. WAITING_TRIGGER = aguardando o pagamento da cobrança vinculada. */
export function mapReceiptStatus(status?: string): ReceiptStatus {
  switch (status) {
    case 'COMPLETED': return 'emitida';
    case 'WAITING_CERTIFICATE': return 'aguardando_certificado';
    case 'ERROR': return 'erro';
    default: return 'aguardando';
  }
}

/** Corpo do POST /fiscal-receipts/service-receipt (campos conforme a referência da Cora). */
export function buildReceiptBody(input: ReceiptEmitInput) {
  return {
    receivable: { id: input.chargeId, type: 'INVOICE' },
    fiscal_receipt: {
      type: 'NFSE',
      ...(input.cnae ? { cnae: input.cnae } : {}),
      ...(input.serviceCode ? { service_code: input.serviceCode } : {}),
      ...(input.municipalTaxCode ? { municipal_tax_code: input.municipalTaxCode } : {}),
      ...(input.description ? { description: input.description } : {}),
      customer: { email: input.email, address: { ...input.address, complement: input.address.complement || undefined } },
      tax: { iss: { value: String(Math.round(input.issPct * 100)), ...(input.issWithheld === undefined ? {} : { withheld: String(input.issWithheld) }) } },
    },
  };
}

function json(body: string): Record<string, unknown> {
  try { return JSON.parse(body) as Record<string, unknown>; } catch { return {}; }
}

function brief(body: string): string {
  return body.replace(/[\r\n]+/g, ' ').slice(0, 220);
}

/** Cliente da API de Nota Fiscal de Serviço da Cora (beta). */
export class CoraFiscalClient {
  constructor(private readonly http: FiscalHttp) {}

  private fail(action: string, status: number, body: string): never {
    const detail = brief(body);
    if (status === 400 || status === 409 || status === 422) throw new BadRequestException(`A Cora recusou ${action} (HTTP ${status}). ${detail}`);
    throw new ServiceUnavailableException(`Falha ao ${action} na Cora (HTTP ${status}). ${detail}`);
  }

  async checkAvailability(): Promise<boolean> {
    const response = await this.http('GET', '/fiscal-receipts/businesses/check-availability');
    if (response.status !== 200) this.fail('consultar a disponibilidade de NFS-e', response.status, response.body);
    return json(response.body).is_available === true;
  }

  async cnaes(): Promise<{ main: { code: string; description: string } | null; secondary: Array<{ code: string; description: string }> }> {
    const response = await this.http('GET', '/fiscal-receipts/businesses/cnaes');
    if (response.status !== 200) this.fail('consultar os CNAEs', response.status, response.body);
    const data = json(response.body) as { main?: { code: string; description: string }; secondary?: Array<{ code: string; description: string }> };
    return { main: data.main ?? null, secondary: data.secondary ?? [] };
  }

  async serviceCodes(): Promise<Array<{ code: string; description: string }>> {
    const response = await this.http('GET', '/fiscal-receipts/businesses/service-codes');
    if (response.status !== 200) this.fail('consultar os códigos de serviço', response.status, response.body);
    const parsed: unknown = (() => { try { return JSON.parse(response.body); } catch { return []; } })();
    const list = Array.isArray(parsed) ? parsed : ((parsed as { items?: unknown[]; data?: unknown[] }).items ?? (parsed as { data?: unknown[] }).data ?? []);
    return (list as Array<{ code: string; description: string }>).filter((item) => item && typeof item.code === 'string');
  }

  async registerIssuer(input: IssuerInput): Promise<void> {
    const response = await this.http('POST', '/fiscal-receipts/issuer', {
      municipal_register: input.municipalRegister,
      ...(input.stateRegister ? { state_register: input.stateRegister } : {}),
      tax_regime: input.taxRegime,
      special_tax_regime: input.specialTaxRegime,
      rps: { last_number: input.rpsLastNumber, serial: input.rpsSerial },
    });
    if (response.status < 200 || response.status >= 300) this.fail('cadastrar o emissor de NFS-e', response.status, response.body);
  }

  async emit(input: ReceiptEmitInput, idempotencyKey: string): Promise<{ id: string; status: ReceiptStatus }> {
    const response = await this.http('POST', '/fiscal-receipts/service-receipt', buildReceiptBody(input), idempotencyKey);
    if (response.status < 200 || response.status >= 300) this.fail('emitir a NFS-e', response.status, response.body);
    const data = json(response.body);
    const id = [data.id, data.service_receipt_id, data.receipt_id].find((value): value is string => typeof value === 'string' && RECEIPT_ID.test(value));
    if (!id) throw new ServiceUnavailableException('A Cora aceitou a emissão, mas não retornou o identificador da nota.');
    return { id, status: mapReceiptStatus(typeof data.status === 'string' ? data.status : typeof data.trigger === 'string' ? data.trigger : undefined) };
  }

  async get(id: string): Promise<ReceiptInfo> {
    if (!RECEIPT_ID.test(id)) throw new BadRequestException('Identificador de NFS-e inválido.');
    let response = await this.http('GET', `/fiscal-receipt-api/service-receipt/${id}`);
    if (response.status === 404) response = await this.http('GET', `/fiscal-receipts/service-receipt/${id}`);
    if (response.status !== 200) this.fail('consultar a NFS-e', response.status, response.body);
    const data = json(response.body);
    const text = (value: unknown) => (typeof value === 'string' && value ? value : null);
    return {
      id,
      status: mapReceiptStatus(typeof data.status === 'string' ? data.status : undefined),
      pdf: text(data.pdf),
      xml: text(data.xml),
      number: text(data.number) ?? text(data.invoice_number) ?? text(data.nfse_number),
    };
  }

  async cancel(id: string): Promise<void> {
    if (!RECEIPT_ID.test(id)) throw new BadRequestException('Identificador de NFS-e inválido.');
    const response = await this.http('DELETE', `/fiscal-receipts/service-receipt/${id}`);
    if (response.status < 200 || response.status >= 300) this.fail('cancelar a NFS-e (algumas cidades só permitem cancelar no portal da prefeitura)', response.status, response.body);
  }
}
