import * as argon2 from 'argon2';
import { recoverAdmin } from './admin-recovery';
describe('Explicit admin recovery', () => {
  function setup(user: any = { id: 'a', papel: 'admin', desativadoEm: null }) {
    const tx: any = { $queryRaw: jest.fn(), usuario: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn() }, tokenSenha: { updateMany: jest.fn() }, auditoriaEvento: { create: jest.fn() } };
    tx.$transaction = (fn: any) => fn(tx); return tx;
  }
  it('hashes password, clears lock, revokes tokens and keeps role/2FA/status untouched', async () => {
    const tx = setup(); await recoverAdmin(tx, ' ADMIN@example.invalid ', '12345678');
    const { data } = tx.usuario.update.mock.calls[0][0];
    expect(await argon2.verify(data.senhaHash, '12345678')).toBe(true);
    expect(data).toMatchObject({ tentativasLogin: 0, bloqueadoAte: null, tokenVersion: { increment: 1 } });
    expect(data).not.toHaveProperty('papel'); expect(data).not.toHaveProperty('totpAtivo');
    expect(tx.tokenSenha.updateMany).toHaveBeenCalled();
    expect(JSON.stringify(tx.auditoriaEvento.create.mock.calls)).not.toContain('12345678');
  });
  it.each([null, { id: 'b', papel: 'cotista' }, { id: 'a', papel: 'admin', desativadoEm: new Date() }])('does not create, promote or reactivate accounts: %p', async user => {
    const tx = setup(user); await expect(recoverAdmin(tx, 'admin@example.invalid', '12345678')).rejects.toThrow(); expect(tx.usuario.update).not.toHaveBeenCalled();
  });
  it('rejects weak inputs before accessing the database', async () => {
    const tx = setup(); await expect(recoverAdmin(tx, 'admin@example.invalid', 'short')).rejects.toThrow(); expect(tx.usuario.findUnique).not.toHaveBeenCalled();
  });
});
