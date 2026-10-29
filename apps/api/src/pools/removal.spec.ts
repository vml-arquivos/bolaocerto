import { PoolsService } from './pools.service';
const admin = { id: 'admin', email: 'fixture@example.invalid', papel: 'admin' as const };
function setup(overrides: object = {}, shares = 0, attachments = 0) {
  const events: string[] = [];
  const row = { id: 'pool', status: 'rascunho', cotasVendidas: 0, ...overrides };
  const tx: any = { $queryRaw: jest.fn(async () => { events.push('lock'); }), bolao: { findUnique: jest.fn(async () => { events.push('read'); return row; }), delete: jest.fn(async () => { events.push('delete'); }), update: jest.fn() }, cota: { count: jest.fn(async () => shares) }, anexo: { count: jest.fn(async () => attachments) } };
  const audit: any = { record: jest.fn(async () => { events.push('audit'); }) };
  const service = new PoolsService({ $transaction: (fn: any) => fn(tx) } as any, audit);
  return { service, tx, events, audit };
}
describe('Delete unused pools without destroying financial history', () => {
  it('locks, rechecks and audits before deletion', async () => {
    const { service, events } = setup();
    expect(await service.removeUnused('pool', admin)).toEqual({ id: 'pool', excluido: true });
    expect(events).toEqual(['lock', 'read', 'audit', 'delete']);
  });
  it.each(['registrado', 'apurado'])('retains %s pools even without shares', async status => {
    const { service, tx } = setup({ status });
    await expect(service.removeUnused('pool', admin)).rejects.toThrow(/histórico/);
    expect(tx.bolao.delete).not.toHaveBeenCalled();
  });
  it.each([[1, 0], [0, 1]])('retains linked shares=%i attachments=%i including cancelled records', async (shares, attachments) => {
    const { service, tx } = setup({}, shares, attachments);
    await expect(service.removeUnused('pool', admin)).rejects.toThrow(/histórico/);
    expect(tx.bolao.delete).not.toHaveBeenCalled();
  });
  it('never grants affiliates permanent deletion', async () => {
    const { service, events } = setup();
    await expect(service.removeUnused('pool', { ...admin, papel: 'afiliado' })).rejects.toThrow(/administradores/);
    expect(events).toEqual([]);
  });
  it('does not treat stale stock counter as an unused pool', async () => {
    const { service } = setup({ cotasVendidas: 1 });
    await expect(service.removeUnused('pool', admin)).rejects.toThrow();
  });
  it('blocks cancellation when a reservation or confirmed payment is still present', async () => {
    const { service, tx } = setup({ status: 'aberto' }, 1);
    await expect(service.cancel('pool', admin)).rejects.toThrow(/ativos/);
    expect(tx.bolao.update).not.toHaveBeenCalled();
  });
});
