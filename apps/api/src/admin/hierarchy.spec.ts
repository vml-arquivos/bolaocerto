import { ForbiddenException } from '@nestjs/common';
import { assertCanGrantRole, assertCanManage, canManage, rankOf } from './superadmin';
import { SuperAdminGuard } from '../auth/superadmin.guard';

const env = { ADMIN_BOOTSTRAP_EMAIL: 'dono@exemplo.com' } as NodeJS.ProcessEnv;
const dono = { id: 'd', email: 'dono@exemplo.com', papel: 'admin' };
const admin = { id: 'a', email: 'adm@exemplo.com', papel: 'admin' };
const admin2 = { id: 'a2', email: 'adm2@exemplo.com', papel: 'admin' };
const op = { id: 'o', email: 'op@exemplo.com', papel: 'operacao' };
const afiliado = { id: 'f', email: 'f@exemplo.com', papel: 'afiliado' };
const cotista = { id: 'c', email: 'c@exemplo.com', papel: 'cotista' };

describe('Hierarquia de contas', () => {
  it('níveis: superadmin > admin > operação > afiliado > cotista', () => {
    expect([dono, admin, op, afiliado, cotista].map((u) => rankOf(u, env))).toEqual([4, 3, 2, 1, 0]);
  });
  it('o superadmin gerencia todos', () => {
    for (const target of [admin, op, afiliado, cotista]) expect(canManage(dono, target, env)).toBe(true);
  });
  it('administrador comum não toca no superadmin nem em outro administrador', () => {
    expect(canManage(admin, dono, env)).toBe(false);
    expect(canManage(admin, admin2, env)).toBe(false);
    expect(() => assertCanManage(admin, dono, env)).toThrow(ForbiddenException);
  });
  it('administrador comum gerencia operação, afiliado e cotista, e a própria conta', () => {
    for (const target of [op, afiliado, cotista, admin]) expect(canManage(admin, target, env)).toBe(true);
  });
  it('operação, afiliado e cotista não gerenciam ninguém acima, nem os iguais', () => {
    expect(canManage(op, admin, env)).toBe(false);
    expect(canManage(afiliado, op, env)).toBe(false);
    expect(canManage(cotista, afiliado, env)).toBe(false);
    expect(canManage(op, { id: 'o2', email: 'o2@x.com', papel: 'operacao' }, env)).toBe(false);
  });
  it('só o superadmin cria ou concede administrador', () => {
    expect(() => assertCanGrantRole(dono, 'admin', env)).not.toThrow();
    expect(() => assertCanGrantRole(admin, 'admin', env)).toThrow(ForbiddenException);
    expect(() => assertCanGrantRole(admin, 'operacao', env)).not.toThrow();
  });
  it('sem ADMIN_BOOTSTRAP_EMAIL ninguém é superadmin (falha fechada)', () => {
    expect(rankOf(dono, {} as NodeJS.ProcessEnv)).toBe(3);
  });
});

describe('SuperAdminGuard', () => {
  const OLD = process.env.ADMIN_BOOTSTRAP_EMAIL;
  beforeEach(() => { process.env.ADMIN_BOOTSTRAP_EMAIL = 'dono@exemplo.com'; });
  afterEach(() => { if (OLD === undefined) delete process.env.ADMIN_BOOTSTRAP_EMAIL; else process.env.ADMIN_BOOTSTRAP_EMAIL = OLD; });
  const ctx = (user?: unknown) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any;
  it('libera a conta principal', () => { expect(new SuperAdminGuard().canActivate(ctx(dono))).toBe(true); });
  it('bloqueia outro administrador, operação e sessão sem usuário', () => {
    expect(() => new SuperAdminGuard().canActivate(ctx(admin))).toThrow(ForbiddenException);
    expect(() => new SuperAdminGuard().canActivate(ctx(op))).toThrow(ForbiddenException);
    expect(() => new SuperAdminGuard().canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});
