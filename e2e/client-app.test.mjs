// Aplicativo do cliente no celular: carrossel de bolões, janela com todos os números,
// compra sem pedir nome e CPF de novo e conta enxuta (cotas em destaque, resto recolhido).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
function randomCpf() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digit = (list) => { const sum = list.reduce((total, value, index) => total + value * (list.length + 1 - index), 0); const rest = (sum * 10) % 11; return rest === 10 ? 0 : rest; };
  const first = digit(base); return [...base, first, digit([...base, first])].join('');
}

test('app do cliente: carrossel, todos os números, compra sem repetir dados e conta enxuta', async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(`erro de página: ${error.message}`));
    page.on('response', (response) => { if (response.url().includes('/api/') && response.status() >= 500) problems.push(`HTTP ${response.status()} em ${response.url().replace(BASE, '')}`); });
    const api = async (method, path, data) => {
      const response = await page.request.fetch(`${BASE}/api/v1${path}`, { method, data });
      assert.ok(response.ok(), `${method} ${path}: HTTP ${response.status()} ${(await response.text()).slice(0, 200)}`);
      return response.json().catch(() => ({}));
    };

    await api('POST', '/auth/login', { email: EMAIL, senha: PASSWORD });
    const group = await api('GET', '/grupos/bl-oficial');
    const contest = await api('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: 61000 + Math.floor(Math.random() * 9000), dataSorteio: future(2) });
    const games = [[1, 12, 23, 34, 45, 56], [2, 13, 24, 35, 46, 57], [3, 14, 25, 36, 47, 58]];
    const pool = await api('POST', '/admin/boloes', { concursoId: contest.id, grupoId: group.id, numerosApostados: games[0], jogos: games.map((numeros, i) => ({ ordem: i + 1, numeros, quantidadeDezenas: 6, custo: 6 })), cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato' });
    await api('POST', `/admin/boloes/${pool.id}/publicar`);
    await context.clearCookies();

    // Cliente novo entra e vê os bolões em carrossel.
    const cpf = randomCpf();
    await api('POST', '/auth/registrar', { nome: 'Ana Carolina Teste', cpf, email: `app.${Date.now()}@teste.local`, telefone: '11912345678', maiorDeIdade: true, aceiteTermos: true, aceitePrivacidade: true, senha: 'Senha123', confirmarSenha: 'Senha123' });
    await page.goto(`${BASE}/aplicativo`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForSelector('.carousel-track .slide', { timeout: 30000 });
    assert.ok(await page.locator('.carousel-track .slide').count() >= 1, 'há bolões no carrossel');
    await page.locator(`.carousel-track a[href="/boloes/${pool.id}"]`).click();
    await page.waitForURL(`**/boloes/${pool.id}`);

    // Primeira tela enxuta + janela com todos os jogos.
    const text = await page.locator('main').innerText();
    for (const noise of ['Participação identificada', 'Composição aberta', 'Transparência antes da compra', 'Reserve suas cotas']) assert.ok(!text.includes(noise), `sem "${noise}" na primeira tela`);
    await page.getByRole('button', { name: /Ver todos os números/ }).click();
    const dialog = page.locator('dialog.numbers-dialog');
    await dialog.waitFor({ state: 'visible' });
    const dialogText = await dialog.innerText();
    for (const label of ['Jogo 01', 'Jogo 02', 'Jogo 03']) assert.ok(dialogText.includes(label), `${label} na janela`);
    assert.ok(dialogText.includes('58'), 'todas as dezenas aparecem');
    await dialog.getByRole('button', { name: 'Fechar' }).click();
    await dialog.waitFor({ state: 'hidden' });

    // Compra: sem nome e CPF; usa o cadastro.
    await page.waitForSelector('.purchase-card form');
    assert.equal(await page.locator('#titularNome').count(), 0);
    assert.ok((await page.locator('.buy-holder').innerText()).includes('Ana Carolina Teste'), 'titular é o cadastro');
    await page.click('.buy-qty .stepper button[aria-label="Mais uma cota"]');
    assert.ok((await page.locator('.buy-total').innerText()).includes('40,00'), 'total = 2 × R$ 20,00');
    await page.check('.purchase-card form input[type=checkbox]');
    await page.click('.purchase-card form button.button-primary');
    // Revisão da compra: nada é reservado até o cliente confirmar.
    await page.waitForSelector('.purchase-review');
    assert.ok((await page.locator('.purchase-review').innerText()).includes('40,00'), 'resumo mostra o total');
    await page.click('.purchase-review button.button-primary');
    await page.waitForURL((url) => url.pathname.startsWith('/checkout/'), { timeout: 60000 });

    // Conta enxuta: cotas em destaque; o resto recolhido; sem 2FA e sem aviso de teste para cliente.
    await page.goto(`${BASE}/minha-conta`, { waitUntil: 'load' });
    await page.waitForSelector('.cota-card', { timeout: 30000 });
    const account = await page.locator('main').innerText();
    for (const gone of ['Verificação em duas etapas', 'Enviar aviso de teste', 'Chave Pix']) assert.ok(!account.includes(gone), `sem "${gone}"`);
    await page.getByRole('tab', { name: 'Minha conta' }).click();
    await page.waitForSelector('.app-row');
    const rows = await page.locator('.app-row > summary, .app-row-link').allInnerTexts();
    for (const expected of ['Meus dados', 'Limite de gastos', 'Alterar senha', 'Privacidade e dados']) assert.ok(rows.some((row) => row.includes(expected)), `linha "${expected}"`);
    assert.ok(!rows.some((row) => row.includes('Verificação em duas etapas')), 'cliente não vê 2FA');
    await page.locator('.app-row > summary', { hasText: 'Meus dados' }).click();
    const data = await page.locator('.app-row[open] .app-row-body').first().innerText();
    assert.ok(/Chave Pix/i.test(data), 'cliente cadastra a própria chave Pix em Meus dados');
    assert.ok(/Endereço|endereço/.test(data), 'cliente vê o endereço em Meus dados');
    for (const name of ['Carteira', 'Indicar amigos']) await page.getByRole('tab', { name }).waitFor();
    await page.getByRole('tab', { name: 'Indicar amigos' }).click();
    await page.waitForSelector('.referral-card input');
    assert.ok((await page.locator('.referral-card input').inputValue()).includes('/r/'), 'link de indicação do cliente');
    await page.getByRole('tab', { name: 'Carteira' }).click();
    await page.waitForSelector('.wallet-balance');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); }
});
