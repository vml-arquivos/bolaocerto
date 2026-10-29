import { AdminUsersService } from './admin-users.service';
const actor = { id: 'admin', papel: 'admin' as const, email: 'admin@example.invalid' };
function setup() {
  const users: any[] = [{ id: 'admin', papel: 'admin', desativadoEm: null }, { id: 'buyer', papel: 'cotista', nome: 'Pessoa Teste', email: 'test@example.invalid', cpf: '52998224725', telefone: null, dataNascimento: new Date('1990-01-01'), desativadoEm: null, tokenVersion: 0 }];
  const records: any[] = [];
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    usuario: {
      delete: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(async ({ where }: any) => users.find(u => u.id === where.id)),
      update: jest.fn(async ({ where, data }: any) => { const row = users.find(u => u.id === where.id); const { tokenVersion, ...rest } = data; Object.assign(row, rest); if (tokenVersion) row.tokenVersion += tokenVersion.increment; return row; }),
    },
    tokenSenha: { count: jest.fn().mockResolvedValue(0), create: jest.fn(async ({data}: any) => { records.push(data); return data; }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  tx.$transaction = (fn: any) => fn(tx);
  const mail: any = { isConfigured: jest.fn().mockReturnValue(true), publicUrl: () => 'https://example.invalid', send: jest.fn().mockResolvedValue(true) };
  const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
  return { service: new AdminUsersService(tx, audit, mail), tx, users, records, mail, audit };
}
describe('Administrative user management', () => {
  it('only deletes disabled empty accounts and records the action', async () => {
    const { service, users, tx, audit } = setup();
    users[1]._count = { tokensSenha: 2, cotasCompradas: 0 };
    await expect(service.deleteEmpty('buyer', actor)).rejects.toThrow(/Remova/);
    users[1].desativadoEm = new Date();
    users[1]._count.cotasCompradas = 1;
    await expect(service.deleteEmpty('buyer', actor)).rejects.toThrow(/histórico/);
    expect(tx.usuario.delete).not.toHaveBeenCalled();
    users[1]._count.cotasCompradas = 0;
    users[1].afiliado = { id: 'affiliate' };
    await expect(service.deleteEmpty('buyer', actor)).rejects.toThrow(/histórico/);
    users[1].afiliado = null;
    await expect(service.deleteEmpty('admin', actor)).rejects.toThrow(/própria/);
    await expect(service.deleteEmpty('buyer', actor)).resolves.toEqual({ id: 'buyer', excluido: true });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ evento: 'usuario.vazio_excluido' }));
  });
  it('removes access with session revocation and keeps the user and financial history', async () => {
    const { service, users, tx, audit } = setup();
    await service.setActive('buyer', false, actor);
    expect(users).toHaveLength(2);
    expect(users[1].desativadoEm).toBeInstanceOf(Date);
    expect(users[1].tokenVersion).toBe(1);
    expect(tx.tokenSenha.updateMany).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ evento: 'usuario.acesso_removido' }));
    await service.setActive('buyer', false, actor);
    expect(users[1].tokenVersion).toBe(1);
    await service.setActive('buyer', true, actor);
    expect(users[1].desativadoEm).toBeNull(); expect(users[1].tokenVersion).toBe(2);
  });
  it('prevents removing own administrator access', async () => {
    const { service, tx } = setup();
    await expect(service.setActive('admin', false, actor)).rejects.toThrow(/próprio/);
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });
  it('rechecks the acting administrator under the shared transaction lock', async () => {
    const { service, users, tx } = setup(); users[0].desativadoEm = new Date();
    await expect(service.setActive('buyer', false, actor)).rejects.toThrow(/administrativo/);
    expect(tx.$queryRaw).toHaveBeenCalled(); expect(tx.usuario.update).not.toHaveBeenCalled();
  });
  it('normalizes contact data, preserves CPF and revokes sessions on email change', async () => {
    const { service, users, tx } = setup();
    const result = await service.edit('buyer', { nome: ' Nova Pessoa ', email: 'NEW@example.invalid', telefone: '' }, actor);
    expect(users[1].email).toBe('new@example.invalid'); expect(users[1].cpf).toBe('52998224725');
    expect(result.cpf).not.toBe(users[1].cpf); expect(users[1].tokenVersion).toBe(1);
    expect(tx.tokenSenha.updateMany).toHaveBeenCalled();
  });
  it('rejects an underage date before changing data', async () => {
    const { service, tx } = setup();
    await expect(service.edit('buyer', { nome: 'Pessoa', email: 'test@example.invalid', dataNascimento: new Date().toISOString() }, actor)).rejects.toThrow();
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });
  it('sends only to the saved address, stores a hash, and never returns a password/token', async () => {
    const { service, records, mail } = setup();
    const result = await service.sendReset('buyer', actor);
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'test@example.invalid' }));
    expect(records[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result).toMatchObject({ enviado: true });
    expect(JSON.stringify(result)).not.toContain('token=');
    expect(mail.send.mock.calls[0][0].text).not.toContain(records[0].tokenHash);
  });
  it('never reports success when SMTP fails and revokes the undelivered token', async () => {
    const { service, mail, tx } = setup(); mail.send.mockResolvedValue(false);
    await expect(service.sendReset('buyer', actor)).rejects.toThrow(/envio falhou/);
    expect(tx.tokenSenha.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tokenHash: expect.any(String), usadoEm: null } }));
  });
  it('does not issue a token if SMTP is not configured', async () => {
    const { service, mail, tx } = setup(); mail.isConfigured.mockReturnValue(false);
    await expect(service.sendReset('buyer', actor)).rejects.toThrow(/SMTP/); expect(tx.tokenSenha.create).not.toHaveBeenCalled();
  });
  it('enforces cooldown and inactive-account restrictions', async () => {
    const { service, tx, users, mail } = setup(); tx.tokenSenha.count.mockResolvedValue(3);
    await expect(service.sendReset('buyer', actor)).rejects.toThrow(/3 solicitações/);
    users[1].desativadoEm = new Date();
    await expect(service.sendReset('buyer', actor)).rejects.toThrow(/Reative/); expect(mail.send).not.toHaveBeenCalled();
  });
});
