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
