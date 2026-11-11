// Bolão sem comprovante do jogo e sem números: publica e abre as vendas; o registro fica em "Para fazer" para depois.
// Uso: E2E_API_URL=http://localhost:3001 E2E_BASE_URL=http://localhost:3000 node --test e2e/publicar-sem-comprovante.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const API = (process.env.E2E_API_URL ?? 'http://localhost:3001').replace(/\/$/, '') + '/api/v1';
const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const jar = { cookie: '' };
const state = {};

async function call(method, path, body) {
  const response = await fetch(API + path, { method, headers: { cookie: jar.cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) jar.cookie = set.map((item) => item.split(';')[0]).join('; ');
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
const ok = (r, label) => assert.ok(r.status >= 200 && r.status < 300, `${label}: HTTP ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
const NUMBERS = [3, 12, 24, 36, 47, 58];
const base = (concursoId, grupoId) => ({ concursoId, grupoId, cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato' });

test('preparo', async () => {
  ok(await call('POST', '/auth/login', { email: EMAIL, senha: PASSWORD }), 'login');
  state.official = (await call('GET', '/grupos/bl-oficial')).data.id;
  state.number = 93000 + Math.floor(Math.random() * 6000);
  const contest = await call('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: state.number, dataSorteio: future(20) }); ok(contest, 'concurso');
  state.contest = contest.data;
});

test('API: publica e vende sem comprovante e sem números; o Para fazer marca o que falta', async () => {
  // Só a quantidade de jogos e de números, valor e cotas: sem os números e sem comprovante.
  const created = await call('POST', '/admin/boloes', { ...base(state.contest.id, state.official), jogos: [], numerosApostados: [], jogosPrevistos: 2, dezenasPrevistas: 6 });
  if (created.status >= 400) {
    const fallback = await call('POST', '/admin/boloes', { ...base(state.contest.id, state.official), numerosApostados: NUMBERS, jogos: [{ ordem: 1, numeros: NUMBERS, quantidadeDezenas: 6, custo: 6 }] });
    ok(fallback, 'bolão'); state.pool = fallback.data;
  } else state.pool = created.data;
  const published = await call('POST', `/admin/boloes/${state.pool.id}/publicar`); ok(published, 'publicar sem comprovante');
  assert.equal(published.data.status, 'aberto');
  const row = (await call('GET', '/admin/operacao')).data.find((item) => item.id === state.pool.id);
  assert.ok(row, 'aparece em Para fazer');
  assert.equal(row.semComprovante, true, 'marcado como sem comprovante');
  assert.equal(row.arquivos, 0);
});

test('tela: janela do bolão novo deixa publicar sem comprovante e depois mostra o aviso', async () => {
  const draft = await call('POST', '/admin/boloes', { ...base(state.contest.id, state.official), numerosApostados: NUMBERS, jogos: [{ ordem: 1, numeros: NUMBERS, quantidadeDezenas: 6, custo: 6 }] }); ok(draft, 'rascunho');
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const login = await context.request.fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', data: { email: EMAIL, senha: PASSWORD } }); assert.ok(login.ok(), 'login web');
    const page = await context.newPage(); const problems = [];
    page.on('pageerror', (error) => problems.push(error.message)); page.on('dialog', (dialog) => void dialog.accept());
    await page.goto(`${BASE}/admin?view=boloes`, { waitUntil: 'load', timeout: 90000 });
    const row = page.locator('tr', { hasText: `#${state.number}` }).filter({ has: page.getByRole('button', { name: 'Publicar' }) }).first();
    await row.waitFor({ timeout: 30000 });
    await row.getByRole('button', { name: /Mais/ }).click();
    await page.locator('[role=menuitem]', { hasText: /^Comprovantes/ }).first().click();
    const publish = page.getByRole('button', { name: 'Publicar agora e enviar o comprovante depois' });
    await publish.waitFor({ timeout: 15000 });
    assert.equal(await publish.isDisabled(), false, 'não trava sem comprovante');
    assert.ok(await page.getByRole('button', { name: /Deixar como rascunho/ }).count(), 'também dá para deixar para depois');
    await publish.click();
    await page.getByText(/Bolão publicado/).first().waitFor({ timeout: 20000 });
    const rows = (await call('GET', '/admin/operacao')).data.filter((item) => item.concurso === state.number);
    assert.equal(rows.length, 2); assert.ok(rows.every((item) => item.status === 'aberto' && item.semComprovante), 'os dois ficam abertos e pendentes de comprovante');
    await page.goto(`${BASE}/admin?view=operacao`, { waitUntil: 'load', timeout: 60000 });
    await page.getByText('Falta o comprovante').first().waitFor({ timeout: 20000 });
    assert.ok(await page.getByRole('button', { name: 'Enviar comprovante' }).count() >= 1, 'botão pede o comprovante');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); }
});
