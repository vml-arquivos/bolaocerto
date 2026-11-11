import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { sessionIdleMinutes } from './session-policy';

const env = (values: Record<string, string> = {}) => (key: string) => values[key];

describe('sessionIdleMinutes', () => {
  it('equipe 30 minutos; afiliado e cliente 60 minutos', () => {
    expect(sessionIdleMinutes('admin', env())).toBe(30);
    expect(sessionIdleMinutes('operacao', env())).toBe(30);
    expect(sessionIdleMinutes('afiliado', env())).toBe(60);
    expect(sessionIdleMinutes('cotista', env())).toBe(60);
  });
  it('dá para trocar pelo ambiente, com limites de 5 minutos a 24 horas, e valor ruim volta ao padrão', () => {
    expect(sessionIdleMinutes('admin', env({ SESSION_IDLE_MINUTES_STAFF: '15' }))).toBe(15);
    expect(sessionIdleMinutes('cotista', env({ SESSION_IDLE_MINUTES: '120' }))).toBe(120);
    expect(sessionIdleMinutes('admin', env({ SESSION_IDLE_MINUTES_STAFF: '1' }))).toBe(5);
    expect(sessionIdleMinutes('cotista', env({ SESSION_IDLE_MINUTES: '99999' }))).toBe(1440);
    expect(sessionIdleMinutes('admin', env({ SESSION_IDLE_MINUTES_STAFF: 'abc' }))).toBe(30);
    expect(sessionIdleMinutes('cotista', env({ SESSION_IDLE_MINUTES: '0' }))).toBe(60);
  });
});

describe('renovação deslizante da sessão', () => {
  const CONFIG: Record<string, string> = { JWT_ACCESS_SECRET: 'access-secret-access-secret-0123456789', JWT_REFRESH_SECRET: 'refresh-secret-refresh-secret-0123456789' };
  async function build(papel: string) {
    const rows: any[] = [{ id: 'u1', email: 'a@exemplo.com', papel, tokenVersion: 0, desativadoEm: null }];
    const prisma: any = { usuario: { findUnique: async () => rows[0], findUniqueOrThrow: async () => rows[0] } };
    const jwt = new JwtService({});
    const config: any = { get: (key: string, fallback?: string) => CONFIG[key] ?? fallback, getOrThrow: (key: string) => CONFIG[key] };
    return { service: new AuthService(prisma, jwt, config, { record: async () => undefined } as any), jwt };
  }
  it('o token de renovação vale só o tempo máximo sem uso do papel', async () => {
    for (const [papel, minutes] of [['admin', 30], ['operacao', 30], ['afiliado', 60], ['cotista', 60]] as const) {
      const { service, jwt } = await build(papel);
      const { refreshToken } = await service.reissue('u1');
      const payload: any = jwt.decode(refreshToken);
      expect(payload.exp - payload.iat).toBe(minutes * 60);
    }
  });
  it('depois do prazo sem renovar, o token é recusado e é preciso entrar de novo', async () => {
    const { service, jwt } = await build('admin');
    const expired = await jwt.signAsync({ sub: 'u1', id: 'u1', email: 'a@exemplo.com', papel: 'admin', tv: 0, typ: 'refresh' }, { secret: CONFIG.JWT_REFRESH_SECRET!, expiresIn: -10 });
    await expect(service.refresh(expired)).rejects.toBeInstanceOf(UnauthorizedException);
    const fresh = await service.reissue('u1');
    const renewed = await service.refresh(fresh.refreshToken);
    expect((jwt.decode(renewed.refreshToken) as any).exp).toBeGreaterThanOrEqual((jwt.decode(fresh.refreshToken) as any).exp);
  });
});
