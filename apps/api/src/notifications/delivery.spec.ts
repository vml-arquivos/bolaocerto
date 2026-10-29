import { NotificationsService } from './notifications.service';
function setup() {
  const row: any = { id: 'n1', tipo: 'pagamento.confirmado', payload: { jogos: [{ ordem: 1, numeros: [1,2,3,4,5,6] }] }, enviadoEm: null, tentativas: 0, leaseToken: null, leaseAte: null, proximaTentativaEm: new Date(0), usuario: { nome: '<Maria>', email: 'test@example.invalid' } };
  const eligible = () => !row.enviadoEm && row.tentativas < 10 && row.proximaTentativaEm <= new Date() && (!row.leaseAte || row.leaseAte < new Date());
  const prisma: any = { notificacao: {
    findMany: jest.fn(async () => eligible() ? [{ ...row }] : []),
    updateMany: jest.fn(async ({ where, data }) => {
      if (where.leaseToken ? where.leaseToken !== row.leaseToken : !eligible()) return { count: 0 };
      const attempts = row.tentativas;
      Object.assign(row, data);
      if (typeof data.tentativas === 'object') row.tentativas = attempts + 1;
      return { count: 1 };
    }),
  } };
  const mail = { isConfigured: () => true, publicUrl: () => 'https://example.invalid', send: jest.fn(async () => true) };
  return { row, mail, service: new NotificationsService(prisma, mail as never) };
}
describe('Recoverable mail delivery', () => {
  it('claims one message across two simultaneous dispatchers', async () => {
    const { service, mail, row } = setup();
    await Promise.all([service.dispatchPending(), service.dispatchPending()]);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(row.enviadoEm).toBeInstanceOf(Date);
    expect(mail.send.mock.calls[0]).toBeDefined();
  });
  it('retries an abandoned lease and only marks sent after SMTP success', async () => {
    const { service, mail, row } = setup();
    row.leaseAte = new Date(Date.now() - 1); row.leaseToken = 'old';
    mail.send.mockImplementation(async () => { expect(row.enviadoEm).toBeNull(); return true; });
    await service.dispatchPending();
    expect(row.enviadoEm).toBeInstanceOf(Date);
  });
  it('backs off failed messages, keeping them unsent', async () => {
    const { service, mail, row } = setup();
    mail.send.mockResolvedValue(false);
    expect(await service.dispatchPending()).toEqual({ enviados: 0, falhas: 1 });
    expect(row.enviadoEm).toBeNull(); expect(row.leaseAte).toBeNull();
    expect(row.proximaTentativaEm.getTime()).toBeGreaterThan(Date.now());
    await service.dispatchPending(); expect(mail.send).toHaveBeenCalledTimes(1);
  });
  it('stops poison messages after ten attempts for operator review', async () => {
    const { service, mail, row } = setup(); row.tentativas = 10;
    await service.dispatchPending(); expect(mail.send).not.toHaveBeenCalled();
  });
});
