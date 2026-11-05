import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Garante que toda chamada /api/v1/... feita pelas telas existe como rota na API (pega rota renomeada ou digitada errada).
const root = new URL('../../', import.meta.url).pathname;
const walk = (dir, accept) => readdirSync(dir).flatMap((name) => {
  if (['node_modules', '.next', 'dist', '.git'].includes(name)) return [];
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walk(full, accept) : accept(name) ? [full] : [];
});

function apiRoutes() {
  const routes = [];
  for (const file of walk(join(root, 'api/src'), (n) => n.endsWith('.controller.ts'))) {
    for (const part of readFileSync(file, 'utf8').split(/(?=@Controller\()/)) {
      const base = /^@Controller\(\s*(?:'([^']*)')?\s*\)/.exec(part);
      if (!base) continue;
      for (const m of part.matchAll(/@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)/g)) {
        routes.push({ method: m[1].toUpperCase(), path: '/' + [base[1], m[2]].filter(Boolean).join('/') });
      }
    }
  }
  return routes;
}

const toRegex = (path) => new RegExp('^' + path.replace(/:[^/]+/g, '[^/]+') + '$');

test('toda chamada das telas tem rota correspondente na API', () => {
  const routes = apiRoutes();
  assert.ok(routes.length > 150, `rotas encontradas: ${routes.length}`);
  const matchers = routes.map((r) => toRegex(r.path));
  const missing = [];
  for (const file of walk(join(root, 'web'), (n) => /\.(ts|tsx)$/.test(n) && !n.endsWith('.d.ts'))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/['"`](\/api\/v1\/[^'"`?\s]*)/g)) {
      let url = m[1].replace('/api/v1', '').replace(/\/$/, '');
      const dynamicTail = url.includes('${');
      url = url.replace(/\$\{[^}]*\}?/g, ':x');
      const ok = dynamicTail
        ? routes.some((r) => r.path.startsWith(url.replace(/:x.*$/, '')))
        : matchers.some((re) => re.test(url));
      if (!ok) missing.push(`${url} <- ${file.replace(root, '')}`);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});
