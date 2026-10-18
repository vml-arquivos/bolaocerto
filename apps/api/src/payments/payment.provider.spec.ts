import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoraProvider, CoraTransportRequest, mapCoraStatus, toIdempotencyKey } from './payment.provider';

function config(values: Record<string, string>): ConfigService {
  return { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback ?? '') } as unknown as ConfigService;
}

const BASE = { CORA_CLIENT_ID: 'int-abc', CORA_ENV: 'stage' };
const UUID = '2d4f1c8e-7a53-4a7e-9d9b-0f3a1c5b6e21';

function transport(handlers: (request: CoraTransportRequest) => { status: number; body: unknown }) {
  const calls: CoraTransportRequest[] = [];
  const fn = jest.fn(async (request: CoraTransportRequest) => {
    calls.push(request);
    const result = handlers(request);
    return { status: result.status, body: typeof result.body === 'string' ? result.body : JSON.stringify(result.body) };
  });
  return { fn, calls };
}

const token = { status: 200, body: { access_token: 'tok', expires_in: 86400 } };

describe('CoraProvider', () => {
  it('autentica via client_credentials e reutiliza o token', async () => {
    const t = transport((request) => (request.path === '/token' ? token : { status: 200, body: { id: 'inv_1', status: 'OPEN', pix: { emv: '000201' } } }));
    const provider = new CoraProvider(config(BASE), t.fn);
    const input = { externalReference: UUID, method: 'pix' as const, value: 10, dueDate: '2026-10-20', customerName: 'Maria', customerCpf: '123.456.789-09', customerEmail: 'm@x.com', description: 'Cota' };
    await provider.createCharge(input);
    await provider.createCharge({ ...input, idempotencyKey: '11111111-1111-4111-8111-111111111111' });
    const tokenCalls = t.calls.filter((call) => call.path === '/token');
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]?.body).toBe('grant_type=client_credentials&client_id=int-abc');
    expect(tokenCalls[0]?.headers['content-type']).toBe('application/x-www-form-urlencoded');
  });

  it('cria cobrança Pix em centavos, com idempotência e retorna o copia e cola', async () => {
    const t = transport((request) => (request.path === '/token' ? token : { status: 201, body: { id: 'inv_pix', status: 'OPEN', pix: { emv: '00020126' }, payment_options: { bank_slip: { url: 'https://qr/png' } } } }));
    const provider = new CoraProvider(config(BASE), t.fn);
    const charge = await provider.createCharge({ externalReference: UUID, method: 'pix', value: 12.5, dueDate: '2026-10-20', customerName: 'Maria da Silva', customerCpf: '123.456.789-09', customerEmail: 'm@x.com', description: 'Cota de bolão' });
    const request = t.calls.find((call) => call.path === '/v2/invoices') as CoraTransportRequest;
    const body = JSON.parse(request.body as string);
    expect(request.headers['idempotency-key']).toBe(UUID);
    expect(request.headers.authorization).toBe('Bearer tok');
    expect(body.payment_forms).toEqual(['PIX']);
    expect(body.services[0].amount).toBe(1250);
    expect(body.payment_terms.due_date).toBe('2026-10-20');
    expect(body.customer.document).toEqual({ identity: '12345678909', type: 'CPF' });
    expect(charge).toMatchObject({ transactionId: 'inv_pix', status: 'pending', qrCode: '00020126', qrCodeUrl: 'https://qr/png' });
  });

  it('cria boleto com Pix e extrai linha digitável e código de barras', async () => {
    const t = transport((request) => (request.path === '/token' ? token : { status: 200, body: { id: 'inv_bol', status: 'OPEN', pix: { emv: 'EMV' }, payment_options: { bank_slip: { url: 'https://boleto.pdf', barcode: '111', digitable: '222' } } } }));
    const provider = new CoraProvider(config(BASE), t.fn);
    const charge = await provider.createCharge({ externalReference: UUID, method: 'boleto', value: 30, dueDate: '2026-10-22', customerName: 'João', customerCpf: '12345678909', customerEmail: '', description: 'Cota' });
    const body = JSON.parse((t.calls.find((call) => call.path === '/v2/invoices') as CoraTransportRequest).body as string);
    expect(body.payment_forms).toEqual(['BANK_SLIP', 'PIX']);
    expect(body.customer.email).toBeUndefined();
    expect(charge.boleto).toEqual({ digitableLine: '222', barcode: '111', url: 'https://boleto.pdf' });
    expect(charge.qrCode).toBe('EMV');
  });

  it('recusa valor abaixo do mínimo de R$ 5,00', async () => {
    const provider = new CoraProvider(config(BASE), transport(() => token).fn);
    await expect(provider.createCharge({ externalReference: UUID, method: 'pix', value: 4.99, dueDate: '2026-10-20', customerName: 'A', customerCpf: '1', customerEmail: '', description: 'x' })).rejects.toThrow('valor mínimo');
  });

  it('renova o token quando a API responde 401', async () => {
    let invoiceCalls = 0;
    const t = transport((request) => {
      if (request.path === '/token') return token;
      invoiceCalls += 1;
      return invoiceCalls === 1 ? { status: 401, body: {} } : { status: 200, body: { id: 'inv_2', status: 'PAID', total_paid: 1500 } };
    });
    const provider = new CoraProvider(config(BASE), t.fn);
    const status = await provider.fetchStatus('inv_2');
    expect(status).toEqual({ status: 'confirmed', paidAmount: 15 });
    expect(t.calls.filter((call) => call.path === '/token')).toHaveLength(2);
  });

  it('webhook confirma o estado na API da Cora antes de aceitar', async () => {
    const t = transport((request) => (request.path === '/token' ? token : { status: 200, body: { id: 'inv_9', status: 'PAID', total_paid: 2000 } }));
    const provider = new CoraProvider(config({ ...BASE, PAYMENT_WEBHOOK_SECRET: 's3cret' }), t.fn);
    const event = await provider.resolveWebhook('', { 'webhook-resource-id': 'inv_9', 'webhook-event-type': 'invoice.paid' }, { token: 's3cret' });
    expect(event).toEqual({ transactionId: 'inv_9', status: 'confirmed', paidAmount: 20 });
    expect(t.calls.some((call) => call.method === 'GET' && call.path === '/v2/invoices/inv_9')).toBe(true);
  });

  it('webhook sem token válido é rejeitado e eventos alheios são ignorados', async () => {
    const t = transport((request) => (request.path === '/token' ? token : { status: 200, body: {} }));
    const provider = new CoraProvider(config({ ...BASE, PAYMENT_WEBHOOK_SECRET: 's3cret' }), t.fn);
    await expect(provider.resolveWebhook('', { 'webhook-resource-id': 'inv_9', 'webhook-event-type': 'invoice.paid' }, { token: 'errado' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await provider.resolveWebhook('', { 'webhook-resource-id': 'x', 'webhook-event-type': 'transfer.done' }, { token: 's3cret' })).toBeNull();
  });

  it('cancela cobrança com DELETE e ignora 404', async () => {
    const t = transport((request) => (request.path === '/token' ? token : { status: 404, body: {} }));
    const provider = new CoraProvider(config(BASE), t.fn);
    await expect(provider.cancelCharge('inv_x')).resolves.toBeUndefined();
    expect(t.calls.some((call) => call.method === 'DELETE' && call.path === '/v2/invoices/inv_x')).toBe(true);
  });

  it('mapeia status e gera chave de idempotência estável', () => {
    expect(mapCoraStatus('PAID')).toBe('confirmed');
    expect(mapCoraStatus('CANCELLED')).toBe('failed');
    expect(mapCoraStatus('LATE')).toBe('pending');
    expect(toIdempotencyKey(UUID)).toBe(UUID);
    expect(toIdempotencyKey('abc')).toBe(toIdempotencyKey('abc'));
    expect(toIdempotencyKey('abc')).toMatch(/^[0-9a-f-]{36}$/);
  });
});
