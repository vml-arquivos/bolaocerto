import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, StatusCota, StatusPagamento } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { PaymentProvider } from './payment.provider';

const config = { get: jest.fn((key: string, fallback?: string) => ({ PAYMENTS_ENABLED: 'true', PUBLIC_API_URL: 'https://bolaolivre.com' } as Record<string, string>)[key] ?? fallback ?? '') } as unknown as ConfigService;
const user = { id: 'u1', email: 'u@x.com', papel: 'cotista' } as const;

function providers() {
  const cora = { name: 'cora', methods: ['pix', 'boleto'], minAmount: 5, createCharge: jest.fn().mockResolvedValue({ provider: 'cora', transactionId: 'inv_1', status: 'pending', qrCode: 'PIX' }), resolveWebhook: jest.fn().mockResolvedValue({ transactionId: 'inv_1', status: 'pending' }), fetchStatus: jest.fn().mockResolvedValue({ status: 'pending' }) };
  const card = { name: 'mercadopago', methods: ['cartao'], minAmount: 5, createCharge: jest.fn().mockResolvedValue({ provider: 'mercadopago', transactionId: 'mp_pay-1', status: 'pending', qrCode: null, checkoutUrl: 'https://mp/checkout' }), resolveWebhook: jest.fn().mockResolvedValue({ transactionId: 'mp_pay-1', status: 'pending' }), fetchStatus: jest.fn().mockResolvedValue({ status: 'pending' }) };
  return { cora: cora as unknown as PaymentProvider & typeof cora, card: card as unknown as PaymentProvider & typeof card };
}
function shareRow() {
  return { id: 'cota-1', bolaoId: 'bolao-1', compradorId: 'u1', quantidade: 1, status: StatusCota.reservada, expiraReservaEm: new Date(Date.now() + 600_000), pagamento: null, comprador: { nome: 'Maria Souza', cpf: '52998224725', email: 'm@x.com' }, afiliadoReferencia: null, bolao: { valorCota: new Prisma.Decimal(50), taxaAdministracaoPct: new Prisma.Decimal(0), precificacao: null, concurso: { modalidade: 'megasena', cutoffAt: new Date(Date.now() + 10 * 86_400_000), status: 'aberto', resultado: null }, status: 'aberto' } };
}
function setup() {
  const { cora, card } = providers();
  const created: any[] = [];
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    cota: { findUniqueOrThrow: jest.fn().mockImplementation(async () => ({ ...shareRow(), bolao: { ...shareRow().bolao, status: 'aberto' } })) },
    pagamento: { create: jest.fn(async ({ data }: any) => { const row = { id: 'pay-1', ...data }; created.push(row); return row; }), update: jest.fn() },
  };
  const prisma: any = {
    cota: { findUnique: jest.fn().mockResolvedValue(shareRow()), update: jest.fn().mockResolvedValue({}) },
    pagamento: {
      update: jest.fn(async ({ data }: any) => ({ id: 'pay-1', status: StatusPagamento.pendente, metodo: created[0]?.metodo, origem: 'gateway', valorBruto: new Prisma.Decimal(50), valorTaxaAdmin: new Prisma.Decimal(0), valorComissaoAfiliado: new Prisma.Decimal(0), valorCustoBilhete: new Prisma.Decimal(50), qrCodePix: null, qrCodeUrl: null, linhaDigitavel: null, codigoBarras: null, boletoUrl: null, vencimentoEm: new Date(), pspTransactionId: null, ...data })),
      updateMany: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new PaymentsService(prisma, audit as never, config, cora);
  (service as any).providers.set(card.name, card);
  return { service, cora, card, prisma, created };
}

describe('PaymentsService — Cora para Pix/boleto e Mercado Pago para cartão', () => {
  it('oferece a união dos métodos e informa os provedores e os avisos', () => {
    const { service } = setup();
    const settings = service.settings();
    expect(settings.metodos).toEqual(['pix', 'boleto', 'cartao']);
    expect(settings.provedores).toEqual(['cora', 'mercadopago']);
    expect(settings.webhookUrl).toBe('https://bolaolivre.com/api/v1/webhooks/pagamento/cora');
    expect(settings.webhookCartaoUrl).toBe('https://bolaolivre.com/api/v1/webhooks/pagamento/mercadopago');
    expect(settings.valorMinimoPorMetodo).toEqual({ pix: 5, boleto: 5, cartao: 5 });
  });
  it('cartão cobra no Mercado Pago e devolve o link de pagamento', async () => {
    const { service, cora, card, created } = setup();
    const result = await service.createForShare('cota-1', { metodo: 'cartao' }, user as never);
    expect(card.createCharge).toHaveBeenCalledTimes(1); expect(cora.createCharge).not.toHaveBeenCalled();
    expect(created[0]).toMatchObject({ pspProvedor: 'mercadopago', metodo: 'cartao' });
    expect(card.createCharge.mock.calls[0]![0]).toMatchObject({ method: 'cartao', value: 50, externalReference: 'pay-1' });
    expect(card.createCharge.mock.calls[0]![0].expiresAt).toBeInstanceOf(Date);
    expect(result).toMatchObject({ metodo: 'cartao', checkoutUrl: 'https://mp/checkout', boletoUrl: null });
  });
  it('Pix e boleto continuam na Cora', async () => {
    const { service, cora, card, created } = setup();
    await service.createForShare('cota-1', { metodo: 'pix' }, user as never);
    expect(cora.createCharge).toHaveBeenCalledTimes(1); expect(card.createCharge).not.toHaveBeenCalled();
    expect(created[0]).toMatchObject({ pspProvedor: 'cora', metodo: 'pix' });
  });
  it('método que nenhum provedor atende é recusado', async () => {
    const { service } = setup();
    await expect(service.createForShare('cota-1', { metodo: 'pix_automatico' }, user as never)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('o aviso vai para o provedor do nome da URL; nome desconhecido é 404', async () => {
    const { service, cora, card } = setup();
    await service.handleWebhook('{}', {}, { token: 't' }, 'mercadopago');
    expect(card.resolveWebhook).toHaveBeenCalledTimes(1); expect(cora.resolveWebhook).not.toHaveBeenCalled();
    await service.handleWebhook('{}', {}, {}, 'cora');
    expect(cora.resolveWebhook).toHaveBeenCalledTimes(1);
    await expect(service.handleWebhook('{}', {}, {}, 'outro')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('a conferência automática consulta cada provedor só nas cobranças dele', async () => {
    const { service, cora, card, prisma } = setup();
    prisma.pagamento.findMany.mockImplementation(async ({ where }: any) => where.pspProvedor === 'mercadopago' ? [{ id: 'p1', pspTransactionId: 'mp_p1', cota: { status: StatusCota.reservada } }] : []);
    const summary = await service.reconcilePending();
    expect(summary.verificados).toBe(1);
    expect(card.fetchStatus).toHaveBeenCalledWith('mp_p1'); expect(cora.fetchStatus).not.toHaveBeenCalled();
    expect(prisma.pagamento.findMany.mock.calls.map((call: any[]) => call[0].where.pspProvedor)).toEqual(['cora', 'mercadopago']);
  });
});
