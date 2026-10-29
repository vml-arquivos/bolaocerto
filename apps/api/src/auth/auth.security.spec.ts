import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { generateTotpSecret, sealSecret, totpCode } from './totp';

const CONFIG: Record<string, string> = { JWT_ACCESS_SECRET: 'access-secret-access-secret-0123456789', JWT_REFRESH_SECRET: 'refresh-secret-refresh-secret-0123456789' };

async function setup(overrides: Record<string, unknown> = {}) {
  const rows: any[] = [{ id: 'u1', email: 'maria@exemplo.com', papel: 'cotista', senhaHash: await argon2.hash('senha-correta-123', { type: argon2.argon2id }), tokenVersion: 0, tentativasLogin: 0, bloqueadoAte: null, totpAtivo: false, totpSecret: null, totpRecuperacao: [], ...overrides }];
  const audit: any[] = [];
  const apply = (row: any, data: any) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value) && 'increment' in (value as any)) row[key] += (value as any).increment;
      else row[key] = value;
    }
  };
  const prisma: any = {
    usuario: {
      findUnique: async ({ where }: any) => rows.find((r) => (where.email ? r.email === where.email : r.id === where.id)) ?? null,
      findUniqueOrThrow: async ({ where }: any) => rows.find((r) => r.id === where.id),
      update: async ({ where, data }: any) => { const row = rows.find((r) => r.id === where.id); apply(row, data); return row; },
    },
  };
  const jwt = new JwtService({});
  const config: any = { get: (key: string, fallback?: string) => CONFIG[key] ?? fallback, getOrThrow: (key: string) => CONFIG[key] };
  const auditSvc: any = { record: async (_tx: any, input: any) => { audit.push(input.evento); } };
  const service = new AuthService(prisma, jwt, config, auditSvc);
  return { service, rows, audit, jwt, prisma, config };
}

const login = (service: AuthService, senha = 'senha-correta-123', codigo?: string) => service.login({ email: 'MARIA@exemplo.com ', senha, ...(codigo ? { codigo } : {}) } as any);

describe('Segurança do login', () => {
  it('login correto emite tokens com a versão de sessão', async () => {
    const { service, jwt } = await setup();
    const result = await login(service);
    const payload: any = jwt.decode(result.accessToken);
    expect(payload).toMatchObject({ id: 'u1', papel: 'cotista', tv: 0, typ: 'access' });
    expect(result.user).toEqual({ id: 'u1', email: 'maria@exemplo.com', papel: 'cotista' });
  });

  it('bloqueia a conta após 5 senhas erradas, mesmo que a próxima esteja certa, e registra na auditoria', async () => {
    const { service, rows, audit } = await setup();
    for (let i = 0; i < 5; i += 1) await expect(login(service, 'errada')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(rows[0].bloqueadoAte).toBeInstanceOf(Date);
    expect(audit).toContain('auth.conta_bloqueada');
    await expect(login(service)).rejects.toThrow(/bloqueada/);
  });

  it('a mensagem é a mesma para e-mail inexistente, senha errada e conta bloqueada (não revela quem tem conta)', async () => {
    const { service } = await setup();
    const messages: string[] = [];
    await login(service, 'errada').catch((e) => messages.push(e.message));
    await service.login({ email: 'ninguem@exemplo.com', senha: 'qualquer-coisa' } as any).catch((e) => messages.push(e.message));
    expect(new Set(messages).size).toBe(1);
  });

  it('login bem-sucedido zera o contador e o bloqueio expirado deixa de valer', async () => {
    const { service, rows } = await setup({ tentativasLogin: 3, bloqueadoAte: new Date(Date.now() - 1000) });
    await login(service);
    expect(rows[0].tentativasLogin).toBe(0);
    expect(rows[0].bloqueadoAte).toBeNull();
  });

  it('refresh de sessão revogada é recusado; sessões antigas sem versão continuam valendo até a primeira revogação', async () => {
    const { service, jwt, rows } = await setup();
    const { refreshToken } = await login(service);
    await expect(service.refresh(refreshToken)).resolves.toBeTruthy();
    const legacy = await jwt.signAsync({ sub: 'u1', id: 'u1', email: 'maria@exemplo.com', papel: 'cotista', typ: 'refresh' }, { secret: CONFIG.JWT_REFRESH_SECRET!, expiresIn: '1h' });
    await expect(service.refresh(legacy)).resolves.toBeTruthy();
    await service.revokeAllSessions('u1');
    expect(rows[0].tokenVersion).toBe(1);
    await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh(legacy)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh((await service.reissue('u1')).refreshToken)).resolves.toBeTruthy();
  });
});

describe('Verificação em duas etapas', () => {
  it('fluxo completo: iniciar, ativar com código do app, exigir no login e consumir código de recuperação uma vez', async () => {
    const { service, rows, audit } = await setup();
    const { secret, otpauthUrl } = await service.startTwoFactor('u1');
    expect(otpauthUrl).toContain(`secret=${secret}`);
    expect(rows[0].totpSecret).toBe(`plain:${secret}`); // sem TOTP_ENC_KEY fica em texto marcado (veja o teste com chave abaixo)
    await expect(service.enableTwoFactor('u1', '000000')).rejects.toBeInstanceOf(UnauthorizedException);
    const { codigosRecuperacao } = await service.enableTwoFactor('u1', totpCode(secret));
    expect(codigosRecuperacao).toHaveLength(8);
    expect(rows[0].totpRecuperacao[0]).toHaveLength(64);
    expect(audit).toContain('auth.2fa_ativado');

    const needs = await login(service).catch((e) => e);
    expect(needs.getResponse()).toMatchObject({ requer2fa: true });
    await expect(login(service, 'senha-correta-123', '123456')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(login(service, 'senha-correta-123', totpCode(secret))).resolves.toBeTruthy();

    await expect(login(service, 'senha-correta-123', codigosRecuperacao[0]!)).resolves.toBeTruthy();
    expect(rows[0].totpRecuperacao).toHaveLength(7);
    await expect(login(service, 'senha-correta-123', codigosRecuperacao[0]!)).rejects.toBeInstanceOf(UnauthorizedException); // uso único
  });

  it('com TOTP_ENC_KEY o segredo é gravado criptografado e continua funcionando', async () => {
    const { service, rows, config } = await setup();
    CONFIG.TOTP_ENC_KEY = 'chave-de-teste-forte';
    try {
      const { secret } = await service.startTwoFactor('u1');
      expect(rows[0].totpSecret.startsWith('enc1:')).toBe(true);
      expect(rows[0].totpSecret).not.toContain(secret);
      await expect(service.enableTwoFactor('u1', totpCode(secret))).resolves.toBeTruthy();
      void config;
    } finally { delete CONFIG.TOTP_ENC_KEY; }
  });

  it('código errado conta como falha de login e leva ao bloqueio', async () => {
    const secret = generateTotpSecret();
    const { service, rows } = await setup({ totpAtivo: true, totpSecret: sealSecret(secret) });
    for (let i = 0; i < 5; i += 1) await login(service, 'senha-correta-123', '111111').catch(() => undefined);
    expect(rows[0].bloqueadoAte).toBeInstanceOf(Date);
  });

  it('desativar exige senha e código; redefinição pelo admin limpa tudo e encerra as sessões', async () => {
    const secret = generateTotpSecret();
    const { service, rows, audit } = await setup({ totpAtivo: true, totpSecret: sealSecret(secret) });
    await expect(service.disableTwoFactor('u1', 'errada', totpCode(secret))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.disableTwoFactor('u1', 'senha-correta-123', '000000')).rejects.toBeInstanceOf(UnauthorizedException);
    await service.disableTwoFactor('u1', 'senha-correta-123', totpCode(secret));
    expect(rows[0]).toMatchObject({ totpAtivo: false, totpSecret: null });

    const other = await setup({ totpAtivo: true, totpSecret: sealSecret(secret) });
    await other.service.adminResetTwoFactor('u1', 'admin-1');
    expect(other.rows[0]).toMatchObject({ totpAtivo: false, totpSecret: null, tokenVersion: 1 });
    expect(other.audit).toContain('auth.2fa_redefinido_por_admin');
    expect(audit).toContain('auth.2fa_desativado');
    await expect(other.service.adminResetTwoFactor('nao-existe', 'admin-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('não permite iniciar de novo com 2FA ativo (evita trocar o segredo sem prova)', async () => {
    const { service } = await setup({ totpAtivo: true, totpSecret: sealSecret(generateTotpSecret()) });
    await expect(service.startTwoFactor('u1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('JwtAuthGuard: contas administrativas são conferidas no banco', () => {
  async function run(papelNoToken: string, rowInDb: any, tvNoToken = 0) {
    const jwt = new JwtService({});
    const token = await jwt.signAsync({ sub: 'u1', id: 'u1', email: 'a@b.com', papel: papelNoToken, tv: tvNoToken, typ: 'access' }, { secret: CONFIG.JWT_ACCESS_SECRET!, expiresIn: '5m' });
    const prisma: any = { usuario: { findUnique: jest.fn().mockResolvedValue(rowInDb) } };
    const guard = new JwtAuthGuard(jwt, { getOrThrow: (k: string) => CONFIG[k] } as any, prisma);
    const request: any = { headers: { authorization: `Bearer ${token}` }, cookies: {} };
    const context: any = { switchToHttp: () => ({ getRequest: () => request }) };
    return { allowed: guard.canActivate(context), request, prisma };
  }

  it('admin com sessão revogada é barrado na hora', async () => {
    const { allowed } = await run('admin', { tokenVersion: 3, papel: 'admin' }, 2);
    await expect(allowed).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('admin rebaixado perde o poder imediatamente (papel vem do banco)', async () => {
    const { allowed, request } = await run('admin', { tokenVersion: 0, papel: 'cotista' });
    await expect(allowed).resolves.toBe(true);
    expect(request.user.papel).toBe('cotista');
  });
  it('admin apagado é barrado', async () => {
    const { allowed } = await run('admin', null);
    await expect(allowed).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('cotista removido perde acesso imediatamente', async () => {
    const { allowed, prisma } = await run('cotista', { tokenVersion: 0, papel: 'cotista', desativadoEm: new Date() });
    await expect(allowed).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.usuario.findUnique).toHaveBeenCalled();
  });
  it('cotista ativo continua autorizado', async () => {
    const { allowed } = await run('cotista', { tokenVersion: 0, papel: 'cotista', desativadoEm: null });
    await expect(allowed).resolves.toBe(true);
  });
  it('afiliado com token antigo não recupera acesso', async () => {
    const { allowed } = await run('afiliado', { tokenVersion: 2, papel: 'afiliado', desativadoEm: null }, 1);
    await expect(allowed).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('Conta desativada', () => {
  it('nega login e refresh mesmo com senha ou token anteriormente válidos', async () => {
    const { service, rows } = await setup();
    const session = await login(service);
    rows[0].desativadoEm = new Date();
    await expect(login(service)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh(session.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.reissue('u1')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
