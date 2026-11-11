// Concursos e bolões: festa (Mega da Virada) criada com a hora oficial, aparece na criação do bolão, filtros e busca funcionam.
// Uso: E2E_API_URL=http://localhost:3001 E2E_BASE_URL=http://localhost:3000 node --test e2e/concursos-festas.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const API = (process.env.E2E_API_URL ?? 'http://localhost:3001').replace(/\/$/, '') + '/api/v1';
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';
const { chromium } = createRequire(import.meta.url)('playwright');
const jar = { cookie: '' };
const state = {};
const stamp = Date.now();

async function call(method, path, body) {
  const response = await fetch(API + path, { method, headers: { cookie: jar.cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) jar.cookie = set.map((item) => item.split(';')[0]).join('; ');
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
const ok = (r, label) => assert.ok(r.status >= 200 && r.status < 300, `${label}: HTTP ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
const hhmm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const dayOf = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

test('festa criada sem hora usa a hora oficial e a Mega da Virada aparece na lista de bolão', async () => {
  ok(await call('POST', '/auth/login', { email: EMAIL, senha: PASSWORD }), 'login');
  const presets = (await call('GET', '/admin/concursos/festas')).data;
  const virada = presets.find((item) => item.chave === 'mega-da-virada');
  assert.ok(virada?.proximoSorteio, 'Mega da Virada tem próximo sorteio no calendário');
  state.virada = virada.proximoSorteio;
  // Limpa sobra de execução anterior (mesmo dia).
  const old = (await call('GET', '/admin/concursos?status=festas&modalidade=megasena&pageSize=100')).data.items.filter((item) => item.nomeEspecial === 'Mega da Virada' && dayOf(item.dataSorteio) === state.virada.data && item.numeroDefinido === false);
  for (const item of old) await call('DELETE', `/admin/concursos/${item.id}/festa`);
  const created = await call('POST', '/admin/concursos/festa', { especial: 'mega-da-virada', dataSorteio: state.virada.data });
  ok(created, 'criar festa sem hora');
  state.festa = created.data;
  assert.equal(hhmm(created.data.dataSorteio), state.virada.hora, 'hora oficial preenchida sozinha');
  assert.equal(dayOf(created.data.dataSorteio), state.virada.data);

  const list = await call('GET', `/admin/concursos?status=bolao&modalidade=megasena&mes=${state.virada.data.slice(0, 7)}&pageSize=100`); ok(list, 'lista para bolão');
  assert.ok(list.data.items.some((item) => item.id === state.festa.id), 'festa sem número oficial aparece para criar bolão');
  assert.ok(list.data.items.every((item) => item.modalidade === 'megasena'), 'só a modalidade pedida');
  const sorted = list.data.items.map((item) => new Date(item.dataSorteio).getTime());
  assert.deepEqual(sorted, [...sorted].sort((a, b) => a - b), 'ordem por data');
  assert.ok(list.data.items.every((item) => new Date(item.dataSorteio) > new Date() || new Date(item.cutoffAt) > new Date()), 'nada vencido');
});

test('busca e mês filtram concursos e bolões', async () => {
  const byName = await call('GET', '/admin/concursos?status=bolao&busca=Virada&pageSize=100'); ok(byName, 'busca por nome');
  assert.ok(byName.data.items.some((item) => item.id === state.festa.id) && byName.data.items.every((item) => item.nomeEspecial?.includes('Virada')));
  const none = await call('GET', '/admin/concursos?status=bolao&busca=zzzzinexistente&pageSize=100');
  assert.equal(none.data.items.length, 0);
  const month = state.virada.data.slice(0, 7);
  const inMonth = await call('GET', `/admin/concursos?status=bolao&modalidade=megasena&mes=${month}&pageSize=100`); ok(inMonth, 'por mês');
  assert.ok(inMonth.data.items.some((item) => item.id === state.festa.id), 'festa no mês certo');
  assert.ok(inMonth.data.items.every((item) => dayOf(item.dataSorteio).slice(0, 7) === month), 'só o mês pedido');
  const festas = await call('GET', `/admin/concursos?status=festas&mes=${month}&pageSize=100`); ok(festas, 'festas por mês');
  assert.ok(festas.data.items.some((item) => item.id === state.festa.id));
  const hist = await call('GET', '/admin/concursos?status=historico&modalidade=quina&pageSize=30'); ok(hist, 'histórico por modalidade');
  assert.ok(hist.data.items.every((item) => item.modalidade === 'quina'));
  assert.equal((await call('GET', '/admin/concursos?mes=2026-13')).status, 400, 'mês inválido é recusado');
  const pools = await call('GET', `/admin/boloes?modalidade=megasena&mes=${month}&pageSize=50`); ok(pools, 'bolões por modalidade e mês');
  assert.ok(pools.data.items.every((item) => item.concurso.modalidade === 'megasena'));
  ok(await call('GET', '/admin/boloes?busca=Virada&pageSize=50'), 'bolões por nome de festa');
});

test('bolão pode ser criado no concurso de festa sem número oficial', async () => {
  const official = (await call('GET', '/grupos/bl-oficial')).data.id;
  const numbers = [4, 11, 23, 35, 48, 59];
  const pool = await call('POST', '/admin/boloes', { concursoId: state.festa.id, grupoId: official, numerosApostados: numbers, jogos: [{ ordem: 1, numeros: numbers, quantidadeDezenas: 6, custo: 6 }], cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato' });
  ok(pool, 'criar bolão na festa');
  state.pool = pool.data;
  const listed = (await call('GET', '/admin/boloes?busca=Virada&pageSize=50')).data.items;
  assert.ok(listed.some((item) => item.id === state.pool.id), 'bolão da festa aparece na busca por nome');
});

test('concurso manual aceita a hora do sorteio; no dia da festa vem marcado com a hora oficial', async () => {
  const future = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
  const manual = await call('POST', '/admin/concursos', { modalidade: 'quina', numeroConcurso: 70000 + Math.floor(Math.random() * 9000), dataSorteio: future, horaSorteio: '15:30' }); ok(manual, 'manual com hora');
  assert.equal(hhmm(manual.data.dataSorteio), '15:30');
  const plain = await call('POST', '/admin/concursos', { modalidade: 'quina', numeroConcurso: 70000 + Math.floor(Math.random() * 9000), dataSorteio: future }); ok(plain, 'manual sem hora');
  assert.equal(hhmm(plain.data.dataSorteio), '20:00', 'sem hora e sem festa: 20:00');
  assert.equal((await call('POST', '/admin/concursos', { modalidade: 'quina', numeroConcurso: 70001, dataSorteio: future, horaSorteio: '25:99' })).status, 400, 'hora inválida');
});

test('painel: criar bolão mostra a festa com dia e hora, busca e mês; Concursos e Bolões têm filtro de modalidade', async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const login = await context.request.fetch(`${API}/auth/login`, { method: 'POST', data: { email: EMAIL, senha: PASSWORD } });
    assert.ok(login.ok(), 'login do painel');
    const page = await context.newPage(); const problems = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('response', (response) => { if (response.url().includes('/api/') && response.status() >= 500) problems.push(`HTTP ${response.status()} ${response.url()}`); });

    await page.goto(`${BASE}/admin?view=boloes`, { waitUntil: 'load', timeout: 90000 });
    await page.locator('.admin-cta').click();
    const select = page.locator('label.admin-field', { hasText: /^Concurso aberto/ }).locator('select');
    await select.waitFor({ timeout: 30000 });
    await page.locator('label.admin-field', { hasText: /^Modalidade/ }).locator('select').first().selectOption('megasena');
    // Escolhe o mês da festa (a lista mostra no máximo 100 por vez; busca e mês levam ao resto).
    const monthKey = state.virada.data.slice(0, 7);
    await page.locator('label.admin-field', { hasText: /^Mês do sorteio/ }).locator('select').selectOption(monthKey);
    await page.waitForFunction(() => [...document.querySelectorAll('label.admin-field select option')].some((option) => /Mega da Virada/.test(option.textContent ?? '')), null, { timeout: 30000 });
    const optionText = await select.locator('option', { hasText: 'Mega da Virada' }).first().innerText();
    assert.match(optionText, /às \d{2}:\d{2}/, 'opção mostra a hora do sorteio');
    assert.match(optionText, /número a definir/, 'festa sem número oficial');
    const before = await select.locator('option').count();
    // Busca estreita a lista.
    await page.getByLabel('Buscar concurso').fill('Virada');
    await page.waitForFunction((count) => document.querySelectorAll('label.admin-field select option').length > 0 && [...document.querySelectorAll('label.admin-field')].find((l) => /^Concurso aberto/.test(l.textContent ?? ''))?.querySelectorAll('option').length < count, before, { timeout: 15000 }).catch(() => undefined);
    const afterSearch = await select.locator('option').count();
    assert.ok(afterSearch <= before, 'a busca não aumenta a lista');
    assert.ok(await select.locator('option', { hasText: 'Mega da Virada' }).count(), 'a festa continua na busca');
    // Escolhe a festa: mostra dia e hora do sorteio.
    const value = await select.locator('option', { hasText: 'Mega da Virada' }).first().getAttribute('value');
    await select.selectOption(value);
    await page.getByText(/Sorteio em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/).first().waitFor({ timeout: 10000 });
    // Mês sem concurso mostra aviso claro.
    await page.getByLabel('Buscar concurso').fill('zzzzinexistente');
    await page.waitForTimeout(800);
    assert.ok(await select.locator('option', { hasText: 'Mega da Virada' }).count(), 'o concurso já escolhido nunca some da lista');
    await page.getByLabel('Buscar concurso').fill('');

    // Filtros de modalidade nas telas de lista.
    await page.goto(`${BASE}/admin?view=concursos`, { waitUntil: 'load', timeout: 90000 });
    const modality = page.getByLabel('Filtrar por modalidade');
    await modality.waitFor({ timeout: 30000 });
    await modality.selectOption('quina');
    await page.waitForTimeout(1500);
    const rows = page.locator('table.admin-table tbody tr');
    const total = await rows.count();
    for (let index = 0; index < total; index += 1) assert.match(await rows.nth(index).innerText(), /Quina/i, 'só Quina na lista');
    await page.getByRole('tab', { name: 'Festas' }).click();
    await page.getByLabel('Filtrar por mês do sorteio').waitFor({ timeout: 10000 });
    await modality.selectOption('megasena');
    await page.waitForTimeout(1500);
    assert.ok(await page.getByText('Mega da Virada').first().isVisible(), 'a festa aparece na aba Festas');

    await page.goto(`${BASE}/admin?view=boloes`, { waitUntil: 'load', timeout: 90000 });
    await page.getByLabel('Filtrar por modalidade').waitFor({ timeout: 30000 });
    await page.getByLabel('Filtrar por mês do sorteio').waitFor({ timeout: 10000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, 'sem rolagem lateral');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); }
});

test('limpeza: remove o bolão e a festa de teste', async () => {
  if (state.pool?.id) await call('DELETE', `/admin/boloes/${state.pool.id}/sem-movimentacao?forcar=true`);
  if (state.festa?.id) await call('DELETE', `/admin/concursos/${state.festa.id}/festa`);
});
