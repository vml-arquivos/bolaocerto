import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Minha conta do cliente tem Carteira, Indicar amigos e Meus dados com Pix e endereço para todos', () => {
  const dash = read('components/account-dashboard.tsx');
  for (const tab of ["'carteira'", "'indicar'", "'conta'", "'cotas'"]) assert.ok(dash.includes(tab), `aba ${tab}`);
  for (const name of ['Minhas cotas', 'Carteira', 'Indicar amigos', 'Minha conta']) assert.ok(dash.includes(`>${name}</button>`), `rótulo ${name}`);
  assert.ok(dash.includes('showPix '), 'Pix aparece para todo cliente');
  assert.ok(!/showPix=\{isStaff\}/.test(dash), 'Pix não é mais só da equipe');
  assert.ok(dash.includes('ProfileChecklist') && dash.includes('/api/v1/usuarios/me/carteira'));
  assert.ok(!/address\?\.nfseAtiva && paidShares/.test(dash), 'endereço aparece para todos, não só com nota fiscal');
});

test('cadastro pede a chave Pix (normal e com Google) e o link de indicação do cliente entra pelo proxy', () => {
  assert.match(read('components/auth-form.tsx'), /name="chavePix"[^>]*required/);
  const google = read('components/google-signup-form.tsx');
  assert.match(google, /name="chavePix"/); assert.match(google, /chavePix: String/);
  const proxy = read('app/api/v1/[...path]/route.ts');
  assert.match(proxy, /isGoogleSignup/); assert.match(proxy, /bl_ref/);
});

test('compra tem etapa de revisão antes de reservar e o checkout paga com saldo', () => {
  const form = read('components/purchase-form.tsx');
  assert.match(form, /Confirme sua compra/); assert.match(form, /Revisar e continuar/); assert.match(form, /purchase-review/);
  assert.ok(form.indexOf('goReview') < form.indexOf('/api/v1/cotas/reservar'), 'a reserva só acontece depois da revisão');
  assert.match(read('components/checkout.tsx'), /pagar-com-saldo/);
  assert.match(read('components/share-pool.tsx'), /usuarios\/me\/indicacao/);
});

test('afiliado tem painel de vendas, aba Clientes (CRM com funil) e o admin tem funil e Carteira', () => {
  const shell = read('components/affiliate-shell.tsx');
  assert.match(shell, /\['clientes', 'Clientes'/);
  const dash = read('components/affiliate-dashboard.tsx');
  assert.match(dash, /AffiliateCrm/); assert.match(dash, /AffiliatePanelBoard/);
  const crm = read('components/affiliate-crm.tsx');
  for (const route of ['afiliados/me/crm/resumo', 'afiliados/me/crm/clientes']) assert.ok(crm.includes(route), route);
  assert.match(read('components/affiliate-panel.tsx'), /afiliados\/me\/painel/);
  const admin = read('components/admin-crm-tools.tsx');
  assert.match(admin, /Funil de vendas/); assert.match(admin, /etapa/);
  assert.match(read('lib/admin-nav.ts'), /'carteira', 'Carteira dos clientes'/);
  assert.match(read('components/admin-dashboard.tsx'), /WalletAdminView/);
  assert.match(read('components/admin-health.tsx'), /Entrar com Google/);
});
