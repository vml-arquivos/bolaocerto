import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), 'utf8');

test('o painel tem um arquivo por tela e o menu aponta para todas', () => {
  const dashboard = read('components/admin-dashboard.tsx');
  const views = readdirSync(join(root, 'components/admin-views')).filter((name) => name.endsWith('-view.tsx'));
  assert.ok(views.length >= 17, 'faltam arquivos de tela em components/admin-views');
  for (const name of views) {
    const component = read(`components/admin-views/${name}`);
    const exported = /export function (\w+View)\(/.exec(component)?.[1];
    assert.ok(exported, `${name} precisa exportar uma tela`);
    assert.ok(dashboard.includes(`<${exported} ctx={ctx} />`) || dashboard.includes(`<${exported} />`), `${exported} não é usada no painel`);
  }
  // As telas não podem voltar a ser declaradas dentro do painel (isso as recria a cada atualização).
  assert.doesNotMatch(dashboard, /\n\s+function [A-Z]\w*View\(\)/);
});

test('funções de uso geral ficam em um lugar só', () => {
  for (const file of ['components/pool-wizard.tsx', 'components/admin-finance-tools.tsx', 'components/admin-views/shared.tsx']) {
    assert.doesNotMatch(read(file), /async function authFetch\(/, `${file} não deve redefinir authFetch`);
  }
  assert.doesNotMatch(read('components/pool-wizard.tsx'), /const modalityNames/);
  assert.match(read('lib/format.ts'), /export function formatBRL/);
});

test('globals.css importa todos os blocos de estilo na ordem', () => {
  const css = read('app/globals.css');
  const imported = [...css.matchAll(/@import '\.\/styles\/([\w-]+\.css)'/g)].map((match) => match[1]);
  assert.ok(imported.length >= 7);
  assert.deepEqual(imported, [...imported].sort());
  for (const name of imported) assert.ok(existsSync(join(root, 'app/styles', name)), `${name} não existe`);
});
