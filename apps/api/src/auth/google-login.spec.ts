import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { verifyGoogleIdToken } from './google';

const CID = 'cliente-123.apps.googleusercontent.com';
const CONFIG: Record<string, string> = { JWT_ACCESS_SECRET: 'access-secret-access-secret-0123456789', JWT_REFRESH_SECRET: 'refresh-secret-refresh-secret-0123456789', GOOGLE_CLIENT_ID: CID };
const good = { aud: CID, iss: 'https://accounts.google.com', email: 'Maria@Exemplo.com', email_verified: 'true', sub: 'g-123', name: 'Maria Silva', exp: String(Math.floor(Date.now() / 1000) + 600) };
const fake = (body: unknown, ok = true) => async () => ({ ok, json: async () => body });

describe('verifyGoogleIdToken', () => {
  it('aceita token válido e normaliza o e-mail', async () => {
    await expect(verifyGoogleIdToken('x'.repeat(30), CID, fake(good))).resolves.toEqual({ sub: 'g-123', email: 'maria@exemplo.com', nome: 'Maria Silva' });
  });
  it.each([
    ['client id de outro app', { ...good, aud: 'outro' }],
    ['e-mail não verificado', { ...good, email_verified: 'false' }],
    ['emissor desconhecido', { ...good, iss: 'https://evil.example' }],
    ['expirado', { ...good, exp: '1000' }],
    ['sem identificador', { ...good, sub: '' }],
  ])('recusa %s', async (_label, body) => {
    await expect(verifyGoogleIdToken('x'.repeat(30), CID, fake(body))).resolves.toBeNull();
  });
  it('recusa quando o Google responde erro, falha de rede ou client id vazio', async () => {
    await expect(verifyGoogleIdToken('x'.repeat(30), CID, fake({}, false))).resolves.toBeNull();
    await expect(verifyGoogleIdToken('x'.repeat(30), CID, async () => { throw new Error('rede'); })).resolves.toBeNull();
    await expect(verifyGoogleIdToken('x'.repeat(30), '', fake(good))).resolves.toBeNull();
  });
});

function setup(rowOverrides: Record<string, unknown> | null = {}, identity: unknown = { sub: 'g-123', email: 'maria@exemplo.com', nome: 'Maria Silva' }, config: Record<string, string> = CONFIG) {
  const rows: any[] = rowOverrides === null ? [] : [{ id: 'u1', email: 'maria@exemplo.com', papel: 'cotista', tokenVersion: 0, desativadoEm: null, totpAtivo: false, googleSub: null, bloqueadoAte: null, ...rowOverrides }];
  const audit: string[] = [];
  const prisma: any = {
    usuario: {
      findUnique: async ({ where }: any) => rows.find((r) => r.email === where.email) ?? null,
      update: async ({ where, data }: any) => { const row = rows.find((r) => r.id === where.id); for (const [k, v] of Object.entries<any>(data)) row[k] = v && typeof v === 'object' && 'increment' in v ? row[k] + v.increment : v; return row; },
    },
    convite: { findFirst: async () => null },
  };
  const cfg: any = { get: (key: string, fallback?: string) => config[key] ?? fallback, getOrThrow: (key: string) => config[key] };
  const service = new AuthService(prisma, new JwtService({}), cfg, { record: async (_t: any, i: any) => { audit.push(i.evento); } } as any);
  (service as any).verifyGoogle = async () => identity;
  return { service, rows, audit, prisma };
}

describe('Entrar com Google', () => {
  it('conta de cliente existente entra, vincula o Google e encerra as sessões antigas', async () => {
    const { service, rows, audit } = setup();
    const result = await service.googleLogin('c'.repeat(30));
    expect(result.tokens?.user).toEqual({ id: 'u1', email: 'maria@exemplo.com', papel: 'cotista' });
    expect(rows[0]).toMatchObject({ googleSub: 'g-123', tokenVersion: 1 });
    expect(audit).toContain('auth.google_vinculado');
  });
  it('segundo acesso não mexe na versão da sessão', async () => {
    const { service, rows } = setup({ googleSub: 'g-123', tokenVersion: 4 });
    await service.googleLogin('c'.repeat(30));
    expect(rows[0].tokenVersion).toBe(4);
  });
  it('equipe, administrador e conta com 2FA não entram só com Google', async () => {
    for (const row of [{ papel: 'admin' }, { papel: 'operacao' }, { totpAtivo: true }]) {
      const { service } = setup(row);
      await expect(service.googleLogin('c'.repeat(30))).rejects.toThrow('e-mail e senha');
    }
  });
  it('conta desativada, bloqueada ou ligada a outro Google é recusada', async () => {
    for (const row of [{ desativadoEm: new Date() }, { bloqueadoAte: new Date(Date.now() + 60_000) }, { googleSub: 'outro' }]) {
      const { service } = setup(row);
      await expect(service.googleLogin('c'.repeat(30))).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });
  it('token inválido do Google é recusado', async () => {
    const { service } = setup({}, null);
    await expect(service.googleLogin('c'.repeat(30))).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('sem GOOGLE_CLIENT_ID o recurso fica desligado', async () => {
    const { service } = setup({}, undefined, { ...CONFIG, GOOGLE_CLIENT_ID: '' });
    await expect(service.googleLogin('c'.repeat(30))).rejects.toBeInstanceOf(ConflictException);
  });
  it('e-mail sem conta devolve um token curto de cadastro (sem criar nada nem entrar)', async () => {
    const { service, rows } = setup(null);
    const result = await service.googleLogin('c'.repeat(30));
    expect(result.tokens).toBeUndefined();
    expect(result.cadastro).toMatchObject({ nome: 'Maria Silva', email: 'maria@exemplo.com' });
    expect(rows).toHaveLength(0);
  });
  it('o token de cadastro não serve como acesso e o cadastro exige token válido', async () => {
    const { service } = setup(null);
    const { cadastro } = await service.googleLogin('c'.repeat(30));
    const decoded: any = new JwtService({}).decode(cadastro!.token);
    expect(decoded.typ).toBe('google-signup');
    await expect(service.googleSignup({ token: 'lixo'.repeat(10), cpf: '52998224725', telefone: '11912345678', maiorDeIdade: true, aceiteTermos: true, aceitePrivacidade: true })).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('cadastro pelo Google usa o fluxo normal com senha aleatória e vincula o Google', async () => {
    const { service, rows } = setup(null);
    const { cadastro } = await service.googleLogin('c'.repeat(30));
    const calls: any[] = [];
    (service as any).register = async (dto: any) => { calls.push(dto); rows.push({ id: 'novo', email: dto.email }); return { accessToken: 'a', refreshToken: 'r', user: { id: 'novo', email: dto.email, papel: 'cotista' } }; };
    const result = await service.googleSignup({ token: cadastro!.token, cpf: '52998224725', telefone: '11912345678', maiorDeIdade: true, aceiteTermos: true, aceitePrivacidade: true });
    expect(result.user.papel).toBe('cotista');
    expect(calls[0]).toMatchObject({ email: 'maria@exemplo.com', nome: 'Maria Silva', aceiteTermos: true, aceitePrivacidade: true });
    expect(calls[0].senha).toBe(calls[0].confirmarSenha);
    expect(calls[0].senha.length).toBeGreaterThanOrEqual(8);
    expect(rows.find((r) => r.id === 'novo').googleSub).toBe('g-123');
  });
  it('convite de afiliado ou equipe não passa pelo cadastro com Google', async () => {
    const { service, prisma } = setup(null);
    const { cadastro } = await service.googleLogin('c'.repeat(30));
    prisma.convite.findFirst = async () => ({ id: 'c1' });
    await expect(service.googleSignup({ token: cadastro!.token, cpf: '52998224725', telefone: '11912345678', maiorDeIdade: true, aceiteTermos: true, aceitePrivacidade: true, codigoAfiliado: 'ABC-123' })).rejects.toBeInstanceOf(ConflictException);
  });
});
