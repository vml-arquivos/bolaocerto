import { AdminService } from './admin.service';

describe('Lista de usuários por tipo de pessoa', () => {
  function setup() {
    const prisma: any = { usuario: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
    return { service: new AdminService(prisma, { record: jest.fn() } as any), prisma };
  }
  it('equipe = administrador e operação', async () => {
    const { service, prisma } = setup();
    await service.listUsers({ papel: 'equipe' } as any);
    expect(prisma.usuario.findMany.mock.calls[0][0].where).toMatchObject({ papel: { in: ['admin', 'operacao'] }, desativadoEm: null });
  });
  it('filtra afiliados e clientes pelo papel exato', async () => {
    const { service, prisma } = setup();
    await service.listUsers({ papel: 'afiliado' } as any);
    await service.listUsers({ papel: 'cotista' } as any);
    expect(prisma.usuario.findMany.mock.calls[0][0].where.papel).toBe('afiliado');
    expect(prisma.usuario.findMany.mock.calls[1][0].where.papel).toBe('cotista');
  });
  it('sem filtro lista todos os papéis', async () => {
    const { service, prisma } = setup();
    await service.listUsers({} as any);
    expect(prisma.usuario.findMany.mock.calls[0][0].where.papel).toBeUndefined();
  });
});
