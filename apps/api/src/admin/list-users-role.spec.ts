import { AdminService } from './admin.service';

const DONO = { id: 'dono', email: 'dono@exemplo.com', papel: 'admin' } as any;
const OUTRO_ADMIN = { id: 'adm2', email: 'outro@exemplo.com', papel: 'admin' } as any;

describe('Lista de usuários por tipo de pessoa', () => {
  function setup() {
    const prisma: any = { usuario: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
    return { service: new AdminService(prisma, { record: jest.fn() } as any), prisma };
  }
  it('equipe = administrador e operação', async () => {
    const { service, prisma } = setup();
    await service.listUsers({ papel: 'equipe' } as any, DONO);
    expect(prisma.usuario.findMany.mock.calls[0][0].where).toMatchObject({ papel: { in: ['admin', 'operacao'] }, desativadoEm: null });
  });
  it('filtra afiliados e clientes pelo papel exato', async () => {
    const { service, prisma } = setup();
    await service.listUsers({ papel: 'afiliado' } as any, DONO);
    await service.listUsers({ papel: 'cotista' } as any, DONO);
    expect(prisma.usuario.findMany.mock.calls[0][0].where.papel).toBe('afiliado');
    expect(prisma.usuario.findMany.mock.calls[1][0].where.papel).toBe('cotista');
  });
  it('sem filtro lista todos os papéis', async () => {
    const { service, prisma } = setup();
    await service.listUsers({} as any, DONO);
    expect(prisma.usuario.findMany.mock.calls[0][0].where.papel).toBeUndefined();
  });

  describe('quem aparece na lista (hierarquia)', () => {
    const OLD = process.env.ADMIN_BOOTSTRAP_EMAIL;
    beforeEach(() => { process.env.ADMIN_BOOTSTRAP_EMAIL = 'dono@exemplo.com'; });
    afterEach(() => { if (OLD === undefined) delete process.env.ADMIN_BOOTSTRAP_EMAIL; else process.env.ADMIN_BOOTSTRAP_EMAIL = OLD; });
    it('o superadmin vê todas as contas', async () => {
      const { service, prisma } = setup();
      await service.listUsers({} as any, DONO);
      expect(prisma.usuario.findMany.mock.calls[0][0].where.AND).toEqual([{}]);
    });
    it('administrador comum só vê níveis abaixo e a própria conta', async () => {
      const { service, prisma } = setup();
      await service.listUsers({} as any, OUTRO_ADMIN);
      expect(prisma.usuario.findMany.mock.calls[0][0].where.AND).toEqual([{ OR: [{ id: 'adm2' }, { papel: { in: ['cotista', 'operacao'] } }, { papel: 'afiliado', afiliado: { aprovadoPor: 'adm2' } }] }]);
    });
  });
});
