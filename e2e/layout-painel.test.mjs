// Painel sem barra de rolagem lateral, botão de data comemorativa legível nos dois temas
// e tela de Concursos navegando pelos próximos meses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const monthKey = (offset) => { const base = new Date(Date.now() - 3 * 3600e3); return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1)).toISOString().slice(0, 7); };

function luminance([r, g, b]) {
  const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('painel: sem rolagem lateral, contraste e meses de concursos', async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    const api = async (method, path, data) => {
      const response = await page.request.fetch(`${BASE}/api/v1${path}`, { method, data });
      assert.ok(response.ok(), `${method} ${path}: HTTP ${response.status()} ${(await response.text()).slice(0, 200)}`);
      return response.json().catch(() => ({}));
    };
    await api('POST', '/auth/login', { email: EMAIL, senha: PASSWORD });

    // Dados para a tela de bolões ter linhas de verdade.
    const group = await api('GET', '/grupos/bl-oficial');
    const number = 60000 + Math.floor(Math.random() * 9000);
    const contest = await api('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: number, dataSorteio: future(25) });
    const numbers = [4, 11, 23, 35, 48, 59];
    await api('POST', '/admin/boloes', { concursoId: contest.id, grupoId: group.id, numerosApostados: numbers, jogos: [{ ordem: 1, numeros: numbers, quantidadeDezenas: 6, custo: 6 }], cotasTotal: 10, valorCota: 12.5, totalCotas: 10 }).catch(() => undefined);

    // 1) Nenhuma tela do painel cria barra de rolagem lateral.
    const views = ['boloes', 'concursos', 'usuarios', 'grupos', 'operacao', 'comprovantes', 'recebimentos', 'comissoes', 'cotas', 'jogos'];
    for (const width of [1024, 1280, 1366, 1600]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of views) {
        await page.goto(`${BASE}/admin?view=${view}`, { waitUntil: 'load', timeout: 90000 });
        await page.waitForTimeout(900);
        const overflow = await page.evaluate(() => ({
          page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          tables: [...document.querySelectorAll('.admin-table-scroll')].map((el) => el.scrollWidth - el.clientWidth).filter((diff) => diff > 1),
        }));
        assert.ok(overflow.page <= 1, `${view} @${width}: a página rola ${overflow.page}px para o lado`);
        assert.deepEqual(overflow.tables, [], `${view} @${width}: tabela com barra de rolagem lateral`);
      }
    }

    // 2) Botão "Criar para uma data comemorativa": contraste nos dois temas.
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`${BASE}/admin?view=boloes`, { waitUntil: 'load', timeout: 90000 });
    await page.getByRole('button', { name: /Novo bolão/ }).click();
    const festa = page.locator('button.festa-toggle');
    await festa.waitFor({ timeout: 30000 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      await page.waitForTimeout(300);
      const colors = await festa.evaluate((el) => {
        const parse = (css) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const style = getComputedStyle(el);
        return { fg: parse(style.color), bg: parse(style.backgroundColor) };
      });
      const contrast = ratio(colors.fg, colors.bg);
      assert.ok(contrast >= 4.5, `contraste do botão no tema ${theme}: ${contrast.toFixed(2)}`);
    }

    // 3) Concursos: lista por mês com os próximos meses.
    for (const offset of [0, 1, 2, 3]) {
      const month = monthKey(offset);
      const data = await api('GET', `/admin/concursos?status=aberto&mes=${month}&pageSize=100&page=1`);
      assert.ok(Array.isArray(data.items), 'lista de concursos do mês');
      for (const item of data.items) assert.equal(new Date(item.dataSorteio).toISOString().slice(0, 7) === month || new Date(new Date(item.dataSorteio).getTime() - 3 * 3600e3).toISOString().slice(0, 7) === month, true, `concurso fora do mês ${month}`);
      if (offset >= 1) assert.ok(data.items.length > 0, `mês ${month} sem nenhum sorteio previsto`);
    }
    await page.goto(`${BASE}/admin?view=concursos`, { waitUntil: 'load', timeout: 90000 });
    const tabs = page.locator('.month-nav-item');
    await tabs.first().waitFor({ timeout: 30000 });
    assert.equal(await tabs.count(), 7);
    await tabs.nth(1).click();
    await page.waitForTimeout(1500);
    assert.ok((await page.locator('table.admin-table tbody tr').count()) > 0, 'o mês seguinte mostra sorteios');
  } finally {
    await browser.close();
  }
});
