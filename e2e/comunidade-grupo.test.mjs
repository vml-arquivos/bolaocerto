// Grupo do afiliado: quem se cadastra pelo link dele entra no grupo e, depois do cadastro, vê o WhatsApp do grupo,
// a comunidade e o Instagram do BL. O afiliado não convida afiliados (só clientes).
// Uso: E2E_API_URL=http://localhost:3001 E2E_BASE_URL=http://localhost:3000 node --test e2e/comunidade-grupo.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const API = (process.env.E2E_API_URL ?? 'http://localhost:3001').replace(/\/$/, '') + '/api/v1';
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const stamp = Date.now();
const admin = { cookie: '' };
const state = {};

async function call(method, path, body, jar = admin) {
  const response = await fetch(API + path, { method, headers: { cookie: jar.cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) jar.cookie = set.map((item) => item.split(';')[0]).join('; ');
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
const ok = (result, label) => assert.ok(result.status >= 200 && result.status < 300, `${label}: HTTP ${result.status} ${JSON.stringify(result.data).slice(0, 300)}`);
function randomCpf() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digit = (list) => { const sum = list.reduce((total, value, index) => total + value * (list.length + 1 - index), 0); const rest = (sum * 10) % 11; return rest === 10 ? 0 : rest; };
  const first = digit(base); return [...base, first, digit([...base, first])].join('');
}
const NUMBERS = [3, 12, 24, 36, 47, 58];
const pool = (concursoId, grupoId, over = {}) => ({ concursoId, grupoId, numerosApostados: NUMBERS, jogos: [{ ordem: 1, numeros: NUMBERS, quantidadeDezenas: 6, custo: 6 }], cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato', ...over });

const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

test('afiliado: grupo com WhatsApp, cliente entra pelo link dele e vê grupo, comunidade e Instagram', async () => {
  ok(await call('POST', '/auth/login', { email: EMAIL, senha: PASSWORD }), 'login admin');
  const before = (await call('GET', '/config/comunidade')).data;
  try {
    ok(await call('PUT', '/admin/comunidade', { comunidade: 'https://chat.whatsapp.com/ComunidadeBL', grupo: '', instagram: 'https://www.instagram.com/bolaolivre' }), 'salvar comunidade e Instagram');
    assert.equal((await call('PUT', '/admin/comunidade', { instagram: 'https://tiktok.com/@bl' })).status, 400, 'Instagram só aceita instagram.com');

    // Afiliado aprovado, com o grupo dele.
    const jar = { cookie: '' };
    const email = `afil.grupo.${stamp}@teste.local`;
    ok(await call('POST', '/admin/afiliados', { nome: 'Afiliado Grupo', cpf: randomCpf(), email, dataNascimento: '1990-01-01', senha: 'Senha123' }), 'criar afiliado');
    const row = (await call('GET', `/admin/afiliados?busca=${encodeURIComponent(email)}`)).data.items[0];
    if (row.statusAprovacao !== 'aprovado') ok(await call('POST', `/admin/afiliados/${row.id}/aprovar`, { comissaoPadraoPct: 10 }), 'aprovar');
    ok(await call('POST', '/auth/login', { email, senha: 'Senha123' }, jar), 'login afiliado');
    let groups = (await call('GET', '/afiliados/me/grupos', undefined, jar)).data;
    groups = Array.isArray(groups) ? groups : groups.items ?? [];
    if (!groups.length) { ok(await call('POST', '/afiliados/me/grupos', { nome: 'Grupo do Afiliado', slug: `grupo-afil-${stamp}` }, jar), 'criar grupo'); groups = (await call('GET', '/afiliados/me/grupos', undefined, jar)).data; groups = Array.isArray(groups) ? groups : groups.items ?? []; }
    const group = groups[0];

    // Só o dono do grupo (ou a equipe) muda o link; só convite do WhatsApp.
    assert.equal((await call('PUT', `/grupos/${group.id}/whatsapp`, { link: 'https://site.com/x' }, jar)).status, 400);
    ok(await call('PUT', `/grupos/${group.id}/whatsapp`, { link: 'https://chat.whatsapp.com/GrupoDoAfiliado' }, jar), 'afiliado salva o WhatsApp do grupo');

    // O afiliado não convida afiliados: só clientes.
    const affInvite = await call('POST', '/afiliados/me/convites', { tipo: 'afiliado' }, jar);
    assert.ok(affInvite.status >= 400, `afiliado não cria convite de afiliado (HTTP ${affInvite.status})`);
    ok(await call('POST', '/afiliados/me/convites', { tipo: 'usuario' }, jar), 'convite de cliente continua funcionando');

    // Cliente se cadastra pelo link do afiliado: entra no grupo dele.
    const client = { cookie: '' };
    const clientEmail = `cliente.grupo.${stamp}@teste.local`;
    ok(await call('POST', '/auth/registrar', { nome: 'Cliente do Grupo', cpf: randomCpf(), email: clientEmail, telefone: '11912345678', maiorDeIdade: true, aceiteTermos: true, aceitePrivacidade: true, senha: 'Senha123', confirmarSenha: 'Senha123', codigoAfiliado: row.codigoAfiliado }, client), 'cadastro pelo link do afiliado');
    const mine = (await call('GET', '/usuarios/me/comunidade', undefined, client)).data;
    assert.deepEqual(mine.grupos.map((item) => item.link), ['https://chat.whatsapp.com/GrupoDoAfiliado'], 'o cliente entrou no grupo do afiliado e vê o WhatsApp dele');
    assert.equal((await call('PUT', `/grupos/${group.id}/whatsapp`, { link: 'https://chat.whatsapp.com/Outro' }, client)).status, 403, 'cliente não muda o link do grupo');

    // Tela depois do cadastro: botões do grupo, da comunidade e do Instagram.
    const { chromium } = createRequire(import.meta.url)('playwright');
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
      const login = await page.request.post(`${BASE}/api/v1/auth/login`, { data: { email: clientEmail, senha: 'Senha123' } });
      ok({ status: login.status(), data: await login.text() }, 'login cliente no navegador');
      await page.goto(`${BASE}/aplicativo?bemvindo=1`, { waitUntil: 'load', timeout: 60000 });
      await page.getByText('Cadastro concluído. Boas-vindas ao Bolão Livre!').waitFor({ timeout: 30000 });
      const welcome = page.locator('.welcome-join');
      assert.equal(await welcome.locator('[data-testid="whatsapp-meu-grupo"]').getAttribute('href'), 'https://chat.whatsapp.com/GrupoDoAfiliado');
      assert.equal(await welcome.locator('[data-testid="whatsapp-comunidade"]').getAttribute('href'), 'https://chat.whatsapp.com/ComunidadeBL');
      assert.equal(await welcome.locator('[data-testid="instagram"]').getAttribute('href'), 'https://www.instagram.com/bolaolivre');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'sem rolagem lateral no celular');
      await page.goto(`${BASE}/aplicativo`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(1500);
      assert.equal(await page.locator('.welcome-join').count(), 0, 'sem ?bemvindo=1 a faixa não aparece');
    } finally { await browser.close(); }
  } finally {
    // Volta a configuração como estava.
    await call('PUT', '/admin/comunidade', { comunidade: before.comunidade ?? '', grupo: before.grupo ?? '', instagram: before.instagram ?? '' });
  }
});
