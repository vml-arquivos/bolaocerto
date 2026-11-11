// Navegação de verdade (Chromium): site público e todas as telas do painel.
// Precisa do site e da API no ar. Uso:
//   NODE_PATH=$(npm root -g) E2E_BASE_URL=http://localhost:3000 E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... node --test e2e/browser.test.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';
const PUBLIC_PAGES = ['/', '/resultados', '/estatisticas', '/termos', '/privacidade', '/jogo-responsavel', '/login', '/cadastro', '/esqueci-senha', '/instalar'];
const ADMIN_VIEWS = ['visao-geral', 'concursos', 'boloes', 'jogos', 'cotas', 'recebimentos', 'comprovantes', 'operacao', 'afiliados', 'convites', 'grupos', 'comissoes', 'repasses', 'usuarios', 'lotericas', 'auditoria', 'configuracoes', 'vitrine', 'crm', 'controle', 'comunicados', 'relatorios', 'notas-fiscais', 'conexoes', 'integ-nfse', 'integ-pagamentos', 'integ-caixa', 'documentos', 'funil'];

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

/** Abre um contexto e junta tudo o que dá errado numa lista (erros de página, 5xx nas chamadas à API). */
async function open(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(`erro na página: ${error.message}`));
  page.on('response', (response) => { if (response.url().includes('/api/') && response.status() >= 500) problems.push(`HTTP ${response.status()} em ${response.url().replace(BASE, '')}`); });
  return { context, page, problems };
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test('páginas públicas abrem sem erro, no computador e no celular', async () => {
  for (const [name, viewport] of [['computador', { width: 1280, height: 800 }], ['celular', { width: 390, height: 844 }]]) {
    const { context, page, problems } = await open(viewport);
    // Também abre a página de um bolão, se houver algum na vitrine.
    const available = await page.request.get(BASE + '/api/v1/boloes/disponiveis').then((response) => response.ok() ? response.json() : []).catch(() => []);
    const poolId = (Array.isArray(available) ? available : available.items ?? [])[0]?.id;
    for (const path of [...PUBLIC_PAGES, ...(poolId ? [`/boloes/${poolId}`] : [])]) {
      const response = await page.goto(BASE + path, { waitUntil: 'load', timeout: 90000 });
      assert.ok(response && response.status() < 400, `${path} (${name}): HTTP ${response?.status()}`);
      await page.waitForSelector('h1:visible, h2:visible', { timeout: 30000 });
      assert.ok((await overflow(page)) <= 1, `${path} (${name}): a página rola para o lado`);
    }
    assert.deepEqual(problems, [], `${name}: ${problems.join(' | ')}`);
    await context.close();
  }
});

test('painel sem login manda para a entrada', async () => {
  const { context, page } = await open({ width: 1280, height: 800 });
  await page.goto(BASE + '/admin', { waitUntil: 'load', timeout: 90000 });
  await page.waitForURL(/\/(admin\/entrar|login)/, { timeout: 30000 });
  await context.close();
});

test('painel: entra, abre todas as telas e salva a página inicial', async () => {
  const { context, page, problems } = await open({ width: 1536, height: 864 });
  await page.goto(BASE + '/admin/entrar', { waitUntil: 'load', timeout: 90000 });
  await page.fill('#email', EMAIL);
  await page.fill('#senha', PASSWORD);
  await Promise.all([page.waitForURL((url) => !url.pathname.includes('/entrar'), { timeout: 60000 }), page.click('button.button-primary')]);

  for (const view of ADMIN_VIEWS) {
    await page.goto(`${BASE}/admin?view=${view}`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForSelector('.admin-page-heading h1, main h1', { timeout: 60000 });
    const toast = await page.locator('.admin-toast-error').allTextContents();
    assert.deepEqual(toast, [], `tela ${view} mostrou erro: ${toast.join(' | ')}`);
    assert.ok((await overflow(page)) <= 2, `tela ${view}: a página rola para o lado`);
  }

  // Página inicial: alterar, salvar sem erro e voltar ao que era.
  await page.goto(`${BASE}/admin?view=vitrine`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('.vitrine-check input', { timeout: 60000 });
  const box = page.locator('.vitrine-check input').first();
  const before = await box.isChecked();
  for (const target of [!before, before]) {
    await box.setChecked(target);
    await page.getByRole('button', { name: /^Salvar/ }).first().click();
    await page.waitForSelector('.admin-toast', { timeout: 30000 });
    assert.equal(await page.locator('.admin-toast-error').count(), 0, 'salvar a página inicial deu erro');
    await page.waitForSelector('.admin-toast', { state: 'detached', timeout: 15000 }).catch(() => undefined);
  }

  assert.deepEqual(problems, [], problems.join(' | '));
  await context.close();
});

test('painel: banco de números guarda um jogo digitado', async () => {
  const { context, page, problems } = await open({ width: 1536, height: 864 });
  await page.goto(BASE + '/admin/entrar', { waitUntil: 'load', timeout: 90000 });
  await page.fill('#email', EMAIL);
  await page.fill('#senha', PASSWORD);
  await Promise.all([page.waitForURL((url) => !url.pathname.includes('/entrar'), { timeout: 60000 }), page.click('button.button-primary')]);
  await page.goto(`${BASE}/admin?view=jogos`, { waitUntil: 'load', timeout: 90000 });
  await page.getByRole('tab', { name: 'Banco de números' }).click();
  const unique = [1, 2, 3, 4, 5, 6].map(() => 10 + Math.floor(Math.random() * 50));
  const line = [...new Set(unique)].sort((a, b) => a - b);
  while (line.length < 6) line.push(60 - line.length);
  await page.locator('textarea').fill(line.join(' '));
  await page.getByRole('button', { name: 'Guardar no banco' }).click();
  await page.waitForSelector('.admin-toast', { timeout: 30000 });
  assert.equal(await page.locator('.admin-toast-error').count(), 0, 'guardar no banco deu erro');
  assert.deepEqual(problems, [], problems.join(' | '));
  await context.close();
});

// Conta antiga (criada pelo administrador) vê a janela de aceite de termos no primeiro acesso: aceita pela tela.
async function acceptLegalGate(page) {
  const gate = page.locator('.legal-gate');
  try { await gate.waitFor({ state: 'visible', timeout: 8000 }); } catch { return; }
  for (const name of ['termos', 'privacidade', 'maiorDeIdade']) await gate.locator(`input[name="${name}"]`).check();
  await gate.locator('button.button-primary').click();
  await gate.waitFor({ state: 'hidden', timeout: 15000 });
}

test('afiliado: entra pelo site e abre todas as abas do painel dele', async () => {
  const { context, page, problems } = await open({ width: 1280, height: 800 });
  // O administrador cadastra o afiliado (pela mesma sessão do navegador).
  await page.goto(BASE + '/admin/entrar', { waitUntil: 'load', timeout: 90000 });
  await page.fill('#email', EMAIL);
  await page.fill('#senha', PASSWORD);
  await Promise.all([page.waitForURL((url) => !url.pathname.includes('/entrar'), { timeout: 60000 }), page.click('button.button-primary')]);
  const email = `afiliado.nav.${Date.now()}@teste.local`;
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digit = (list) => { const sum = list.reduce((total, value, index) => total + value * (list.length + 1 - index), 0); const rest = (sum * 10) % 11; return rest === 10 ? 0 : rest; };
  const first = digit(base); const cpf = [...base, first, digit([...base, first])].join('');
  const created = await page.request.post(BASE + '/api/v1/admin/afiliados', { data: { nome: 'Afiliado Navegação', cpf, email, dataNascimento: '1991-03-02', senha: 'Senha123' } });
  assert.ok(created.ok(), `criar afiliado: HTTP ${created.status()}`);
  await context.clearCookies();

  await page.goto(BASE + '/login', { waitUntil: 'load', timeout: 90000 });
  await page.fill('#email', email);
  await page.fill('#senha', 'Senha123');
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button.button-primary')]);
  await page.goto(BASE + '/afiliado', { waitUntil: 'load', timeout: 90000 });
  await acceptLegalGate(page);
  await page.waitForSelector('.aff-tabs', { timeout: 60000 });
  await page.waitForSelector('.affiliate-kpis', { timeout: 60000 });
  for (const name of ['Início', 'Cotas', 'Vendas', 'Bolões', 'Grupos', 'Comissões']) {
    await page.locator('.aff-tabs a', { hasText: new RegExp(`^${name}$`) }).first().click();
    await page.waitForTimeout(600);
    assert.equal(await page.locator('.form-error, .admin-toast-error').count(), 0, `aba ${name} mostrou erro`);
  }
  assert.deepEqual(problems, [], problems.join(' | '));
  await context.close();
});
