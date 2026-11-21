import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard, VIEW_AS_COOKIE } from './jwt-auth.guard';

const SECRET = 'access-secret-access-secret-0123456789';
const TARGET = '7d3c3f1e-1111-4111-8111-111111111111';

/** Modo "ver como": a conta principal vê o painel como alguém da equipe, sem poder alterar nada. */
describe('ver o painel como outra pessoa', () => {
  const OLD = process.env.ADMIN_BOOTSTRAP_EMAIL;
  beforeEach(() => { process.env.ADMIN_BOOTSTRAP_EMAIL = 'dono@x.com'; });
  afterEach(() => { if (OLD === undefined) delete process.env.ADMIN_BOOTSTRAP_EMAIL; else process.env.ADMIN_BOOTSTRAP_EMAIL = OLD; });

  async function run(opts: { email?: string; method?: string; cookie?: string; target?: Record<string, unknown> | null }) {
    const jwt = new JwtService({});
    const token = await jwt.signAsync({ id: 'me', email: opts.email ?? 'dono@x.com', papel: 'admin', tv: 0, typ: 'access' }, { secret: SECRET, expiresIn: '5m' });
    const rows: Record<string, unknown> = { me: { tokenVersion: 0, papel: 'admin', desativadoEm: null } };
    if (opts.target !== null) rows[TARGET] = opts.target ?? { id: TARGET, email: 'equipe@x.com', papel: 'admin', desativadoEm: null };
    const prisma: any = { usuario: { findUnique: jest.fn(async ({ where }: any) => rows[where.id] ?? null) } };
    const guard = new JwtAuthGuard(jwt, { getOrThrow: () => SECRET } as any, prisma);
    const request: any = { method: opts.method ?? 'GET', headers: { authorization: `Bearer ${token}` }, cookies: opts.cookie === undefined ? { [VIEW_AS_COOKIE]: TARGET } : { [VIEW_AS_COOKIE]: opts.cookie } };
    const context: any = { switchToHttp: () => ({ getRequest: () => request }) };
    return { result: guard.canActivate(context), request };
  }

  it('a conta principal passa a ver como a pessoa da equipe', async () => {
    const { result, request } = await run({});
    await expect(result).resolves.toBe(true);
    expect(request.user).toEqual({ id: TARGET, email: 'equipe@x.com', papel: 'admin', verComoPor: 'me' });
  });

  it('nesse modo nada pode ser alterado', async () => {
    const { result } = await run({ method: 'POST' });
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('administrador comum não usa o modo (o cookie é ignorado)', async () => {
    const { result, request } = await run({ email: 'comum@x.com' });
    await expect(result).resolves.toBe(true);
    expect(request.user.id).toBe('me');
  });

  it('não vale para cliente, afiliado, conta desativada ou valor inválido', async () => {
    for (const target of [{ id: TARGET, email: 'c@x.com', papel: 'cotista', desativadoEm: null }, { id: TARGET, email: 'a@x.com', papel: 'afiliado', desativadoEm: null }, { id: TARGET, email: 'e@x.com', papel: 'admin', desativadoEm: new Date() }]) {
      const { result, request } = await run({ target });
      await expect(result).resolves.toBe(true);
      expect(request.user.id).toBe('me');
    }
    const invalid = await run({ cookie: 'nao-e-um-id' });
    await expect(invalid.result).resolves.toBe(true);
    expect(invalid.request.user.id).toBe('me');
  });
});
