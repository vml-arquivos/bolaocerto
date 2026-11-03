import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync(new URL('../components/admin-shell.tsx', import.meta.url), 'utf8');
const keys = [...shell.matchAll(/\['([a-z-]+)', '[^']+', '[A-Z]{2}'\]/g)].map((match) => match[1]);

test('menu do painel tem as pessoas em um só grupo e sem rede de afiliados', () => {
  for (const key of ['crm', 'afiliados', 'grupos', 'usuarios']) assert.ok(keys.includes(key), `faltou ${key}`);
  for (const key of ['rede', 'participantes', 'convites']) assert.ok(!keys.includes(key), `${key} não deve ter link no menu`);
  assert.equal(new Set(keys).size, keys.length, 'item repetido no menu');
});

test('comissões ficam em Dinheiro e não existe mais o grupo Indicações', () => {
  assert.ok(!/label: 'Indicações'/.test(shell));
  const money = shell.slice(shell.indexOf("label: 'Dinheiro'"), shell.indexOf("label: 'Operação e comprovantes'"));
  assert.ok(money.includes("'comissoes'") && money.includes("'repasses'"));
});
