import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from './auth.service';
import { legalDocument, LEGAL_VERSION } from '../legal/documents';

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
      aceiteLegal: { upsert: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({ id: 'aceite-1' }) },
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

  const dto = { nome: 'Pessoa Nova', cpf: '52998224725', email: 'novo@example.com', dataNascimento: '1990-01-01', telefone: '11912345678', senha: 'Senha2026', confirmarSenha: 'Senha2026', aceiteTermos: true, aceitePrivacidade: true, codigoAfiliado: 'BL-ABC' };

  it('persiste o afiliado aprovado no cadastro', async () => {
    const { service, prisma } = makeService({ afiliado: { findUnique: jest.fn().mockResolvedValue({ id: 'affiliate-1', statusAprovacao: 'aprovado' }) } });
    await service.register(dto as any);
    expect(prisma.usuario.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ indicadoPorAfiliadoId: 'affiliate-1' }) }));
  });

  describe('cadastro simples (CPF, nome, telefone, e-mail e senha)', () => {
    const simple = { nome: 'Pessoa Nova', cpf: '52998224725', email: 'novo@example.com', telefone: '(11) 91234-5678', senha: 'Senha2026', confirmarSenha: 'Senha2026', aceiteTermos: true, aceitePrivacidade: true };

    it('sem data de nascimento, aceita a declaração de maioridade e guarda só os números do telefone', async () => {
      const { service, prisma } = makeService();
      await service.register({ ...simple, maiorDeIdade: true } as any);
      expect(prisma.usuario.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cpf: '52998224725', telefone: '11912345678', dataNascimento: null }) }));
    });

    it('sem data de nascimento e sem a declaração, não cria a conta', async () => {
      const { service, prisma } = makeService();
      await expect(service.register(simple as any)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.usuario.create).not.toHaveBeenCalled();
    });

    it('se a data de nascimento vier, continua exigindo maior de 18 anos', async () => {
      const { service, prisma } = makeService();
      const recent = new Date(Date.now() - 5 * 365 * 86400000).toISOString().slice(0, 10);
      await expect(service.register({ ...simple, dataNascimento: recent } as any)).rejects.toThrow();
      expect(prisma.usuario.create).not.toHaveBeenCalled();
    });
  });

  it('cotista que chega pelo código do afiliado entra no grupo dele', async () => {
    const { service, prisma } = makeService({ afiliado: { findUnique: jest.fn().mockResolvedValue({ id: 'affiliate-1', statusAprovacao: 'aprovado' }) } });
    await service.register(dto as any);
    expect(prisma.grupoMembro.create).toHaveBeenCalledWith({ data: { grupoId: 'group-1', usuarioId: 'user-1' } });
    expect(prisma.notificacao.create).toHaveBeenCalledWith({ data: expect.objectContaining({ usuarioId: 'owner-1', tipo: 'grupo.novo_membro' }) });
  });

  describe('repetir senha e aceites do cadastro', () => {
    it('recusa quando as senhas não são iguais e não cria nada', async () => {
      const { service, prisma } = makeService();
      await expect(service.register({ ...dto, confirmarSenha: 'Outra2026' } as any)).rejects.toThrow(/senhas não são iguais/);
      expect(prisma.usuario.create).not.toHaveBeenCalled();
    });
    it('grava o aceite dos Termos de Uso e da política de privacidade com IP e versão', async () => {
      const { service, prisma } = makeService();
      const { codigoAfiliado: _code, ...plain } = dto;
      await service.register(plain as any, { ip: '203.0.113.7', userAgent: 'teste' });
      const tipos = prisma.aceiteLegal.upsert.mock.calls.map((call: any[]) => call[0].create.tipo).sort();
      expect(tipos).toEqual(['privacidade', 'termos']);
      expect(prisma.aceiteLegal.upsert.mock.calls[0][0].create).toMatchObject({ usuarioId: 'user-1', ip: '203.0.113.7', userAgent: 'teste' });
    });
  });

  describe('convite de afiliado', () => {
    const inviteDto = { ...dto, codigoAfiliado: 'AF-123', chavePixRepasse: 'pix@exemplo.com' };
    const make = (creatorPapel: string, comissaoPct: unknown = new Prisma.Decimal(12.5)) => makeService({
      usuario: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'user-1', email: 'novo@example.com', papel: 'afiliado' }) },
      convite: { findFirst: jest.fn().mockResolvedValue({ id: 'inv-1', tipo: 'afiliado', afiliadoOrigemId: null, grupoId: null, emailDestino: 'novo@example.com', comissaoPct, criadoPorUsuario: { id: 'creator-1', papel: creatorPapel } }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      afiliado: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'aff-new', usuarioId: 'user-1', comissaoPadraoPct: new Prisma.Decimal(12.5) }) },
      grupo: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'group-new' }) },
      aceiteLegal: { upsert: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({ id: 'aceite-1' }) },
    });
    const approvedEnv = () => Object.assign(process.env, { LEGAL_APPROVED_VERSION: LEGAL_VERSION, LEGAL_OPERATOR_NAME: 'BL', LEGAL_OPERATOR_CNPJ: '1', LEGAL_OPERATOR_ADDRESS: 'x', LEGAL_CONTACT_EMAIL: 'a@b.c', LEGAL_REFUND_TERMS: 'r', LEGAL_AFFILIATE_PAYOUT_TERMS: 'p' });
    const saved = { ...process.env };
    afterEach(() => { process.env = { ...saved }; });

    it('convite do administrador já aprova o afiliado com a comissão do convite e cria o grupo dele', async () => {
      const { service, prisma } = make('admin');
      await service.register(inviteDto as any);
      expect(prisma.afiliado.create).toHaveBeenCalledWith({ data: expect.objectContaining({ statusAprovacao: 'aprovado', aprovadoPor: 'creator-1', chavePixRepasse: 'pix@exemplo.com', comissaoPadraoPct: expect.anything() }) });
      expect(Number((prisma.afiliado.create as jest.Mock).mock.calls[0][0].data.comissaoPadraoPct)).toBe(12.5);
      expect(prisma.grupo.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tipo: 'afiliado', afiliadoId: 'aff-new' }) });
      expect(prisma.grupoMembro.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { grupoId: 'group-new', usuarioId: 'user-1' } }));
    });

    it('convite de afiliado feito por outro afiliado não vale: afiliado só entra por convite do administrador', async () => {
      const { service, prisma } = make('afiliado');
      await expect(service.register(inviteDto as any)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.usuario.create).not.toHaveBeenCalled();
      expect(prisma.afiliado.create).not.toHaveBeenCalled();
    });

    it('com o contrato liberado, exige o aceite do texto mostrado e grava o aceite no cadastro', async () => {
      approvedEnv();
      const { service, prisma } = make('admin');
      await expect(service.register(inviteDto as any)).rejects.toThrow(/contrato/i);
      await expect(service.register({ ...inviteDto, aceiteContratoHash: 'x'.repeat(64) } as any)).rejects.toThrow(/contrato/i);
      expect(prisma.usuario.create).not.toHaveBeenCalled();
      const hash = legalDocument('afiliado', '12.50').hash;
      await service.register({ ...inviteDto, aceiteContratoHash: hash } as any, { ip: '203.0.113.9', userAgent: 'jest' });
      expect(prisma.aceiteLegal.create).toHaveBeenCalledWith({ data: expect.objectContaining({ usuarioId: 'user-1', tipo: 'afiliado', hash, ip: '203.0.113.9' }) });
    });

    it('sem a liberação do contrato pelo operador o cadastro segue e o aceite fica para a área do afiliado', async () => {
      delete process.env.LEGAL_APPROVED_VERSION;
      const { service, prisma } = make('admin');
      await service.register(inviteDto as any);
      expect(prisma.aceiteLegal.create).not.toHaveBeenCalled();
      expect(prisma.afiliado.create).toHaveBeenCalled();
    });
  });

  describe('inviteInfo (link de convite)', () => {
    it('convite de afiliado válido mostra quem convidou e o e-mail', async () => {
      const { service } = makeService({ convite: { findFirst: jest.fn().mockResolvedValue({ tipo: 'afiliado', emailDestino: 'novo@example.com', comissaoPct: new Prisma.Decimal(15), criadoPorUsuario: { nome: 'Marcio Lima', papel: 'admin' }, afiliadoOrigem: null, grupo: null }) } });
      const info: any = await service.inviteInfo('AF-123');
      expect(info).toMatchObject({ valido: true, tipo: 'afiliado', convidadoPor: 'Marcio', email: 'novo@example.com', grupo: null, comissaoPct: '15.00' });
      expect(info.contrato.hash).toBe(legalDocument('afiliado', '15.00').hash);
      expect(info.contrato.texto).toContain('15.00%');
    });
    it('convite de afiliado que não foi feito pelo administrador não é mostrado como válido', async () => {
      const { service } = makeService({ convite: { findFirst: jest.fn().mockResolvedValue({ tipo: 'afiliado', emailDestino: null, comissaoPct: null, criadoPorUsuario: { nome: 'Ana', papel: 'afiliado' }, afiliadoOrigem: null, grupo: null }) } });
      await expect(service.inviteInfo('AF-123')).resolves.toEqual({ valido: false });
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
