import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { buildCardProvider, MercadoPagoProvider, MercadoPagoRequest, mapMercadoPagoStatus } from './payment.provider';

function config(values: Record<string, string>): ConfigService {
  return { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback ?? '') } as unknown as ConfigService;
}
const BASE = { MERCADOPAGO_ACCESS_TOKEN: 'APP_USR-segredo', PAYMENT_WEBHOOK_SECRET: 'tok123', PUBLIC_API_URL: 'https://bolaolivre.com', APP_PUBLIC_URL: 'https://bolaolivre.com' };
const CHARGE = { externalReference: '2d4f1c8e-7a53-4a7e-9d9b-0f3a1c5b6e21', method: 'cartao' as const, value: 50, dueDate: '2026-11-04', customerName: 'Maria da Silva Souza', customerCpf: '52998224725', customerEmail: 'maria@exemplo.com', description: 'Cota de bolão megasena abc12345' };

function transport(handler: (request: MercadoPagoRequest) => { status: number; body: unknown }) {
  const calls: MercadoPagoRequest[] = [];
  const fn = jest.fn(async (request: MercadoPagoRequest) => { calls.push(request); const r = handler(request); return { status: r.status, body: JSON.stringify(r.body) }; });
  return { fn, calls };
}

describe('MercadoPagoProvider — criar cobrança no cartão', () => {
  it('cria a preferência só com cartão, com referência, aviso, retorno, expiração e chave de repetição', async () => {
    const t = transport(() => ({ status: 201, body: { id: 'pref-1', init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1', sandbox_init_point: 'https://sandbox.example/x' } }));
    const provider = new MercadoPagoProvider(config(BASE), t.fn);
    const expiresAt = new Date('2026-11-04T15:00:00.000Z');
    const created = await provider.createCharge({ ...CHARGE, expiresAt });
    expect(created).toEqual({ provider: 'mercadopago', transactionId: `mp_${CHARGE.externalReference}`, status: 'pending', qrCode: null, checkoutUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1' });
    const call = t.calls[0]!;
    expect(call.method).toBe('POST'); expect(call.path).toBe('/checkout/preferences');
    expect(call.headers.authorization).toBe('Bearer APP_USR-segredo');
    expect(call.headers['x-idempotency-key']).toBe(CHARGE.externalReference);
    const body = JSON.parse(call.body!);
    expect(body.items).toEqual([{ id: CHARGE.externalReference, title: CHARGE.description, quantity: 1, currency_id: 'BRL', unit_price: 50 }]);
    expect(body.external_reference).toBe(CHARGE.externalReference);
    expect(body.notification_url).toBe('https://bolaolivre.com/api/v1/webhooks/pagamento/mercadopago?token=tok123');
    expect(body.back_urls.success).toBe('https://bolaolivre.com/minha-conta'); expect(body.auto_return).toBe('approved');
    expect(body.payment_methods.excluded_payment_types).toEqual(expect.arrayContaining([{ id: 'ticket' }, { id: 'bank_transfer' }, { id: 'atm' }, { id: 'account_money' }]));
    expect(body.payment_methods.installments).toBe(1);
    expect(body.binary_mode).toBe(true);
    expect(body.expires).toBe(true); expect(body.expiration_date_to).toBe(expiresAt.toISOString());
    expect(body.payer).toMatchObject({ name: 'Maria', surname: 'da Silva Souza', email: 'maria@exemplo.com', identification: { type: 'CPF', number: '52998224725' } });
  });
  it('usa o link de teste quando a credencial é TEST-', async () => {
    const t = transport(() => ({ status: 201, body: { id: 'p', init_point: 'https://prod', sandbox_init_point: 'https://sandbox' } }));
    const provider = new MercadoPagoProvider(config({ ...BASE, MERCADOPAGO_ACCESS_TOKEN: 'TEST-123' }), t.fn);
    expect((await provider.createCharge(CHARGE)).checkoutUrl).toBe('https://sandbox');
  });
  it('limita as parcelas ao configurado (1 a 12)', async () => {
    const t = transport(() => ({ status: 201, body: { id: 'p', init_point: 'https://prod' } }));
    await new MercadoPagoProvider(config({ ...BASE, MERCADOPAGO_MAX_INSTALLMENTS: '3' }), t.fn).createCharge(CHARGE);
    expect(JSON.parse(t.calls[0]!.body!).payment_methods.installments).toBe(3);
    await new MercadoPagoProvider(config({ ...BASE, MERCADOPAGO_MAX_INSTALLMENTS: '99' }), t.fn).createCharge(CHARGE);
    expect(JSON.parse(t.calls[1]!.body!).payment_methods.installments).toBe(12);
  });
  it('só aceita cartão e respeita o valor mínimo', async () => {
    const provider = new MercadoPagoProvider(config(BASE), transport(() => ({ status: 201, body: {} })).fn);
    await expect(provider.createCharge({ ...CHARGE, method: 'pix' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(provider.createCharge({ ...CHARGE, value: 4.9 })).rejects.toThrow(/mínimo/);
  });
  it('sem credencial, credencial recusada ou resposta sem link viram erro claro', async () => {
    await expect(new MercadoPagoProvider(config({ ...BASE, MERCADOPAGO_ACCESS_TOKEN: '' }), transport(() => ({ status: 200, body: {} })).fn).createCharge(CHARGE)).rejects.toThrow(/não configurada/);
    await expect(new MercadoPagoProvider(config(BASE), transport(() => ({ status: 401, body: {} })).fn).createCharge(CHARGE)).rejects.toThrow(/recusou a credencial/);
    await expect(new MercadoPagoProvider(config(BASE), transport(() => ({ status: 201, body: { id: 'x' } })).fn).createCharge(CHARGE)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('MercadoPagoProvider — aviso de pagamento', () => {
  const paymentOf = (status: string) => ({ id: 987, status, external_reference: CHARGE.externalReference, transaction_amount: 50 });
  const notice = JSON.stringify({ type: 'payment', action: 'payment.updated', data: { id: '987' } });
  it('exige o token do endereço de aviso', async () => {
    const provider = new MercadoPagoProvider(config(BASE), transport(() => ({ status: 200, body: paymentOf('approved') })).fn);
    await expect(provider.resolveWebhook(notice, {}, {})).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(provider.resolveWebhook(notice, {}, { token: 'errado' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('não confia no aviso: consulta o pagamento e confirma pelo valor da API', async () => {
    const t = transport(() => ({ status: 200, body: paymentOf('approved') }));
    const provider = new MercadoPagoProvider(config(BASE), t.fn);
    const event = await provider.resolveWebhook(notice, {}, { token: 'tok123' });
    expect(t.calls[0]!.path).toBe('/v1/payments/987');
    expect(event).toEqual({ transactionId: `mp_${CHARGE.externalReference}`, status: 'confirmed', paidAmount: 50 });
  });
  it('lê o aviso também pela URL (data.id / topic+id) e ignora outros assuntos', async () => {
    const t = transport(() => ({ status: 200, body: paymentOf('approved') }));
    const provider = new MercadoPagoProvider(config(BASE), t.fn);
    await provider.resolveWebhook('', {}, { token: 'tok123', type: 'payment', 'data.id': '555' });
    expect(t.calls[0]!.path).toBe('/v1/payments/555');
    await provider.resolveWebhook('', {}, { token: 'tok123', topic: 'payment', id: '556' });
    expect(t.calls[1]!.path).toBe('/v1/payments/556');
    expect(await provider.resolveWebhook(JSON.stringify({ type: 'merchant_order', data: { id: '1' } }), {}, { token: 'tok123' })).toBeNull();
    expect(t.calls).toHaveLength(2);
  });
  it('valida a assinatura quando MERCADOPAGO_SIGNATURE_SECRET está definido', async () => {
    const t = transport(() => ({ status: 200, body: paymentOf('approved') }));
    const provider = new MercadoPagoProvider(config({ ...BASE, MERCADOPAGO_SIGNATURE_SECRET: 'chave' }), t.fn);
    const ts = '1730700000'; const requestId = 'req-1';
    const v1 = createHmac('sha256', 'chave').update(`id:987;request-id:${requestId};ts:${ts};`).digest('hex');
    await expect(provider.resolveWebhook(notice, { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId }, { token: 'tok123' })).resolves.toMatchObject({ status: 'confirmed' });
    await expect(provider.resolveWebhook(notice, { 'x-signature': `ts=${ts},v1=${'0'.repeat(64)}`, 'x-request-id': requestId }, { token: 'tok123' })).rejects.toThrow(/inválida/);
    await expect(provider.resolveWebhook(notice, {}, { token: 'tok123' })).rejects.toThrow(/ausente/);
  });
  it('pagamento sem referência do BL é ignorado', async () => {
    const provider = new MercadoPagoProvider(config(BASE), transport(() => ({ status: 200, body: { id: 1, status: 'approved' } })).fn);
    expect(await provider.resolveWebhook(notice, {}, { token: 'tok123' })).toBeNull();
  });
});

describe('MercadoPagoProvider — conferência e estados', () => {
  it('mapeia os estados: recusado NÃO libera a cota', () => {
    expect(mapMercadoPagoStatus('approved')).toBe('confirmed');
    expect(mapMercadoPagoStatus('refunded')).toBe('refunded');
    expect(mapMercadoPagoStatus('charged_back')).toBe('refunded');
    expect(mapMercadoPagoStatus('cancelled')).toBe('failed');
    for (const status of ['pending', 'in_process', 'authorized', 'in_mediation', 'rejected', undefined]) expect(mapMercadoPagoStatus(status)).toBe('pending');
  });
  it('fetchStatus procura pela referência e acha o pagamento aprovado entre as tentativas', async () => {
    const t = transport(() => ({ status: 200, body: { results: [{ status: 'rejected', transaction_amount: 50 }, { status: 'approved', transaction_amount: 50 }] } }));
    const provider = new MercadoPagoProvider(config(BASE), t.fn);
    expect(await provider.fetchStatus(`mp_${CHARGE.externalReference}`)).toEqual({ status: 'confirmed', paidAmount: 50 });
    expect(t.calls[0]!.path).toContain(`external_reference=${CHARGE.externalReference}`);
  });
  it('fetchStatus: só recusas ou nenhuma tentativa segue pendente; estorno é reconhecido', async () => {
    const only = (results: unknown[]) => new MercadoPagoProvider(config(BASE), transport(() => ({ status: 200, body: { results } })).fn);
    expect(await only([{ status: 'rejected' }]).fetchStatus('mp_x')).toEqual({ status: 'pending' });
    expect(await only([]).fetchStatus('mp_x')).toEqual({ status: 'pending' });
    expect(await only([{ status: 'refunded' }]).fetchStatus('mp_x')).toEqual({ status: 'refunded' });
  });
});

describe('buildCardProvider', () => {
  it('vazio = cartão desligado; mercadopago liga; outro nome é erro', () => {
    expect(buildCardProvider(config({}))).toBeNull();
    expect(buildCardProvider(config({ CARD_PAYMENT_PROVIDER: ' MercadoPago ', ...BASE }))?.name).toBe('mercadopago');
    expect(() => buildCardProvider(config({ CARD_PAYMENT_PROVIDER: 'x' }))).toThrow(/não suportado/);
  });
});
