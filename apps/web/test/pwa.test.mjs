import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import vm from 'node:vm';
const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
function worker() {
  const listeners = {}; const saved = []; const removed = []; let skipped = 0;
  const cache = { addAll: async () => {}, put: async (req) => { saved.push(req.url); }, keys: async () => [], delete: async () => true };
  const ctx = { URL, Response, self: { location: { origin: 'https://bl.example' }, addEventListener: (name, fn) => { listeners[name] = fn; }, skipWaiting: async () => { skipped++; }, clients: { claim: async () => {} } }, caches: { open: async () => cache, match: async () => undefined, keys: async () => ['other-app-cache', 'bl-static-v1', 'bl-static-v2', 'bl-static-v3'], delete: async key => { removed.push(key); } }, fetch: async () => new Response('network') };
  vm.runInNewContext(source, ctx);
  async function request(path, method = 'GET', mode = 'cors') {
    let result; const req = { url: 'https://bl.example' + path, method, mode };
    listeners.fetch({ request: req, respondWith: value => { result = value; } });
    return result === undefined ? undefined : await result;
  }
  return { listeners, ctx, saved, removed, request, skipped: () => skipped };
}
test('service worker never intercepts purchase POSTs, auth or payment API', async () => {
  const w = worker();
  for (const [path, method] of [['/api/v1/cotas/reservar', 'POST'], ['/api/v1/auth/me', 'GET'], ['/api/v1/pagamentos', 'GET']]) assert.equal(await w.request(path, method), undefined);
  assert.deepEqual(w.saved, []);
});
test('private navigation goes to network and is not persisted', async () => {
  const w = worker(); const response = await w.request('/minha-conta/contratos', 'GET', 'navigate');
  assert.equal(await response.text(), 'network'); assert.deepEqual(w.saved, []);
});
test('offline navigation returns an offline notice, never a previous account page', async () => {
  const w = worker(); w.ctx.fetch = async () => { throw new Error('offline'); }; w.ctx.caches.match = async path => path === '/offline.html' ? new Response('offline notice') : undefined;
  assert.equal(await (await w.request('/minha-conta', 'GET', 'navigate')).text(), 'offline notice'); assert.deepEqual(w.saved, []);
});
test('updates wait for explicit activation and do not delete other applications caches', async () => {
  const w = worker(); let done;
  w.listeners.install({ waitUntil: p => { done = p; } }); await done; assert.equal(w.skipped(), 0);
  w.listeners.message({ data: { type: 'ACTIVATE_UPDATE' }, waitUntil: p => { done = p; } }); await done; assert.equal(w.skipped(), 1);
  w.listeners.activate({ waitUntil: p => { done = p; } }); await done; assert.deepEqual(w.removed, ['bl-static-v1', 'bl-static-v2']);
});
test('only static public assets are stored', async () => {
  const w = worker(); await w.request('/brand/bl-icon-192.png'); assert.deepEqual(w.saved, ['https://bl.example/brand/bl-icon-192.png']);
  assert.equal(await w.request('/anexos/private.pdf'), undefined);
});
test('manifest has maskable icons and the install banner has one single CSS definition', async () => {
  const manifest = await readFile(new URL('../app/manifest.webmanifest/route.ts', import.meta.url), 'utf8');
  assert.match(manifest, /bl-icon-maskable-512\.png[^}]*maskable/);
  assert.match(manifest, /bl-icon-maskable-192\.png[^}]*maskable/);
  const details = await readFile(new URL('../app/details.css', import.meta.url), 'utf8');
  assert.ok(!/\.install-banner\s*\{/.test(details), 'details.css não pode redefinir .install-banner (ele ficava atrás da barra de baixo)');
});
test('painel e cliente são dois aplicativos separados (id, escopo, ícone e manifesto próprios)', async () => {
  const admin = await readFile(new URL('../app/admin/manifest.webmanifest/route.ts', import.meta.url), 'utf8');
  const client = await readFile(new URL('../app/manifest.webmanifest/route.ts', import.meta.url), 'utf8');
  assert.match(admin, /id: '\/admin'/); assert.match(admin, /scope: '\/admin'/); assert.match(admin, /start_url: '\/admin/);
  assert.match(client, /id: '\/'/); assert.match(client, /scope: '\/'/);
  assert.match(admin, /bl-admin-icon-maskable-512\.png/);
  const layout = await readFile(new URL('../app/admin/layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /manifest: '\/admin\/manifest\.webmanifest'/);
  const root = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  assert.match(root, /manifest: '\/manifest\.webmanifest'/);
});
test('afiliado é o terceiro aplicativo: id, escopo, ícones, atalhos e entrada próprios', async () => {
  const manifest = await readFile(new URL('../app/afiliado/manifest.webmanifest/route.ts', import.meta.url), 'utf8');
  assert.match(manifest, /id: '\/afiliado'/); assert.match(manifest, /scope: '\/afiliado'/); assert.match(manifest, /start_url: '\/afiliado/);
  assert.match(manifest, /bl-afiliado-icon-maskable-512\.png/); assert.match(manifest, /bl-afiliado-icon-512\.png/);
  for (const aba of ['cotas', 'vendas', 'boloes', 'comissoes', 'grupos']) assert.match(manifest, new RegExp(`/afiliado\\?aba=${aba}`));
  const layout = await readFile(new URL('../app/afiliado/layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /manifest: '\/afiliado\/manifest\.webmanifest'/); assert.match(layout, /robots: \{ index: false/);
  for (const file of ['bl-afiliado-icon-180', 'bl-afiliado-icon-192', 'bl-afiliado-icon-512', 'bl-afiliado-icon-maskable-192', 'bl-afiliado-icon-maskable-512']) assert.ok(existsSync(new URL(`../public/brand/${file}.png`, import.meta.url)), `falta ${file}.png`);
  // Os três manifestos têm id e escopo diferentes entre si.
  const others = [await readFile(new URL('../app/admin/manifest.webmanifest/route.ts', import.meta.url), 'utf8'), await readFile(new URL('../app/manifest.webmanifest/route.ts', import.meta.url), 'utf8')];
  assert.ok(others.every((code) => !/id: '\/afiliado'/.test(code)));
  assert.ok(existsSync(new URL('../app/afiliado/entrar/page.tsx', import.meta.url)), 'a entrada do afiliado fica dentro do escopo do app');
});
test('área do afiliado usa a casca do app (menu embaixo) e as abas ficam na URL', async () => {
  const page = await readFile(new URL('../app/afiliado/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /AffiliateShell/); assert.ok(!/SiteHeader|SiteFooter/.test(page));
  const shell = await readFile(new URL('../components/affiliate-shell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /aff-bottomnav/); assert.match(shell, /\?aba=/);
  const dash = await readFile(new URL('../components/affiliate-dashboard.tsx', import.meta.url), 'utf8');
  assert.match(dash, /AffiliateQuotas/); assert.match(dash, /useSearchParams/); assert.ok(!/\/login\?next=\/afiliado/.test(dash), 'sessão expirada volta para a entrada do app, dentro do escopo');
  const quotas = await readFile(new URL('../components/affiliate-quotas.tsx', import.meta.url), 'utf8');
  assert.ok(!/cpf|email|telefone/i.test(quotas), 'o afiliado não vê dados pessoais do comprador');
});
test('/instalar apresenta os três aplicativos, cada um instalado na sua entrada', async () => {
  const page = await readFile(new URL('../app/instalar/page.tsx', import.meta.url), 'utf8');
  for (const trecho of ['bl-icon-192.png', 'bl-afiliado-icon-192.png', 'bl-admin-icon-192.png', '/afiliado/entrar', '/admin/entrar']) assert.ok(page.includes(trecho), `faltou ${trecho}`);
});
test('senha: regra única (mínimo 6, letra e número) no formulário', async () => {
  const lib = await readFile(new URL('../lib/password.ts', import.meta.url), 'utf8');
  assert.match(lib, /PASSWORD_MIN = 6/); assert.match(lib, /\\p\{L\}/);
  for (const file of ['auth-form', 'password-forms', 'account-extras']) {
    const code = await readFile(new URL(`../components/${file}.tsx`, import.meta.url), 'utf8');
    assert.ok(!/pattern="\[0-9\]\{6,8\}"/.test(code), `${file} ainda exige só números`);
  }
});
test('install page button asks the browser to install instead of only opening hints', async () => {
  const code = await readFile(new URL('../components/pwa-register.tsx', import.meta.url), 'utf8');
  assert.match(code, /event\.prompt\(\)/);
  assert.match(code, /startInstallCapture\(\)/);
});

function pushWorker() {
  const shown = []; const opened = []; const listeners = {};
  const self = {
    location: { origin: 'https://bl.example' },
    addEventListener: (name, fn) => { listeners[name] = fn; },
    registration: { showNotification: async (title, options) => { shown.push({ title, options }); } },
    clients: { matchAll: async () => [], openWindow: async url => { opened.push(url); } },
    skipWaiting: async () => {},
  };
  vm.runInNewContext(source, { URL, Response, Date, JSON, self, caches: {}, fetch: async () => ({ ok: false }) });
  const push = async data => { let p; listeners.push({ data: { json: () => data, text: () => '' }, waitUntil: v => { p = v; } }); await p; };
  const click = async (data, action = '') => { let p; listeners.notificationclick({ action, notification: { close() {}, data }, waitUntil: v => { p = v; } }); await p; };
  return { shown, opened, push, click };
}
test('push mostra aviso com ícone, selo monocromático, imagem e botão', async () => {
  const w = pushWorker();
  await w.push({ titulo: '🎉 Você tem uma cota premiada!', mensagem: 'Parabéns', link: '/minha-conta', tag: 'cota.premiada', urgente: true, imagem: '/brand/push-hero-premio.png', acoes: [{ action: 'abrir', title: 'Ver minha cota' }] });
  const { title, options } = w.shown[0];
  assert.equal(title, '🎉 Você tem uma cota premiada!');
  assert.equal(options.badge, '/brand/bl-push-badge-96.png');
  assert.equal(options.image, '/brand/push-hero-premio.png');
  assert.equal(options.requireInteraction, true);
  assert.equal(JSON.stringify(options.actions), JSON.stringify([{ action: 'abrir', title: 'Ver minha cota' }]));
  assert.equal(options.data.link, '/minha-conta');
});
test('push ignora imagem externa e link de outro site', async () => {
  const w = pushWorker();
  await w.push({ titulo: 'Oi', mensagem: 'x', link: 'https://evil.example', imagem: 'https://evil.example/x.png' });
  assert.equal(w.shown[0].options.image, undefined);
  assert.equal(w.shown[0].options.data.link, '/aplicativo');
  assert.equal(w.shown[0].options.requireInteraction, false);
});
test('tocar no aviso abre a tela certa', async () => {
  const w = pushWorker();
  await w.click({ link: '/afiliado' }, 'abrir');
  assert.deepEqual(w.opened, ['https://bl.example/afiliado']);
});
