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

test('financeiro e operação são itens únicos com abas, e comissões ficam no Financeiro', () => {
  assert.ok(!/label: 'Indicações'/.test(shell));
  const nav = readFileSync(new URL('../lib/admin-nav.ts', import.meta.url), 'utf8');
  const finance = nav.slice(nav.indexOf("key: 'financeiro'"), nav.indexOf("key: 'operacao'"));
  for (const key of ['recebimentos', 'comissoes', 'repasses', 'notas-fiscais']) assert.ok(finance.includes(`'${key}'`), `${key} deve ficar no Financeiro`);
  const ops = nav.slice(nav.indexOf("key: 'operacao'"));
  for (const key of ['comprovantes', 'lotericas', 'comunicados']) assert.ok(ops.includes(`'${key}'`), `${key} deve ficar em Operação`);
  const hubs = shell.slice(shell.indexOf('const hubItems'));
  assert.ok(hubs.includes("'financeiro'") && hubs.includes("'operacao'"));
});

test('menu enxuto: atalhos no topo, três grupos e usuários e acessos em Administração', () => {
  const top = shell.slice(shell.indexOf('const topItems'), shell.indexOf('const groups'));
  assert.ok(top.includes("'visao-geral'") && top.includes("'relatorios'"));
  const groupsSource = shell.slice(shell.indexOf('const groups'), shell.indexOf('const hubItems'));
  const labels = [...groupsSource.matchAll(/label: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(labels, ['Jogos e vendas', 'Pessoas', 'Administração']);
  const admin = groupsSource.slice(groupsSource.indexOf("label: 'Administração'"));
  for (const key of ['vitrine', 'usuarios', 'documentos', 'conexoes', 'auditoria', 'configuracoes']) assert.ok(admin.includes(`'${key}'`), `${key} deve ficar em Administração`);
  const people = groupsSource.slice(groupsSource.indexOf("label: 'Pessoas'"), groupsSource.indexOf("label: 'Administração'"));
  assert.ok(!people.includes("'usuarios'"), 'usuários e acessos saiu de Pessoas');
});

test('rodapé do menu é compacto: instalar app discreto e sem repetir "Voltar ao site"', () => {
  assert.ok(shell.includes('admin-install-link'));
  assert.ok(!shell.includes('admin-footer-note'));
  assert.ok(!shell.includes('Voltar ao site'));
});
