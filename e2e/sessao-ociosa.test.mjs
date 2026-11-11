// Sessão some depois de um tempo sem uso e ao fechar a janela: cookies de sessão, prazo por papel e logout na tela.
// Uso: E2E_API_URL=http://localhost:3001 E2E_BASE_URL=http://localhost:3000 node --test e2e/sessao-ociosa.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const API = (process.env.E2E_API_URL ?? 'http://localhost:3001').replace(/\/$/, '') + '/api/v1';
const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';

test('API: cookies são de sessão (sem validade) e a tela fica sabendo o prazo do papel', async () => {
  const response = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, senha: PASSWORD }) });
  assert.ok(response.status < 300, `login HTTP ${response.status}`);
  const cookies = response.headers.getSetCookie();
  const access = cookies.find((item) => item.startsWith('access_token=')); const refresh = cookies.find((item) => item.startsWith('refresh_token='));
  assert.ok(access && refresh, 'os dois cookies foram enviados');
  for (const cookie of [access, refresh]) assert.ok(!/max-age|expires/i.test(cookie), `cookie de sessão, sem validade: ${cookie.split(';').slice(1).join(';')}`);
  const jar = cookies.map((item) => item.split(';')[0]).join('; ');
  const me = await (await fetch(`${API}/auth/me`, { headers: { cookie: jar } })).json();
  assert.equal(me.sessaoOciosaMin, 30, 'administrador: 30 minutos');
  const refreshed = await fetch(`${API}/auth/refresh`, { method: 'POST', headers: { cookie: jar } });
  assert.ok(refreshed.ok, 'renovação funciona dentro do prazo');
});

test('tela: parado além do prazo o painel sai da conta e pede login; usando, continua', async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage(); const problems = [];
    page.on('pageerror', (error) => problems.push(error.message));
    await page.goto(`${BASE}/admin/entrar`, { waitUntil: 'load', timeout: 90000 });
    await page.fill('#email', EMAIL); await page.fill('#senha', PASSWORD);
    await page.locator('form button.button-primary').click();
    await page.waitForURL('**/admin**', { timeout: 30000 });
    await page.locator('h1:visible, h2:visible').first().waitFor({ timeout: 30000 });

    // Usando: a atividade é registrada e o painel continua aberto.
    await page.mouse.move(200, 200); await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(500);
    const stamp = await page.evaluate(() => Number(localStorage.getItem('bl-last-activity') || 0));
    assert.ok(Date.now() - stamp < 60_000, 'a atividade recente fica registrada');
    await page.reload({ waitUntil: 'load' });
    await page.locator('h1:visible, h2:visible').first().waitFor({ timeout: 30000 });
    assert.ok(!page.url().includes('/admin/entrar'), 'quem está usando não é desconectado');

    // Parado há 31 minutos (limite da equipe é 30): ao voltar para a tela, sai e pede login.
    await page.evaluate(() => localStorage.setItem('bl-last-activity', String(Date.now() - 31 * 60_000)));
    await page.reload({ waitUntil: 'load' });
    await page.waitForURL('**/admin/entrar?motivo=inatividade', { timeout: 30000 });
    await page.getByText(/sua sessão terminou depois de um tempo sem uso/).waitFor({ timeout: 15000 });
    const cookies = await context.cookies();
    assert.ok(!cookies.some((cookie) => cookie.name === 'access_token' && cookie.value) && !cookies.some((cookie) => cookie.name === 'refresh_token' && cookie.value), 'os cookies de sessão foram apagados');
    const me = await context.request.fetch(`${BASE}/api/v1/auth/me`);
    assert.equal(me.status(), 401, 'sem sessão no servidor');

    // De novo: entrar com a senha funciona normalmente.
    await page.fill('#email', EMAIL); await page.fill('#senha', PASSWORD);
    await page.locator('form button.button-primary').click();
    await page.waitForURL(/\/admin(\?|$)/, { timeout: 30000 });
    assert.deepEqual(problems, []);
  } finally { await browser.close(); }
});

test('janela fechada: sem os cookies de sessão (navegador novo) o painel exige login', async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/admin`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForURL('**/admin/entrar**', { timeout: 30000 });
  } finally { await browser.close(); }
});
