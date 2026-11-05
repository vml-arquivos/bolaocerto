import 'reflect-metadata';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/** Varre todos os controllers e confere, rota por rota, quem pode chamar. Pega esquecimento de @Roles/@UseGuards logo no teste. */
function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith('.controller.ts') ? [full] : [];
  });
}

type Route = { method: string; path: string; roles: string[] | undefined; jwt: boolean; where: string };

function collect(): Route[] {
  const routes: Route[] = [];
  for (const file of controllerFiles(join(__dirname, '..'))) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function') continue;
      const prefix = Reflect.getMetadata(PATH_METADATA, exported) as string | undefined;
      if (prefix === undefined) continue;
      const classGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, exported) ?? [];
      const classRoles = Reflect.getMetadata(ROLES_KEY, exported) as string[] | undefined;
      for (const key of Object.getOwnPropertyNames(exported.prototype)) {
        const handler = exported.prototype[key] as object;
        if (typeof handler !== 'function') continue;
        const verb = Reflect.getMetadata(METHOD_METADATA, handler);
        if (verb === undefined) continue;
        const sub = (Reflect.getMetadata(PATH_METADATA, handler) as string | string[]) ?? '';
        const guards: unknown[] = [...classGuards, ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? [])];
        const roles = (Reflect.getMetadata(ROLES_KEY, handler) as string[] | undefined) ?? classRoles;
        const path = [prefix, Array.isArray(sub) ? sub[0] : sub].filter((part) => part && part !== '/').join('/').replace(/\/+/g, '/');
        routes.push({ method: String(verb), path, roles, jwt: guards.includes(JwtAuthGuard), where: `${exported.name}.${key}` });
      }
    }
  }
  return routes;
}

const routes = collect();
// Ferramentas de montagem de bolão que o afiliado aprovado também usa (cotação e geração de jogos).
const AFFILIATE_TOOLS = new Set(['admin/boloes/cotacao', 'admin/boloes/gerar-jogos']);

describe('quem pode chamar cada rota', () => {
  it('encontra as rotas da API', () => { expect(routes.length).toBeGreaterThan(150); });

  it('toda rota do painel (admin/...) exige login e papel de equipe', () => {
    const bad = routes.filter((route) => route.path.startsWith('admin/') && !AFFILIATE_TOOLS.has(route.path))
      .filter((route) => !route.jwt || !route.roles?.length || route.roles.some((role) => role !== 'admin' && role !== 'operacao'));
    expect(bad.map((route) => `${route.method} /${route.path} (${route.where})`)).toEqual([]);
  });

  it('as ferramentas de bolão aceitam só administrador e afiliado, nunca cliente', () => {
    for (const route of routes.filter((item) => AFFILIATE_TOOLS.has(item.path))) {
      expect(route.jwt).toBe(true);
      expect([...(route.roles ?? [])].sort()).toEqual(['admin', 'afiliado']);
    }
  });

  it('a área do afiliado (afiliados/me/...) é só do afiliado, com login', () => {
    const own = routes.filter((route) => route.path.startsWith('afiliados/me'));
    expect(own.length).toBeGreaterThan(10);
    const bad = own.filter((route) => !route.jwt || JSON.stringify(route.roles) !== JSON.stringify(['afiliado']));
    expect(bad.map((route) => `${route.method} /${route.path} (${route.where})`)).toEqual([]);
  });

  it('a fila de operação (operacao/...) é só da equipe', () => {
    const bad = routes.filter((route) => route.path.startsWith('operacao/')).filter((route) => !route.jwt || !route.roles?.length || route.roles.some((role) => role !== 'admin' && role !== 'operacao'));
    expect(bad.map((route) => `${route.method} /${route.path} (${route.where})`)).toEqual([]);
  });

  it('rotas da própria conta (usuarios/me/..., cotas/minhas, notificacoes) exigem login', () => {
    const mine = routes.filter((route) => /^(usuarios\/me|notificacoes|push\/|cotas\/minhas|conta\/)/.test(route.path));
    expect(mine.length).toBeGreaterThan(8);
    expect(mine.filter((route) => !route.jwt).map((route) => `${route.method} /${route.path} (${route.where})`)).toEqual([]);
  });
});
