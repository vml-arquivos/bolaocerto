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
  const money = shell.slice(shell.indexOf("label: 'Financeiro'"), shell.indexOf("label: 'Operação'"));
  assert.ok(money.includes("'comissoes'") && money.includes("'repasses'"));
});

test('menu organizado: atalhos no topo, cinco grupos e usuários e acessos em Administração', () => {
  const top = shell.slice(shell.indexOf('const topItems'), shell.indexOf('const groups'));
  assert.ok(top.includes("'visao-geral'") && top.includes("'relatorios'"));
  const labels = [...shell.matchAll(/label: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(labels, ['Jogos e vendas', 'Pessoas', 'Financeiro', 'Operação', 'Administração']);
  const admin = shell.slice(shell.indexOf("label: 'Administração'"));
  for (const key of ['usuarios', 'conexoes', 'auditoria', 'configuracoes']) assert.ok(admin.includes(`'${key}'`), `${key} deve ficar em Administração`);
  const people = shell.slice(shell.indexOf("label: 'Pessoas'"), shell.indexOf("label: 'Financeiro'"));
  assert.ok(!people.includes("'usuarios'"), 'usuários e acessos saiu de Pessoas');
});

test('rodapé do menu é compacto: instalar app discreto e sem repetir "Voltar ao site"', () => {
  assert.ok(shell.includes('admin-install-link'));
  assert.ok(!shell.includes('admin-footer-note'));
  assert.ok(!shell.includes('Voltar ao site'));
});
