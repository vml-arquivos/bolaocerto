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
  for (const key of ['vitrine', 'usuarios', 'documentos', 'funil', 'conexoes', 'auditoria', 'configuracoes']) assert.ok(admin.includes(`'${key}'`), `${key} deve ficar em Administração`);
  const people = groupsSource.slice(groupsSource.indexOf("label: 'Pessoas'"), groupsSource.indexOf("label: 'Administração'"));
  assert.ok(!people.includes("'usuarios'"), 'usuários e acessos saiu de Pessoas');
});

test('rodapé do menu é compacto: instalar app discreto e sem repetir "Voltar ao site"', () => {
  assert.ok(shell.includes('admin-install-link'));
  assert.ok(!shell.includes('admin-footer-note'));
  assert.ok(!shell.includes('Voltar ao site'));
});

test('configuração de integrações fica em Administração → Integrações; o Financeiro só acompanha', () => {
  const nav = readFileSync(new URL('../lib/admin-nav.ts', import.meta.url), 'utf8');
  const hub = nav.slice(nav.indexOf("key: 'integracoes'"), nav.indexOf("key: 'operacao'"));
  for (const key of ['conexoes', 'integ-nfse', 'integ-pagamentos', 'integ-caixa']) assert.ok(hub.includes(`'${key}'`), `${key} deve ficar em Integrações`);
  const roles = readFileSync(new URL('../lib/roles.ts', import.meta.url), 'utf8');
  for (const key of ['integ-nfse', 'integ-pagamentos', 'integ-caixa']) assert.ok(roles.includes(`'${key}'`), `${key} é só do superadmin`);
  const admin = shell.slice(shell.indexOf("label: 'Administração'"));
  assert.ok(admin.includes("['conexoes', 'Integrações'"));
  const finance = readFileSync(new URL('../components/admin-finance-tools.tsx', import.meta.url), 'utf8');
  const invoices = finance.slice(finance.indexOf('export function InvoicesView'), finance.indexOf('export function CaixaDiagnosticsPanel'));
  for (const text of ['Como emitir as notas', 'Aviso automático da Focus', 'api/v1/admin/nfse/modo', 'nfse/diagnostico', 'Cadastrar emissor']) assert.ok(!invoices.includes(text), `"${text}" não fica mais em Notas fiscais`);
  assert.ok(invoices.includes('integ-nfse'), 'Notas fiscais aponta para a configuração em Administração');
  const dash = readFileSync(new URL('../components/admin-dashboard.tsx', import.meta.url), 'utf8');
  assert.ok(!dash.includes('<PaymentSettingsPanel'), 'configuração de pagamentos saiu de Configurações');
});

test('telas de Integrações carregam sozinhas (não pedem lista à API)', () => {
  const dash = readFileSync(new URL('../components/admin-dashboard.tsx', import.meta.url), 'utf8');
  const line = dash.split('\n').find((row) => row.startsWith('const selfLoadingViews')) ?? '';
  for (const key of ['integ-nfse', 'integ-pagamentos', 'integ-caixa']) assert.ok(line.includes(`'${key}'`), `${key} deve carregar sozinha`);
});

test('cliente tem como cancelar: reserva, pedido em cota paga e checkout; o administrador responde nas Cotas', () => {
  const account = readFileSync(new URL('../components/account-dashboard.tsx', import.meta.url), 'utf8');
  for (const text of ['Cancelar compra', 'Pedir cancelamento', 'Retirar pedido', '/pedido-cancelamento', '/cancelar`']) assert.ok(account.includes(text), `Minha conta precisa de "${text}"`);
  const checkout = readFileSync(new URL('../components/checkout.tsx', import.meta.url), 'utf8');
  assert.ok(checkout.includes('Cancelar esta compra') && checkout.includes('/cancelar`'));
  const shares = readFileSync(new URL('../components/admin-views/shares-view.tsx', import.meta.url), 'utf8');
  assert.ok(shares.includes('CancellationRequests'), 'pedidos aparecem em Cotas');
  const finance = readFileSync(new URL('../components/admin-finance-tools.tsx', import.meta.url), 'utf8');
  assert.ok(finance.includes('/estornar') && finance.includes('RefundChoice'), 'administrador estorna cota paga');
});
