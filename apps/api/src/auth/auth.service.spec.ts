import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';

jest.mock('argon2', () => ({ hash: jest.fn().mockResolvedValue('hash') }));

describe('AuthService referral attribution', () => {
  function makeService(overrides: Record<string, unknown> = {}) {
    const prisma = {
      usuario: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'user-1', email: 'novo@example.com', papel: 'cotista' }),
      },
      afiliado: { findUnique: jest.fn().mockResolvedValue(null) },
      ...overrides,
    };
    const jwt = { signAsync: jest.fn().mockResolvedValueOnce('access').mockResolvedValueOnce('refresh') };
    const config = {
      getOrThrow: jest.fn((key: string) => key === 'JWT_ACCESS_SECRET' ? 'access-secret' : 'refresh-secret'),
      get: jest.fn((_key: string, fallback: string) => fallback),
    };
    return { service: new AuthService(prisma as any, jwt as any, config as any), prisma };
  }

  const dto = { nome: 'Pessoa Nova', cpf: '52998224725', email: 'novo@example.com', dataNascimento: '1990-01-01', senha: 'senha-segura-12', codigoAfiliado: 'BL-ABC' };

  it('persiste o afiliado aprovado no cadastro', async () => {
    const { service, prisma } = makeService({ afiliado: { findUnique: jest.fn().mockResolvedValue({ id: 'affiliate-1', statusAprovacao: 'aprovado' }) } });
    await service.register(dto as any);
    expect(prisma.usuario.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ indicadoPorAfiliadoId: 'affiliate-1' }) }));
  });

  it('rejeita código inválido sem criar usuário', async () => {
    const { service, prisma } = makeService();
    await expect(service.register(dto as any)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });
});
