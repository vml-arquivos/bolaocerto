// Telas: administrador cria cupom e campanha no painel; o cliente do grupo digita o cupom, vê o desconto e paga o valor menor.
// Uso: E2E_API_URL=http://localhost:3001 E2E_BASE_URL=http://localhost:3000 node --test e2e/cupons-painel.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';
const { chromium } = createRequire(import.meta.url)('playwright');
const stamp = Date.now();
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
function randomCpf() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digit = (list) => { const sum = list.reduce((total, value, index) => total + value * (list.length + 1 - index), 0); const rest = (sum * 10) % 11; return rest === 10 ? 0 : rest; };
  const first = digit(base); return [...base, first, digit([...base, first])].join('');
}
const NUMBERS = [5, 14, 26, 38, 49, 60];

test('painel cria cupom e campanha; cliente do grupo usa o cupom na compra', async () => {
  const browser = await chromium.launch();
  try {
    const adminCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const send = async (ctx, method, path, data) => {
      const response = await ctx.request.fetch(`${BASE}/api/v1${path}`, { method, data });
      assert.ok(response.ok(), `${method} ${path}: HTTP ${response.status()} ${(await response.text()).slice(0, 200)}`);
      return response.json().catch(() => ({}));
    };
    await send(adminCtx, 'POST', '/auth/login', { email: EMAIL, senha: PASSWORD });
    const slug = `ui-cotistas-${stamp}`; const groupName = `Cotistas UI ${stamp}`;
    await send(adminCtx, 'POST', '/admin/grupos', { nome: groupName, slug, descricao: 'teste' });
    const official = await send(adminCtx, 'GET', '/grupos/bl-oficial');
    const contest = await send(adminCtx, 'POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: 40000 + Math.floor(Math.random() * 9000), dataSorteio: future(20) });
    const pool = await send(adminCtx, 'POST', '/admin/boloes', { concursoId: contest.id, grupoId: official.id, numerosApostados: NUMBERS, jogos: [{ ordem: 1, numeros: NUMBERS, quantidadeDezenas: 6, custo: 6 }], cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato' });
    await send(adminCtx, 'POST', `/admin/boloes/${pool.id}/publicar`);

    // Cliente do grupo.
    const clientCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const clientEmail = `cupomui.${stamp}@teste.local`;
    await send(clientCtx, 'POST', '/auth/registrar', { nome: 'Cliente Cupom', cpf: randomCpf(), email: clientEmail, telefone: '11912345678', maiorDeIdade: true, aceiteTermos: true, aceitePrivacidade: true, senha: 'Senha123', confirmarSenha: 'Senha123' });
    await send(clientCtx, 'POST', `/grupos/${slug}/entrar`);

    // Painel do administrador.
    const admin = await adminCtx.newPage(); const problems = [];
    admin.on('pageerror', (error) => problems.push(error.message)); admin.on('dialog', (dialog) => void dialog.accept());
    admin.on('response', (response) => { if (response.url().includes('/api/') && response.status() >= 500) problems.push(`HTTP ${response.status()} ${response.url()}`); });
    await admin.goto(`${BASE}/admin?view=cupons`, { waitUntil: 'load', timeout: 90000 });
    await admin.getByRole('heading', { name: 'Cupons e cashback' }).waitFor({ timeout: 30000 });
    const code = `UI${String(stamp).slice(-6)}`;
    const form = admin.getByRole('form', { name: 'Criar cupom' });
    await form.getByLabel(/Código/).fill(code);
    await form.getByLabel(/Desconto \(%\)/).fill('5');
    // Sem escolher grupo nem cliente a tela recusa.
    await form.getByRole('button', { name: 'Criar cupom' }).click();
    await admin.getByText(/Escolha pelo menos um grupo/).first().waitFor({ timeout: 10000 });
    await form.getByLabel(new RegExp(groupName)).check();
    await form.getByRole('button', { name: 'Criar cupom' }).click();
    await admin.getByText(new RegExp(`Cupom ${code} criado`)).first().waitFor({ timeout: 20000 });
    const row = admin.locator('tr', { hasText: code });
    await row.waitFor({ timeout: 15000 });
    assert.ok(await row.getByText(new RegExp(`Grupo ${groupName}`)).count(), 'mostra o grupo que recebe');
    await row.getByRole('button', { name: 'Pausar' }).click();
    await admin.getByText(/pausado/).first().waitFor({ timeout: 15000 });
    await row.getByRole('button', { name: 'Ativar' }).click();
    await row.getByRole('button', { name: 'Pausar' }).waitFor({ timeout: 15000 });

    // Campanha de cashback (nasce pausada) e busca de cliente.
    await admin.getByRole('tab', { name: 'Cashback por campanha' }).click();
    const campaignForm = admin.getByRole('form', { name: 'Criar campanha de cashback' });
    await campaignForm.getByLabel('Nome da campanha').fill(`Campanha UI ${stamp}`);
    await campaignForm.getByLabel(/Cashback \(%/).fill('5');
    await campaignForm.getByLabel('Buscar cliente').fill(clientEmail);
    await campaignForm.getByRole('button', { name: new RegExp(clientEmail) }).click({ timeout: 15000 });
    await campaignForm.getByRole('button', { name: 'Criar campanha' }).click();
    await admin.getByText(/Campanha criada e pausada/).first().waitFor({ timeout: 20000 });
    const campaignRow = admin.locator('tr', { hasText: `Campanha UI ${stamp}` });
    await campaignRow.getByText('pausada').waitFor({ timeout: 15000 });
    await campaignRow.getByRole('button', { name: 'Ativar' }).click();
    await campaignRow.getByRole('button', { name: 'Pausar' }).waitFor({ timeout: 15000 });
    assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, 'sem rolagem lateral no painel');

    // Cliente digita o cupom, vê o desconto e paga menos.
    const client = await clientCtx.newPage();
    client.on('pageerror', (error) => problems.push(error.message));
    await client.goto(`${BASE}/boloes/${pool.id}`, { waitUntil: 'load', timeout: 90000 });
    await client.waitForSelector('.purchase-card form');
    await client.getByText('Tenho um cupom').click();
    await client.getByLabel('Código do cupom').fill('CODIGOERRADO');
    await client.getByRole('button', { name: 'Aplicar' }).click();
    await client.getByRole('alert').filter({ hasText: /não é válido/ }).waitFor({ timeout: 15000 });
    await client.getByRole('button', { name: 'Tirar cupom' }).click();
    await client.getByText('Tenho um cupom').click();
    await client.getByLabel('Código do cupom').fill(code);
    await client.getByRole('button', { name: 'Aplicar' }).click();
    await client.getByText(/Desconto de R\$\s*1,00 com o cupom/).waitFor({ timeout: 15000 });
    await client.getByText(/Cashback de 5% na carteira/).waitFor({ timeout: 15000 });
    await client.check('.purchase-card form input[type=checkbox]');
    await client.click('.purchase-card form button.button-primary');
    const review = client.locator('.purchase-review'); await review.waitFor();
    assert.ok(await review.getByText(/Desconto \(/).count(), 'resumo mostra o desconto');
    assert.match(await review.locator('.review-total').innerText(), /19,00/, 'total com desconto');
    await review.locator('button.button-primary').click();
    await client.waitForURL((url) => url.pathname.startsWith('/checkout/'), { timeout: 60000 });
    const shareId = new URL(client.url()).pathname.split('/').pop();
    const payment = await send(clientCtx, 'GET', `/cotas/${shareId}/pagamento`);
    assert.equal(Math.round(Number(payment.valorBruto) * 100), 1900, 'a cobrança gerada é a do valor com desconto');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); }
});
