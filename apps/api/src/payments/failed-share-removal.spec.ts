import { PaymentsService } from './payments.service';

const admin = { id: 'admin', email: 'fixture@example.invalid', papel: 'admin' as const };
const old = new Date(Date.now() - 5 * 3600_000);
const base = { id: 's1', bolaoId: 'b1', quantidade: 1, status: 'cancelada', expiraReservaEm: old, pagamento: { id: 'p1', status: 'falhou', criadoEm: old, notaFiscal: null }, comissao: null, _count: { anexos: 0 } };

function setup(share: object | null) {
  const events: string[] = [];
  const del = (name: string) => jest.fn(async () => { events.push(name); return { count: 1 }; });
  const tx: any = {
    $queryRaw: jest.fn(async () => undefined),
    cota: { findUnique: jest.fn(async () => share), delete: del('cota') },
    bolao: { update: jest.fn(async () => { events.push('estoque'); }) },
    notaFiscal: { deleteMany: del('nota') }, comissao: { deleteMany: del('comissao') }, mandato: { deleteMany: del('mandato') }, pagamento: { deleteMany: del('pagamento') },
  };
  const prisma: any = { $transaction: (fn: any) => fn(tx), cota: { findMany: jest.fn(async () => [{ id: 's1' }]) } };
  const audit: any = { record: jest.fn(async () => undefined) };
  const config: any = { get: jest.fn((_key: string, fallback: string) => fallback) };
  return { service: new PaymentsService(prisma, audit, config), tx, events, prisma };
}

describe('Excluir registro de compra que não se concluiu', () => {
  it('apaga cota cancelada com cobrança que falhou', async () => {
    const { service, events } = setup({ ...base });
    expect(await service.deleteFailedShare('s1', admin)).toEqual({ id: 's1', excluida: true });
    expect(events).toEqual(['nota', 'comissao', 'mandato', 'pagamento', 'cota']);
  });

  it('reserva vencida devolve o estoque ao apagar', async () => {
    const { service, tx } = setup({ ...base, status: 'reservada', pagamento: null });
    await service.deleteFailedShare('s1', admin);
    expect(tx.bolao.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { cotasVendidas: { decrement: 1 } } });
  });

  it.each([
    ['cota paga', { status: 'paga' }],
    ['reserva ainda valendo', { status: 'reservada', expiraReservaEm: new Date(Date.now() + 600_000) }],
    ['pagamento confirmado', { pagamento: { id: 'p', status: 'confirmado', criadoEm: old, notaFiscal: null } }],
    ['pagamento estornado', { pagamento: { id: 'p', status: 'estornado', criadoEm: old, notaFiscal: null } }],
    ['cobrança recente pendente', { pagamento: { id: 'p', status: 'pendente', criadoEm: new Date(), notaFiscal: null } }],
    ['nota emitida', { pagamento: { id: 'p', status: 'falhou', criadoEm: old, notaFiscal: { status: 'emitida' } } }],
    ['comissão paga', { comissao: { status: 'paga' } }],
    ['anexo na cota', { _count: { anexos: 1 } }],
  ])('recusa: %s', async (_name, patch) => {
    const { service, tx } = setup({ ...base, ...patch });
    await expect(service.deleteFailedShare('s1', admin)).rejects.toThrow();
    expect(tx.cota.delete).not.toHaveBeenCalled();
  });

  it('limpeza em lote conta o que apagou e o que manteve', async () => {
    const { service } = setup({ ...base, status: 'paga' });
    expect(await service.purgeFailedShares(admin)).toEqual({ excluidas: 0, mantidas: 1 });
  });
});

describe('Excluir cota vendida (superadmin)', () => {
  const root = { id: 'admin', email: 'dono@example.invalid', papel: 'admin' as const };
  const paid = { ...base, status: 'paga', compradorId: 'u1', valorPago: '5.00', pagamento: { id: 'p1', status: 'confirmado', origem: 'gateway', formaBaixa: 'pix', valorBruto: '5.00', pspTransactionId: 'x', criadoEm: old, notaFiscal: null }, comissao: null };
  const prev = process.env.ADMIN_BOOTSTRAP_EMAIL;
  beforeAll(() => { process.env.ADMIN_BOOTSTRAP_EMAIL = 'dono@example.invalid'; });
  afterAll(() => { process.env.ADMIN_BOOTSTRAP_EMAIL = prev; });

  function build(share: object | null) {
    const s = setup(share);
    s.tx.cupomUso = { deleteMany: jest.fn(async () => ({ count: 0 })) };
    s.tx.anexo = { updateMany: jest.fn(async () => ({ count: 0 })) };
    s.tx.carteiraMovimento = { findMany: jest.fn(async () => []), findUnique: jest.fn(async () => null) };
    return s;
  }

  it('apaga cota paga, devolve o estoque e desfaz saldo/cashback', async () => {
    const { service, tx, events } = build({ ...paid });
    const spy = jest.spyOn(service as any, 'afterRelease').mockResolvedValue(undefined);
    expect(await service.deleteShareCompletely('s1', root)).toEqual({ id: 's1', excluida: true, estoqueDevolvido: 1 });
    expect(tx.bolao.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { cotasVendidas: { decrement: 1 } } });
    expect(events.at(-1)).toBe('cota');
    expect(spy).toHaveBeenCalledWith({ pagamentoId: 'p1', compradorId: 'u1', formaBaixa: 'pix', valorBruto: 5 });
  });

  it('cota já cancelada não mexe no estoque', async () => {
    const { service, tx } = build({ ...paid, status: 'cancelada', pagamento: { ...paid.pagamento, status: 'estornado' } });
    expect((await service.deleteShareCompletely('s1', root)).estoqueDevolvido).toBe(0);
    expect(tx.bolao.update).not.toHaveBeenCalled();
  });

  it('nota manual não impede', async () => {
    const { service } = build({ ...paid, pagamento: { ...paid.pagamento, notaFiscal: { status: 'emitida', origem: 'manual' } } });
    jest.spyOn(service as any, 'afterRelease').mockResolvedValue(undefined);
    await expect(service.deleteShareCompletely('s1', root)).resolves.toMatchObject({ excluida: true });
  });

  it.each([
    ['nota emitida de verdade', { pagamento: { ...paid.pagamento, notaFiscal: { status: 'emitida', origem: 'focus' } } }],
    ['comissão paga', { comissao: { status: 'paga', loteRepasseId: null } }],
    ['comissão em lote de repasse', { comissao: { status: 'pendente', loteRepasseId: 'l1' } }],
  ])('recusa: %s', async (_n, patch) => {
    const { service, tx } = build({ ...paid, ...patch });
    await expect(service.deleteShareCompletely('s1', root)).rejects.toThrow();
    expect(tx.cota.delete).not.toHaveBeenCalled();
  });

  it('recusa quem não é superadmin', async () => {
    const { service } = build({ ...paid });
    await expect(service.deleteShareCompletely('s1', { ...root, email: 'outro@example.invalid' })).rejects.toThrow('superadmin');
  });

  it('cota inexistente', async () => {
    const { service } = build(null);
    await expect(service.deleteShareCompletely('s1', root)).rejects.toThrow('não encontrada');
  });
});
