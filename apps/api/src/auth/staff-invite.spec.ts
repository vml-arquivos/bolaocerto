import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';

jest.mock('argon2', () => ({ hash: jest.fn().mockResolvedValue('hash') }));

const MAIN_ADMIN = 'dono@bolaolivre.com';

function setup(invite: unknown, createdPapel = 'operacao') {
  const prisma: any = {
    usuario: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'u1', email: 'equipe@example.com', papel: createdPapel }) },
    afiliado: { findUnique: jest.fn().mockResolvedValue(null) },
    convite: { findFirst: jest.fn().mockResolvedValue(invite), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    grupo: { findFirst: jest.fn() }, grupoMembro: { upsert: jest.fn() }, notificacao: { create: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback(prisma));
  const audit = { record: jest.fn() };
  const config = { getOrThrow: jest.fn(() => 'secret'), get: jest.fn((_k: string, fallback: string) => fallback) };
  const jwt = { signAsync: jest.fn().mockResolvedValue('token') };
  return { service: new AuthService(prisma, jwt as any, config as any, audit as any), prisma, audit };
}

const dto = { nome: 'Pessoa Equipe', cpf: '52998224725', email: 'equipe@example.com', dataNascimento: '1990-01-01', senha: 'Senha2026', codigoAfiliado: 'OP-ABC' };
const invite = (tipo: string, creator: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id: 'inv1', tipo, afiliadoOrigemId: null, grupoId: null, emailDestino: null, comissaoPct: null, criadoPorUsuario: { id: 'adm1', papel: 'admin', email: 'outro@x.com', desativadoEm: null, ...creator }, ...extra });

describe('cadastro pelo link da equipe', () => {
  const saved = { ...process.env };
  beforeEach(() => { process.env.ADMIN_BOOTSTRAP_EMAIL = MAIN_ADMIN; });
  afterEach(() => { process.env = { ...saved }; });

  it('link de operação feito por administrador cria a conta já como operação', async () => {
    const { service, prisma, audit } = setup(invite('operacao', {}));
    await service.register(dto as any);
    expect(prisma.usuario.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ papel: 'operacao' }) }));
    expect(prisma.convite.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'usado' }) }));
    expect(audit.record).toHaveBeenCalledWith(prisma, expect.objectContaining({ evento: 'equipe.cadastro_por_link' }));
  });

  it('link de administrador só vale se foi gerado pelo superadmin', async () => {
    const ok = setup(invite('admin', { email: MAIN_ADMIN }, { emailDestino: 'equipe@example.com' }), 'admin');
    await ok.service.register(dto as any);
    expect(ok.prisma.usuario.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ papel: 'admin' }) }));

    const plain = setup(invite('admin', { email: 'outro@x.com' }, { emailDestino: 'equipe@example.com' }), 'admin');
    await expect(plain.service.register(dto as any)).rejects.toBeInstanceOf(ConflictException);
    expect(plain.prisma.usuario.create).not.toHaveBeenCalled();
  });

  it('não vale se quem gerou perdeu o acesso ou não é mais administrador', async () => {
    for (const creator of [{ desativadoEm: new Date() }, { papel: 'operacao' }, { papel: 'cotista' }]) {
      const { service, prisma } = setup(invite('operacao', creator));
      await expect(service.register(dto as any)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.usuario.create).not.toHaveBeenCalled();
    }
  });

  it('respeita o e-mail do convite', async () => {
    const { service, prisma } = setup(invite('operacao', {}, { emailDestino: 'outra@pessoa.com' }));
    await expect(service.register(dto as any)).rejects.toThrow(/outro e-mail/);
    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });

  it('a tela de cadastro recebe o tipo "equipe" e o papel, sem expor o e-mail de quem gerou', async () => {
    const { service, prisma } = setup(null);
    prisma.convite.findFirst.mockResolvedValue({ tipo: 'operacao', emailDestino: null, comissaoPct: null, criadoPorUsuario: { nome: 'Marcio Lima', papel: 'admin', email: 'x@x.com', desativadoEm: null }, afiliadoOrigem: null, grupo: null });
    const info = await service.inviteInfo('OP-ABC');
    expect(info).toMatchObject({ valido: true, tipo: 'equipe', papel: 'operacao', convidadoPor: 'Marcio' });
    expect(JSON.stringify(info)).not.toContain('x@x.com');
    prisma.convite.findFirst.mockResolvedValue({ tipo: 'admin', emailDestino: null, comissaoPct: null, criadoPorUsuario: { nome: 'Fulano', papel: 'admin', email: 'x@x.com', desativadoEm: null }, afiliadoOrigem: null, grupo: null });
    expect(await service.inviteInfo('ADM-ABC')).toEqual({ valido: false });
  });
});
