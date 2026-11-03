import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';

jest.mock('argon2', () => ({ hash: jest.fn().mockResolvedValue('hash') }));

describe('AuthService referral attribution', () => {
  function makeService(overrides: Record<string, unknown> = {}) {
    const prisma: any = {
      usuario: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ nome: 'Pessoa Nova' }),
        create: jest.fn().mockResolvedValue({ id: 'user-1', email: 'novo@example.com', papel: 'cotista' }),
      },
      afiliado: { findUnique: jest.fn().mockResolvedValue(null) },
      convite: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      grupo: { findFirst: jest.fn().mockResolvedValue({ id: 'group-1', nome: 'Grupo de Ana', afiliado: { usuarioId: 'owner-1' } }), create: jest.fn().mockResolvedValue({ id: 'group-new' }) },
      grupoMembro: { upsert: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      notificacao: { create: jest.fn().mockResolvedValue({}) },
      ...overrides,
    };
    prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback(prisma));
    const jwt = { signAsync: jest.fn().mockResolvedValueOnce('access').mockResolvedValueOnce('refresh') };
    const config = {
      getOrThrow: jest.fn((key: string) => key === 'JWT_ACCESS_SECRET' ? 'access-secret' : 'refresh-secret'),
      get: jest.fn((_key: string, fallback: string) => fallback),
    };
    return { service: new AuthService(prisma as any, jwt as any, config as any), prisma };
  }

  const dto = { nome: 'Pessoa Nova', cpf: '52998224725', email: 'novo@example.com', dataNascimento: '1990-01-01', senha: 'Senha2026', codigoAfiliado: 'BL-ABC' };

  it('persiste o afiliado aprovado no cadastro', async () => {
    const { service, prisma } = makeService({ afiliado: { findUnique: jest.fn().mockResolvedValue({ id: 'affiliate-1', statusAprovacao: 'aprovado' }) } });
    await service.register(dto as any);
    expect(prisma.usuario.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ indicadoPorAfiliadoId: 'affiliate-1' }) }));
  });

  it('cotista que chega pelo código do afiliado entra no grupo dele', async () => {
    const { service, prisma } = makeService({ afiliado: { findUnique: jest.fn().mockResolvedValue({ id: 'affiliate-1', statusAprovacao: 'aprovado' }) } });
    await service.register(dto as any);
    expect(prisma.grupoMembro.create).toHaveBeenCalledWith({ data: { grupoId: 'group-1', usuarioId: 'user-1' } });
    expect(prisma.notificacao.create).toHaveBeenCalledWith({ data: expect.objectContaining({ usuarioId: 'owner-1', tipo: 'grupo.novo_membro' }) });
  });

  describe('convite de afiliado', () => {
    const inviteDto = { ...dto, codigoAfiliado: 'AF-123', chavePixRepasse: 'pix@exemplo.com' };
    const make = (creatorPapel: string) => makeService({
      usuario: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'user-1', email: 'novo@example.com', papel: 'afiliado' }) },
      convite: { findFirst: jest.fn().mockResolvedValue({ id: 'inv-1', tipo: 'afiliado', afiliadoOrigemId: null, grupoId: null, emailDestino: 'novo@example.com', criadoPorUsuario: { id: 'creator-1', papel: creatorPapel } }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      afiliado: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'aff-new', usuarioId: 'user-1' }) },
      grupo: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'group-new' }) },
    });

    it('convite do administrador já aprova o afiliado e cria o grupo dele', async () => {
      const { service, prisma } = make('admin');
      await service.register(inviteDto as any);
      expect(prisma.afiliado.create).toHaveBeenCalledWith({ data: expect.objectContaining({ statusAprovacao: 'aprovado', aprovadoPor: 'creator-1', chavePixRepasse: 'pix@exemplo.com' }) });
      expect(prisma.grupo.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tipo: 'afiliado', afiliadoId: 'aff-new' }) });
      expect(prisma.grupoMembro.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { grupoId: 'group-new', usuarioId: 'user-1' } }));
    });

    it('convite de outro afiliado fica aguardando aprovação e não cria grupo', async () => {
      const { service, prisma } = make('afiliado');
      await service.register(inviteDto as any);
      expect(prisma.afiliado.create).toHaveBeenCalledWith({ data: expect.objectContaining({ statusAprovacao: 'pendente' }) });
      expect(prisma.grupo.create).not.toHaveBeenCalled();
    });
  });

  describe('inviteInfo (link de convite)', () => {
    it('convite de afiliado válido mostra quem convidou e o e-mail', async () => {
      const { service } = makeService({ convite: { findFirst: jest.fn().mockResolvedValue({ tipo: 'afiliado', emailDestino: 'novo@example.com', criadoPorUsuario: { nome: 'Marcio Lima', papel: 'admin' }, afiliadoOrigem: null, grupo: null }) } });
      await expect(service.inviteInfo('AF-123')).resolves.toEqual({ valido: true, tipo: 'afiliado', convidadoPor: 'Marcio', email: 'novo@example.com', grupo: null });
    });
    it('código de afiliado aprovado vira indicação', async () => {
      const { service } = makeService({ afiliado: { findUnique: jest.fn().mockResolvedValue({ statusAprovacao: 'aprovado', usuario: { nome: 'Ana Paula' } }) } });
      await expect(service.inviteInfo('BL-ABC')).resolves.toEqual({ valido: true, tipo: 'indicacao', convidadoPor: 'Ana', email: null, grupo: null });
    });
    it('código desconhecido ou afiliado não aprovado não revela nada', async () => {
      const { service } = makeService({ afiliado: { findUnique: jest.fn().mockResolvedValue({ statusAprovacao: 'pendente', usuario: { nome: 'X' } }) } });
      await expect(service.inviteInfo('BL-ABC')).resolves.toEqual({ valido: false });
      await expect(service.inviteInfo('')).resolves.toEqual({ valido: false });
    });
  });

  it('rejeita código inválido sem criar usuário', async () => {
    const { service, prisma } = makeService();
    await expect(service.register(dto as any)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });
});
