import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { SuperAdminGuard } from '../auth/superadmin.guard';
import { ACCESS_KEYS, defaultModules, modulesForRoute, SUPER_MODULES } from './access.catalog';
import { AccessService, forgetAccess } from './access.service';

describe('Acesso por função', () => {
  const OLD = process.env.ADMIN_BOOTSTRAP_EMAIL;
  beforeEach(() => { process.env.ADMIN_BOOTSTRAP_EMAIL = 'principal@x.com'; });
  afterEach(() => { if (OLD === undefined) delete process.env.ADMIN_BOOTSTRAP_EMAIL; else process.env.ADMIN_BOOTSTRAP_EMAIL = OLD; });
  const principal = { id: 'p1', email: 'principal@x.com', papel: 'admin' } as any;
  const comum = { id: 'a2', email: 'comum@x.com', papel: 'admin' } as any;
  const op = { id: 'o3', email: 'op@x.com', papel: 'operacao' } as any;

  it('padrão de cada perfil é o de antes', () => {
    expect(defaultModules('admin')).toEqual(ACCESS_KEYS.filter((key) => !SUPER_MODULES.includes(key)));
    expect(defaultModules('operacao')).toEqual(['operacao']);
    expect(defaultModules('cotista')).toEqual([]);
  });

  it('cada rota cai na função certa (leitura em várias telas, gravação só na dona)', () => {
    expect(modulesForRoute('GET', '/api/v1/admin/concursos')).toContain('boloes');
    expect(modulesForRoute('POST', '/api/v1/admin/boloes/:id/publicar')).toEqual(['boloes']);
    expect(modulesForRoute('GET', '/api/v1/admin/nfse/diagnostico')).toEqual(['conexoes']);
    expect(modulesForRoute('PUT', '/api/v1/admin/nfse/configuracao')).toEqual(['notas-fiscais']);
    expect(modulesForRoute('POST', '/api/v1/operacao/boloes/:id/anexos')).toContain('operacao');
    expect(modulesForRoute('GET', '/api/v1/boloes')).toEqual([]);
    expect(modulesForRoute('GET', '/api/v1/admin/acessos/:id')).toEqual([]);
  });

  function guard(custom: Record<string, string[] | null>, roles: string[], user: any, method: string, path: string) {
    const reflector = { getAllAndOverride: () => roles } as any;
    const access = { customModules: jest.fn(async (id: string) => custom[id] ?? null) } as any;
    const ctx = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => ({ user, method, route: { path }, path }) }) } as any;
    return { roles: new RolesGuard(reflector, access).canActivate(ctx), superGuard: () => new SuperAdminGuard(access).canActivate(ctx) };
  }

  it('sem personalização vale só o perfil, como antes', async () => {
    await expect(guard({}, ['admin'], comum, 'GET', '/api/v1/admin/recebimentos').roles).resolves.toBe(true);
    await expect(guard({}, ['admin'], op, 'GET', '/api/v1/admin/recebimentos').roles).rejects.toThrow(ForbiddenException);
    await expect(guard({}, ['admin', 'operacao'], op, 'GET', '/api/v1/operacao/fila').roles).resolves.toBe(true);
  });

  it('personalizado: bloqueia o que foi tirado e libera o que foi dado (inclusive para a operação)', async () => {
    const custom = { a2: ['boloes'], o3: ['operacao', 'financeiro'] };
    await expect(guard(custom, ['admin'], comum, 'GET', '/api/v1/admin/recebimentos').roles).rejects.toThrow(/não está liberada/);
    await expect(guard(custom, ['admin'], comum, 'POST', '/api/v1/admin/boloes').roles).resolves.toBe(true);
    await expect(guard(custom, ['admin'], op, 'GET', '/api/v1/admin/recebimentos').roles).resolves.toBe(true);
    await expect(guard(custom, ['admin'], op, 'POST', '/api/v1/admin/boloes').roles).rejects.toThrow(ForbiddenException);
    // A conta principal nunca é bloqueada.
    await expect(guard({ p1: [] }, ['admin'], principal, 'GET', '/api/v1/admin/recebimentos').roles).resolves.toBe(true);
  });

  it('área da conta principal só abre para quem recebeu a função', async () => {
    await expect(guard({}, ['admin'], comum, 'GET', '/api/v1/admin/auditoria').superGuard()).rejects.toThrow(ForbiddenException);
    await expect(guard({ a2: ['auditoria'] }, ['admin'], comum, 'GET', '/api/v1/admin/auditoria').superGuard()).resolves.toBe(true);
    // Exclusão definitiva de cota não é função liberável: segue só da conta principal.
    await expect(guard({ a2: [...ACCESS_KEYS] }, ['admin'], comum, 'DELETE', '/api/v1/admin/cotas/:id/definitivo').superGuard()).rejects.toThrow(ForbiddenException);
  });

  it('só a conta principal salva; só para equipe; só funções conhecidas', async () => {
    const users: Record<string, any> = { a2: { ...comum, nome: 'Comum' }, c9: { id: 'c9', email: 'c@x.com', papel: 'cotista', nome: 'C' }, p1: { ...principal, nome: 'P' } };
    const store = new Map<string, string>();
    const prisma: any = {
      usuario: { findUnique: jest.fn(async ({ where }: any) => users[where.id] ?? null) },
      configuracaoSistema: {
        findUnique: jest.fn(async ({ where }: any) => (store.has(where.chave) ? { valor: store.get(where.chave) } : null)),
        upsert: jest.fn(async ({ where, create }: any) => { store.set(where.chave, create.valor); }),
        deleteMany: jest.fn(async ({ where }: any) => { store.delete(where.chave); }),
      },
    };
    const service = new AccessService(prisma, { record: jest.fn().mockResolvedValue(undefined) } as any);
    forgetAccess('a2');
    await expect(service.save('a2', ['boloes'], comum)).rejects.toThrow(ForbiddenException);
    await expect(service.save('c9', ['boloes'], principal)).rejects.toThrow(/administradores e equipe/);
    await expect(service.save('p1', [], principal)).rejects.toThrow(/sempre tem acesso/);
    await expect(service.save('a2', ['nada'], principal)).rejects.toThrow(/desconhecida/);
    const saved = await service.save('a2', ['financeiro', 'boloes', 'boloes'], principal);
    expect(saved).toMatchObject({ personalizado: true, modulos: ['boloes', 'financeiro'] });
    expect(await service.effectiveModules(comum)).toEqual(['boloes', 'financeiro']);
    expect(await service.effectiveModules(principal)).toEqual([...ACCESS_KEYS]);
    const back = await service.save('a2', null, principal);
    expect(back.personalizado).toBe(false);
    expect(await service.effectiveModules(comum)).toEqual(defaultModules('admin'));
  });
});
