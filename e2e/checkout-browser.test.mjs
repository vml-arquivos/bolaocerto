// Checkout no navegador: reserva pelo site, tela de pagamento com QR Code, aviso de pago (Cora simulada)
// e volta automática para o bolão. Precisa da API com a Cora simulada, `node e2e/fake-cora.mjs` e o site no ar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const CONTROL = (process.env.FAKE_CORA_CONTROL_URL ?? 'http://localhost:8444').replace(/\/$/, '');
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
function randomCpf() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digit = (list) => { const sum = list.reduce((total, value, index) => total + value * (list.length + 1 - index), 0); const rest = (sum * 10) % 11; return rest === 10 ? 0 : rest; };
  const first = digit(base); return [...base, first, digit([...base, first])].join('');
}

test('compra pelo site: checkout com QR Code, confirmação automática e volta ao bolão', async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(`erro de página: ${error.message}`));
    page.on('response', (response) => { if (response.url().includes('/api/') && response.status() >= 500) problems.push(`HTTP ${response.status()} em ${response.url().replace(BASE, '')}`); });
    const api = async (method, path, data) => {
      const response = await page.request.fetch(`${BASE}/api/v1${path}`, { method, data, multipart: undefined });
      assert.ok(response.ok(), `${method} ${path}: HTTP ${response.status()} ${(await response.text()).slice(0, 200)}`);
      return response.json().catch(() => ({}));
    };

    // Preparo: administrador publica um bolão.
    await api('POST', '/auth/login', { email: EMAIL, senha: PASSWORD });
    const group = await api('GET', '/grupos/bl-oficial');
    const contest = await api('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: 60000 + Math.floor(Math.random() * 9000), dataSorteio: future(15) });
    const numbers = [4, 13, 25, 37, 48, 59];
    const pool = await api('POST', '/admin/boloes', { concursoId: contest.id, grupoId: group.id, numerosApostados: numbers, jogos: [{ ordem: 1, numeros: numbers, quantidadeDezenas: 6, custo: 6 }], cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato' });
    const form = await page.request.post(`${BASE}/api/v1/operacao/boloes/${pool.id}/anexos`, { multipart: { tipo: 'comprovante_aposta', visivelParticipantes: 'true', arquivo: { name: 'comprovante.png', mimeType: 'image/png', buffer: PNG } } });
    assert.ok(form.ok(), `comprovante: HTTP ${form.status()}`);
    await api('POST', `/admin/boloes/${pool.id}/publicar`);
    await context.clearCookies();

    // Comprador cria a conta e abre o bolão.
    const cpf = randomCpf();
    await api('POST', '/auth/registrar', { nome: 'Comprador Checkout', cpf, email: `checkout.${Date.now()}@teste.local`, telefone: '11912345678', maiorDeIdade: true, aceiteTermos: true, aceitePrivacidade: true, senha: 'Senha123', confirmarSenha: 'Senha123' });
    const poolPage = `/boloes/${pool.id}`;
    await page.goto(BASE + poolPage, { waitUntil: 'load', timeout: 90000 });
    await page.waitForSelector('.purchase-card form');
    // O pagamento usa o nome e o CPF do cadastro: nenhum campo de titular na tela.
    assert.equal(await page.locator('#titularNome').count(), 0, 'não pede o titular de novo');
    assert.equal(await page.locator('#titularCpf').count(), 0);
    await page.check('.purchase-card form input[type=checkbox]');
    await page.click('.purchase-card form button.button-primary');

    // Vai para o checkout, com QR Code e código para copiar.
    await page.waitForURL((url) => url.pathname.startsWith('/checkout/'), { timeout: 60000 });
    await page.waitForSelector('img.pix-qr', { timeout: 30000 });
    const code = await page.textContent('.checkout-copy code');
    assert.ok(code.startsWith('0002'), 'o código copia-e-cola do Pix precisa aparecer');
    assert.ok(await page.isVisible('text=Aguardando o pagamento'));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, 'a tela de pagamento não pode ter rolagem lateral');

    // Cora simulada avisa que pagou: a tela confirma sozinha e volta ao bolão.
    const state = await (await fetch(`${CONTROL}/__state`)).json();
    const invoice = state.invoices.at(-1);
    assert.ok(invoice, 'a cobrança precisa existir na Cora');
    await fetch(`${CONTROL}/__pay/${invoice.id}`, { method: 'POST' });
    await page.waitForSelector('text=Pagamento confirmado!', { timeout: 30000 });
    await page.waitForURL((url) => url.pathname === poolPage, { timeout: 30000 });
    assert.deepEqual(problems, []);
  } finally {
    await browser.close();
  }
});
