import { ConfigService } from '@nestjs/config';
import { Prisma, StatusBolao, StatusComissao, StatusCota, StatusPagamento } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { computeShareAmounts, PaymentsService } from './payments.service';
import { PaymentProvider } from './payment.provider';

const config = { get: jest.fn((key: string, fallback?: string) => (key === 'PAYMENTS_ENABLED' ? 'true' : fallback ?? '')) } as unknown as ConfigService;
const admin = { id: 'admin-1', papel: 'admin' } as AuthUser;

function payment(overrides: Record<string, unknown> = {}) {
  return { id: 'pay-1', cotaId: 'cota-1', status: StatusPagamento.pendente, pspTransactionId: 'inv_1', valorBruto: new Prisma.Decimal(100), valorTaxaAdmin: new Prisma.Decimal(25.93), valorCustoBilhete: new Prisma.Decimal(74.07), valorComissaoAfiliado: new Prisma.Decimal(2.59), confirmadoEm: null, ...overrides };
}
function cota(overrides: Record<string, unknown> = {}) {
  return { id: 'cota-1', bolaoId: 'bolao-1', quantidade: 2, status: StatusCota.reservada, afiliadoReferenciaId: 'af-1', bolao: { concurso: { status: 'aberto', cutoffAt: new Date(Date.now() + 86400000) }, jogos: [], status: StatusBolao.aberto, cotasIlimitadas: false, totalCotas: 10, cotasVendidas: 5 }, ...overrides };
}

function setup(options: { payment?: unknown; cota?: unknown; provider?: Partial<PaymentProvider> } = {}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    cota: { findUniqueOrThrow: jest.fn().mockResolvedValue(options.cota ?? cota()), update: jest.fn().mockResolvedValue({}) },
    bolao: { update: jest.fn().mockResolvedValue({}) },
    notificacao: { create: jest.fn().mockResolvedValue({}) },
    pagamento: { findUniqueOrThrow: jest.fn().mockImplementation(() => Promise.resolve({ ...(options.payment as object ?? payment()), cota: options.cota ?? cota() })), update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...payment(), ...data, valorBruto: new Prisma.Decimal(100) })) },
    comissao: { upsert: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }), count: jest.fn().mockResolvedValue(0) },
  };
  const basePayment = (options.payment ?? payment()) as Record<string, unknown>;
  const prisma = {
    ...tx,
    pagamento: { ...tx.pagamento, findFirst: jest.fn().mockResolvedValue({ ...basePayment, cota: options.cota ?? cota() }), findUnique: jest.fn().mockResolvedValue({ ...basePayment, cota: options.cota ?? cota() }), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const provider = { name: 'cora', methods: ['pix', 'boleto'], minAmount: 5, createCharge: jest.fn(), resolveWebhook: jest.fn(), ...options.provider } as unknown as PaymentProvider;
  const service = new PaymentsService(prisma as never, audit as never, config, provider);
  return { service, tx, prisma, audit };
}

describe('computeShareAmounts', () => {
  it('fecha bruto = custo + taxa e calcula a comissão sobre a taxa', () => {
    const amounts = computeShareAmounts(50, 2, 35, 10);
    expect(amounts.gross).toBe(100);
    expect(amounts.cost + amounts.adminFee).toBeCloseTo(100, 2);
    expect(amounts.affiliateCommission).toBeCloseTo(amounts.adminFee * 0.1, 2);
  });
});

describe('PaymentsService — confirmação', () => {
  it('confirma cota reservada, marca paga e gera comissão pendente', async () => {
    const { service, tx } = setup();
    await service.confirmPayment('inv_1', undefined, 100);
    expect(tx.cota.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: StatusCota.paga }) }));
    expect(tx.comissao.upsert).toHaveBeenCalledTimes(1);
    expect(tx.bolao.update).not.toHaveBeenCalled();
  });

  it('BUG CORRIGIDO: pagamento tardio reativa a cota expirada e recontabiliza o estoque', async () => {
    const { service, tx } = setup({ cota: cota({ status: StatusCota.cancelada }) });
    await service.confirmPayment('inv_1');
    expect(tx.cota.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: StatusCota.paga }) }));
    expect(tx.bolao.update).toHaveBeenCalledWith({ where: { id: 'bolao-1' }, data: { cotasVendidas: { increment: 2 } } });
    expect(tx.comissao.upsert).toHaveBeenCalledTimes(1);
  });

  it('BUG CORRIGIDO: pagamento tardio sem estoque NÃO vende acima do total e fica para estorno', async () => {
    const full = cota({ status: StatusCota.cancelada, bolao: { concurso: { status: 'aberto', cutoffAt: new Date(Date.now() + 86400000) }, jogos: [], status: StatusBolao.aberto, cotasIlimitadas: false, totalCotas: 10, cotasVendidas: 9 } });
    const { service, tx, audit } = setup({ cota: full });
    await service.confirmPayment('inv_1');
    expect(tx.cota.update).not.toHaveBeenCalled();
    expect(tx.bolao.update).not.toHaveBeenCalled();
    expect(tx.comissao.upsert).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ evento: 'pagamento.sem_cota' }));
  });

  it('não confirma quando o valor pago é menor que o devido', async () => {
    const { service, tx } = setup();
    const result = await service.confirmPayment('inv_1', undefined, 50);
    expect(result).toEqual({ divergente: true });
    expect(tx.pagamento.update).not.toHaveBeenCalled();
  });
});

describe('PaymentsService — estorno e cancelamento', () => {
  it('BUG CORRIGIDO: estorno cancela a comissão pendente e devolve o estoque', async () => {
    const { service, tx } = setup({ payment: payment({ status: StatusPagamento.confirmado }), cota: cota({ status: StatusCota.paga }) });
    await service.releasePayment('pay-1', StatusPagamento.estornado, 'admin-1');
    expect(tx.comissao.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { cotaId: 'cota-1', status: StatusComissao.pendente } }));
    expect(tx.bolao.update).toHaveBeenCalledWith({ where: { id: 'bolao-1' }, data: { cotasVendidas: { decrement: 2 } } });
  });

  it('cobrança cancelada no provedor não derruba uma cota já paga', async () => {
    const { service, tx } = setup({ payment: payment({ status: StatusPagamento.confirmado }), cota: cota({ status: StatusCota.paga }) });
    await service.releasePayment('pay-1', StatusPagamento.falhou);
    expect(tx.cota.update).not.toHaveBeenCalled();
  });

  it('webhook de cobrança desconhecida é ignorado sem erro', async () => {
    const { service, prisma } = setup({ provider: { resolveWebhook: jest.fn().mockResolvedValue({ transactionId: 'inv_x', status: 'confirmed' }) } });
    prisma.pagamento.findFirst.mockResolvedValue(null);
    await expect(service.handleWebhook('', {}, {})).resolves.toEqual({ ignorado: true });
  });
});

describe('PaymentsService — conciliação ativa', () => {
  it('baixa pagamentos confirmados no provedor mesmo sem webhook', async () => {
    const fetchStatus = jest.fn().mockResolvedValue({ status: 'confirmed', paidAmount: 100 });
    const { service, prisma, tx } = setup({ provider: { fetchStatus } });
    prisma.pagamento.findMany.mockResolvedValue([{ ...payment(), cota: cota() }]);
    const summary = await service.reconcilePending();
    expect(summary).toMatchObject({ verificados: 1, confirmados: 1, erros: 0 });
    expect(tx.cota.update).toHaveBeenCalled();
  });

  it('cancela no provedor a cobrança de reserva expirada', async () => {
    const cancelCharge = jest.fn().mockResolvedValue(undefined);
    const fetchStatus = jest.fn().mockResolvedValue({ status: 'pending' });
    const expired = cota({ status: StatusCota.cancelada });
    const { service, prisma } = setup({ provider: { fetchStatus, cancelCharge }, cota: expired });
    prisma.pagamento.findMany.mockResolvedValue([{ ...payment(), cota: expired }]);
    const summary = await service.reconcilePending();
    expect(cancelCharge).toHaveBeenCalledWith('inv_1');
    expect(summary.cancelados).toBe(1);
  });
});

describe('PaymentsService — operação manual', () => {
  it('baixa manual exige cota reservada e registra operador e forma', async () => {
    const { service, prisma, tx } = setup();
    const share = { ...cota(), pagamento: null, afiliadoReferencia: { comissaoPadraoPct: new Prisma.Decimal(10) }, bolao: { valorCota: new Prisma.Decimal(50), taxaAdministracaoPct: new Prisma.Decimal(35), status: StatusBolao.aberto, cotasIlimitadas: false, totalCotas: 10, cotasVendidas: 5 } };
    (prisma as unknown as { cota: Record<string, unknown> }).cota.findUnique = jest.fn().mockResolvedValue(share);
    (tx as unknown as { pagamento: Record<string, unknown> }).pagamento.create = jest.fn().mockResolvedValue(payment({ id: 'pay-new', pspTransactionId: null }));
    tx.cota.findUniqueOrThrow.mockResolvedValueOnce({ ...cota(), pagamento: null }).mockResolvedValueOnce({ bolaoId: 'bolao-1' }).mockResolvedValueOnce(cota()).mockResolvedValueOnce(cota({ status: StatusCota.paga }));
    const result = await service.markPaidManually('cota-1', { forma: 'pix_direto', observacao: 'Pix na conta PJ' }, admin);
    expect(result.status).toBe(StatusPagamento.confirmado);
    expect((tx.pagamento as unknown as { create: jest.Mock }).create).toHaveBeenCalledWith({ data: expect.objectContaining({ origem: 'manual', formaBaixa: 'pix_direto', baixaPor: 'admin-1', metodo: 'manual' }) });
  });
});

describe('Payment regression guards', () => {
  it('does not settle a charge that was refunded while waiting for the lock', async () => {
    const { service, tx } = setup();
    tx.pagamento.findUniqueOrThrow.mockResolvedValue(payment({ status: StatusPagamento.estornado }));
    await service.confirmPayment('inv_1', undefined, 100);
    expect(tx.cota.update).not.toHaveBeenCalled();
    expect(tx.pagamento.update).not.toHaveBeenCalled();
  });
  it.each([99.99, 100.01, NaN, Infinity])('does not settle divergent amount %s', async amount => {
    const { service, tx } = setup();
    await expect(service.confirmPayment('inv_1', undefined, amount)).resolves.toEqual({ divergente: true });
    expect(tx.cota.update).not.toHaveBeenCalled();
  });
  it('does not sell a late payment after cutoff', async () => {
    const share = cota({ status: StatusCota.cancelada, bolao: { status: StatusBolao.aberto, concurso: { status: 'aberto', cutoffAt: new Date(0) }, totalCotas: 10, cotasVendidas: 0 } });
    const { service, tx, audit } = setup({ cota: share });
    await service.confirmPayment('inv_1', undefined, 100);
    expect(tx.cota.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ evento: 'pagamento.sem_cota' }));
  });
  it('a duplicate refund observed under lock never decrements stock twice', async () => {
    const { service, tx } = setup();
    tx.pagamento.findUniqueOrThrow.mockResolvedValue({ ...payment({ status: StatusPagamento.estornado }), cota: cota({ status: StatusCota.estornada }) });
    await service.releasePayment('pay-1', StatusPagamento.estornado);
    expect(tx.bolao.update).not.toHaveBeenCalled();
  });
  it('failure to enqueue confirmation rolls back instead of hiding a lost email', async () => {
    const { service, tx } = setup();
    tx.notificacao.create.mockRejectedValue(new Error('database unavailable'));
    await expect(service.confirmPayment('inv_1', undefined, 100)).rejects.toThrow('database unavailable');
  });
});
