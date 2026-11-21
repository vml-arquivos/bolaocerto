import { ForbiddenException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminUsersService } from './admin-users.service';
import { assertCanGrantRole, assertCanSeeAccount, ownsAffiliate } from './superadmin';

/** Hierarquia: só a conta principal cria administrador e libera funções; o administrador comum vê todos os afiliados e as contas do mesmo nível e abaixo, nunca a conta principal. */
describe('Hierarquia de administradores', () => {
  const OLD = process.env.ADMIN_BOOTSTRAP_EMAIL;
  beforeEach(() => { process.env.ADMIN_BOOTSTRAP_EMAIL = 'principal@x.com'; });
  afterEach(() => { if (OLD === undefined) delete process.env.ADMIN_BOOTSTRAP_EMAIL; else process.env.ADMIN_BOOTSTRAP_EMAIL = OLD; });
  const principal = { id: 'p1', email: 'principal@x.com', papel: 'admin' } as any;
  const comum = { id: 'a2', email: 'comum@x.com', papel: 'admin' } as any;

  it('só a conta principal concede o papel de administrador; o comum concede afiliado e equipe', () => {
    expect(() => assertCanGrantRole(principal, 'admin')).not.toThrow();
    expect(() => assertCanGrantRole(comum, 'admin')).toThrow(ForbiddenException);
    for (const papel of ['cotista', 'afiliado', 'operacao']) expect(() => assertCanGrantRole(comum, papel)).not.toThrow();
  });

  it('todo administrador vê e cuida de todos os afiliados; a conta principal fica escondida', async () => {
    expect(ownsAffiliate(comum, 'a2')).toBe(true);
    expect(ownsAffiliate(comum, 'outro')).toBe(true);
    expect(ownsAffiliate(comum, null)).toBe(true);
    expect(ownsAffiliate(principal, 'outro')).toBe(true);
    const db = { afiliado: { findUnique: jest.fn().mockResolvedValue({ aprovadoPor: 'outro' }) } };
    await expect(assertCanSeeAccount(db as any, comum, { id: 'u9', papel: 'afiliado' })).resolves.toBeUndefined();
    await expect(assertCanSeeAccount(db as any, comum, { id: 'u8', papel: 'cotista' })).resolves.toBeUndefined();
    await expect(assertCanSeeAccount(db as any, comum, { id: 'p1', papel: 'admin', email: 'principal@x.com' })).rejects.toThrow(ForbiddenException);
    await expect(assertCanSeeAccount(db as any, principal, { id: 'p1', papel: 'admin', email: 'principal@x.com' })).resolves.toBeUndefined();
  });

  it('lista de afiliados: sem filtro por quem trouxe para ninguém', async () => {
    const prisma = { afiliado: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) }, aceiteLegal: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new AdminService(prisma as any, { record: jest.fn() } as any);
    await service.listAffiliates({} as any, comum);
    expect(prisma.afiliado.findMany.mock.calls[0][0].where.aprovadoPor).toBeUndefined();
    await service.listAffiliates({} as any, principal);
    expect(prisma.afiliado.findMany.mock.calls[1][0].where.aprovadoPor).toBeUndefined();
  });

  it('lista de usuários: o comum vê todos menos a conta principal; a principal vê todos', async () => {
    const prisma = { usuario: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
    const service = new AdminService(prisma as any, { record: jest.fn() } as any);
    await service.listUsers({} as any, comum);
    expect(prisma.usuario.findMany.mock.calls[0][0].where.AND).toEqual([{ NOT: { email: { equals: 'principal@x.com', mode: 'insensitive' } } }]);
    await service.listUsers({} as any, principal);
    expect(prisma.usuario.findMany.mock.calls[1][0].where.AND).toEqual([{}]);
  });

  it('o comum abre e muda a comissão de qualquer afiliado, mas não abre a conta principal', async () => {
    const users = new AdminUsersService({ usuario: { findUnique: jest.fn().mockResolvedValue({ id: 'u9', email: 'af@x.com', papel: 'afiliado', cpf: '11144477735' }) }, afiliado: { findUnique: jest.fn().mockResolvedValue({ aprovadoPor: 'outro' }) } } as any, { record: jest.fn() } as any, {} as any);
    await expect(users.detail('u9', comum)).resolves.toMatchObject({ id: 'u9' });
    const main = new AdminUsersService({ usuario: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', email: 'principal@x.com', papel: 'admin', cpf: '11144477735' }) }, afiliado: { findUnique: jest.fn() } } as any, { record: jest.fn() } as any, {} as any);
    await expect(main.detail('p1', comum)).rejects.toThrow(ForbiddenException);
  });
});
