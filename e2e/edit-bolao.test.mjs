// Editar bolão no painel: o formulário precisa abrir exatamente com o que foi salvo
// (concurso, limite por pessoa, texto das regras, descrição e jogos; a janela de venda é automática).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

test('editar bolão abre com as informações salvas', async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(`erro de página: ${error.message}`));
    const api = async (method, path, data) => {
      const response = await page.request.fetch(`${BASE}/api/v1${path}`, { method, data });
      assert.ok(response.ok(), `${method} ${path}: HTTP ${response.status()} ${(await response.text()).slice(0, 200)}`);
      return response.json().catch(() => ({}));
    };
    await api('POST', '/auth/login', { email: EMAIL, senha: PASSWORD });
    const group = await api('GET', '/grupos/bl-oficial');
    const number = 50000 + Math.floor(Math.random() * 9000);
    const contest = await api('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: number, dataSorteio: future(20) });
    const numbers = [3, 12, 24, 36, 47, 58];
    const pool = await api('POST', '/admin/boloes', { concursoId: contest.id, grupoId: group.id, numerosApostados: numbers, jogos: [{ ordem: 1, numeros: numbers, quantidadeDezenas: 6, custo: 6 }], cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato' });
    await api('PATCH', `/admin/boloes/${pool.id}`, { maxCotasPorPessoa: 7, regrasVenda: 'Regra de teste salva' });

    await page.goto(`${BASE}/admin?view=boloes`, { waitUntil: 'load', timeout: 90000 });
    const row = page.locator('tr', { hasText: `#${number}` }).first();
    await row.waitFor({ timeout: 30000 });
    const more = row.getByRole('button', { name: /Mais/ });
    await more.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await more.click();
    await page.locator('[role=menuitem]', { hasText: /^Editar/ }).first().click();
    await page.waitForSelector('textarea', { timeout: 15000 });
    await page.waitForTimeout(800);

    const selects = await page.locator('select').evaluateAll((els) => els.map((e) => e.options[e.selectedIndex]?.textContent ?? ''));
    assert.ok(selects.some((text) => text.includes(`#${number}`)), `o concurso salvo (#${number}) precisa vir selecionado; veio: ${selects.join(' | ')}`);
    const numbersFields = await page.locator('input[type=number]').evaluateAll((els) => els.map((e) => e.value));
    assert.ok(numbersFields.includes('7'), `limite por pessoa salvo (7); veio: ${numbersFields.join(', ')}`);
    assert.equal(await page.locator('input[type=datetime-local]').count(), 0, 'a janela de venda é automática: sem campos de data');
    const areas = await page.locator('textarea').evaluateAll((els) => els.map((e) => e.value));
    assert.ok(areas.some((value) => value.includes('Regra de teste salva')), 'texto das regras salvo precisa aparecer');
    assert.ok(areas.some((value) => numbers.every((n) => value.includes(String(n).padStart(2, '0')) || value.includes(String(n)))), 'os jogos salvos precisam aparecer');
    assert.deepEqual(problems, []);
  } finally {
    await browser.close();
  }
});
