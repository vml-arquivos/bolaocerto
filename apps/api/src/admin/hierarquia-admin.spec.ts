import { ForbiddenException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminUsersService } from './admin-users.service';
import { assertCanGrantRole, assertCanSeeAccount, ownsAffiliate } from './superadmin';

/** Hierarquia: só a conta principal cria administrador; o administrador comum só vê os afiliados que ele trouxe. */
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

  it('afiliado pertence a quem o trouxe; a conta principal vê todos', async () => {
    expect(ownsAffiliate(comum, 'a2')).toBe(true);
    expect(ownsAffiliate(comum, 'outro')).toBe(false);
    expect(ownsAffiliate(comum, null)).toBe(false);
    expect(ownsAffiliate(principal, 'outro')).toBe(true);
    const db = { afiliado: { findUnique: jest.fn().mockResolvedValue({ aprovadoPor: 'outro' }) } };
    await expect(assertCanSeeAccount(db as any, comum, { id: 'u9', papel: 'afiliado' })).rejects.toThrow(/outro administrador/);
    await expect(assertCanSeeAccount(db as any, principal, { id: 'u9', papel: 'afiliado' })).resolves.toBeUndefined();
    await expect(assertCanSeeAccount(db as any, comum, { id: 'u8', papel: 'cotista' })).resolves.toBeUndefined();
    expect(db.afiliado.findUnique).toHaveBeenCalledTimes(1);
  });

  it('lista de afiliados: o comum só vê os próprios; a conta principal vê todos', async () => {
    const prisma = { afiliado: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) }, aceiteLegal: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new AdminService(prisma as any, { record: jest.fn() } as any);
    await service.listAffiliates({} as any, comum);
    expect(prisma.afiliado.findMany.mock.calls[0][0].where.aprovadoPor).toBe('a2');
    await service.listAffiliates({} as any, principal);
    expect(prisma.afiliado.findMany.mock.calls[1][0].where.aprovadoPor).toBeUndefined();
  });

  it('o comum não abre nem muda comissão de afiliado de outro administrador', async () => {
    const prisma: any = { afiliado: { findUnique: jest.fn().mockResolvedValue({ id: 'af1', usuarioId: 'u9', aprovadoPor: 'outro', comissaoPadraoPct: 10 }) }, $transaction: jest.fn() };
    const service = new AdminService(prisma, { record: jest.fn() } as any);
    await expect(service.updateAffiliateCommission('af1', { comissaoPadraoPct: 20 } as any, comum)).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    const users = new AdminUsersService({ usuario: { findUnique: jest.fn().mockResolvedValue({ id: 'u9', email: 'af@x.com', papel: 'afiliado', cpf: '11144477735' }) }, afiliado: prisma.afiliado } as any, { record: jest.fn() } as any, {} as any);
    await expect(users.detail('u9', comum)).rejects.toThrow(/outro administrador/);
    await expect(users.detail('u9', principal)).resolves.toMatchObject({ id: 'u9' });
  });
});
