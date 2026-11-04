import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

const MAIN = 'dono@bolaolivre.com';
const superadmin = { id: 'sa', papel: 'admin', email: MAIN } as never;
const plainAdmin = { id: 'ad', papel: 'admin', email: 'outro@bolaolivre.com' } as never;

function setup() {
  const prisma: any = {
    convite: {
      create: jest.fn(async ({ data }: any) => ({ id: 'c1', status: 'ativo', grupoId: null, afiliadoOrigemId: null, comissaoPct: null, emailDestino: data.emailDestino ?? null, ...data })),
      findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0),
    },
  };
  prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback(prisma));
  const audit = { record: jest.fn() };
  return { service: new AdminService(prisma, audit as any), prisma, audit };
}

describe('link de cadastro da equipe (gerar, listar e cancelar)', () => {
  const saved = { ...process.env };
  beforeEach(() => { process.env.ADMIN_BOOTSTRAP_EMAIL = MAIN; });
  afterEach(() => { process.env = { ...saved }; });

  it('administrador gera link de operação, com prefixo OP e validade padrão de 7 dias', async () => {
    const { service, prisma } = setup();
    const result = await service.createInvite({ tipo: 'operacao' } as never, plainAdmin);
    expect(result.codigo).toMatch(/^OP-/);
    expect(result.caminho).toBe(`/r/${result.codigo}`);
    const days = (prisma.convite.create.mock.calls[0][0].data.expiraEm.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9); expect(days).toBeLessThan(7.1);
  });

  it('só o superadmin gera link de administrador, e com e-mail definido', async () => {
    const { service } = setup();
    await expect(service.createInvite({ tipo: 'admin', emailDestino: 'a@b.com' } as never, plainAdmin)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createInvite({ tipo: 'admin' } as never, superadmin)).rejects.toThrow(/e-mail/);
    const ok = await service.createInvite({ tipo: 'admin', emailDestino: 'A@B.com' } as never, superadmin);
    expect(ok.codigo).toMatch(/^ADM-/); expect(ok.emailDestino).toBe('a@b.com');
  });

  it('afiliado e operação não geram link da equipe', async () => {
    const { service } = setup();
    await expect(service.createInvite({ tipo: 'operacao' } as never, { id: 'x', papel: 'operacao' } as never)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createInvite({ tipo: 'operacao' } as never, { id: 'y', papel: 'afiliado' } as never)).rejects.toBeInstanceOf(Error);
  });

  it('link da equipe não leva grupo, comissão nem afiliado e não passa de 30 dias', async () => {
    const { service } = setup();
    await expect(service.createInvite({ tipo: 'operacao', comissaoPct: 10 } as never, plainAdmin)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.createInvite({ tipo: 'operacao', grupoId: 'g1' } as never, plainAdmin)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.createInvite({ tipo: 'operacao', expiraEm: new Date(Date.now() + 40 * 86_400_000).toISOString() } as never, plainAdmin)).rejects.toThrow(/30 dias/);
  });

  it('lista só os convites pedidos e esconde link de administrador de outra pessoa', async () => {
    const { service, prisma } = setup();
    await service.listInvites({ tipo: 'operacao' } as never, plainAdmin);
    const where = prisma.convite.findMany.mock.calls[0][0].where;
    expect(where.tipo).toBe('operacao');
    expect(where.NOT).toEqual({ tipo: 'admin', criadoPorUsuarioId: { not: 'ad' } });
    await service.listInvites({} as never, superadmin);
    expect(prisma.convite.findMany.mock.calls[1][0].where.NOT).toBeUndefined();
  });

  it('cancela um link ainda não usado e registra no histórico', async () => {
    const { service, prisma, audit } = setup();
    prisma.convite.findUnique.mockResolvedValue({ id: 'c1', codigo: 'OP-1', tipo: 'operacao', status: 'ativo', criadoPorUsuarioId: 'sa' });
    expect(await service.revokeInvite('c1', plainAdmin)).toEqual({ id: 'c1', status: 'revogado' });
    expect(prisma.convite.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'revogado' } });
    expect(audit.record).toHaveBeenCalledWith(prisma, expect.objectContaining({ evento: 'convite.revogado' }));
  });

  it('não cancela convite já usado, inexistente, nem link de administrador de outro', async () => {
    const { service, prisma } = setup();
    prisma.convite.findUnique.mockResolvedValue(null);
    await expect(service.revokeInvite('x', plainAdmin)).rejects.toBeInstanceOf(NotFoundException);
    prisma.convite.findUnique.mockResolvedValue({ id: 'c1', tipo: 'operacao', status: 'usado', criadoPorUsuarioId: 'sa' });
    await expect(service.revokeInvite('c1', plainAdmin)).rejects.toBeInstanceOf(ConflictException);
    prisma.convite.findUnique.mockResolvedValue({ id: 'c2', tipo: 'admin', status: 'ativo', criadoPorUsuarioId: 'sa' });
    await expect(service.revokeInvite('c2', plainAdmin)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.convite.update).not.toHaveBeenCalled();
  });
});
