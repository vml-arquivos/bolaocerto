// Aplicativo do afiliado no navegador: entrada própria, instalação (manifesto próprio), menu de baixo no celular,
// aba Cotas com a cota vendida pelo link e bloqueio de quem não é afiliado. Precisa da API e do site no ar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
function randomCpf() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digit = (list) => { const sum = list.reduce((total, value, index) => total + value * (list.length + 1 - index), 0); const rest = (sum * 10) % 11; return rest === 10 ? 0 : rest; };
  const first = digit(base); return [...base, first, digit([...base, first])].join('');
}

// Conta antiga (criada pelo administrador) vê a janela de aceite de termos no primeiro acesso: aceita pela tela.
async function acceptLegalGate(page) {
  const gate = page.locator('.legal-gate');
  try { await gate.waitFor({ state: 'visible', timeout: 8000 }); } catch { return; }
  for (const name of ['termos', 'privacidade', 'maiorDeIdade']) await gate.locator(`input[name="${name}"]`).check();
  await gate.locator('button.button-primary').click();
  await gate.waitFor({ state: 'hidden', timeout: 15000 });
}

test('app do afiliado: entrada, manifesto, abas pela URL, aba Cotas e bloqueio de cliente', async () => {
  const browser = await chromium.launch();
  try {
    const stamp = Date.now();
    const admin = await browser.newContext(); const adminPage = await admin.newPage();
    const call = async (page, method, path, data) => {
      const response = await page.request.fetch(`${BASE}/api/v1${path}`, { method, data });
      assert.ok(response.ok(), `${method} ${path}: HTTP ${response.status()} ${(await response.text()).slice(0, 200)}`);
      return response.json().catch(() => ({}));
    };
    // Preparo: afiliado aprovado, bolão publicado e uma cota reservada pelo link dele.
    await call(adminPage, 'POST', '/auth/login', { email: EMAIL, senha: PASSWORD });
    const affiliateEmail = `afiliado.app.${stamp}@teste.local`;
    await call(adminPage, 'POST', '/admin/afiliados', { nome: 'Afiliado App', cpf: randomCpf(), email: affiliateEmail, dataNascimento: '1990-01-01', senha: 'Senha123' });
    const found = await call(adminPage, 'GET', `/admin/afiliados?busca=${encodeURIComponent(affiliateEmail)}`);
    const affiliate = found.items[0];
    if (affiliate.statusAprovacao !== 'aprovado') await call(adminPage, 'POST', `/admin/afiliados/${affiliate.id}/aprovar`, { comissaoPadraoPct: 10 });
    const group = await call(adminPage, 'GET', '/grupos/bl-oficial');
    const contest = await call(adminPage, 'POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: 70000 + Math.floor(Math.random() * 9000), dataSorteio: future(15) });
    const numbers = [2, 11, 23, 35, 46, 57];
    const pool = await call(adminPage, 'POST', '/admin/boloes', { concursoId: contest.id, grupoId: group.id, numerosApostados: numbers, jogos: [{ ordem: 1, numeros: numbers, quantidadeDezenas: 6, custo: 6 }], cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato' });
    const upload = await adminPage.request.post(`${BASE}/api/v1/operacao/boloes/${pool.id}/anexos`, { multipart: { tipo: 'comprovante_aposta', visivelParticipantes: 'true', arquivo: { name: 'comprovante.png', mimeType: 'image/png', buffer: PNG } } });
    assert.ok(upload.ok(), `comprovante: HTTP ${upload.status()}`);
    await call(adminPage, 'POST', `/admin/boloes/${pool.id}/publicar`);

    const buyer = await browser.newContext(); const buyerPage = await buyer.newPage();
    const buyerCpf = randomCpf(); const buyerEmail = `cliente.app.${stamp}@teste.local`;
    await call(buyerPage, 'POST', '/auth/registrar', { nome: 'Cliente Silva Souza', cpf: buyerCpf, email: buyerEmail, telefone: '11912345678', maiorDeIdade: true, aceiteTermos: true, aceitePrivacidade: true, senha: 'Senha123', confirmarSenha: 'Senha123' });
    const terms = await call(buyerPage, 'GET', '/config/mandato');
    await call(buyerPage, 'POST', '/cotas/reservar', { aceitoTermos: true, bolaoId: pool.id, quantidade: 2, titularCpf: buyerCpf, titularNome: 'Cliente Silva Souza', termoMandatoHash: terms.hash, codigoAfiliado: affiliate.codigoAfiliado });

    // Afiliado no celular.
    const phone = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
    const page = await phone.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(`erro de página: ${error.message}`));
    page.on('response', (response) => { if (response.url().includes('/api/') && response.status() >= 500) problems.push(`HTTP ${response.status()} em ${response.url().replace(BASE, '')}`); });

    // Visitante sem login é mandado para a entrada do próprio app (dentro do escopo /afiliado).
    await page.goto(`${BASE}/afiliado`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForURL((url) => url.pathname === '/afiliado/entrar', { timeout: 30000 });
    assert.equal(await page.getAttribute('link[rel=manifest]', 'href'), '/afiliado/manifest.webmanifest', 'a entrada do afiliado usa o manifesto do afiliado');
    assert.ok(await page.isVisible('text=Instalar o BL Afiliado'));
    const manifest = await (await page.request.get(`${BASE}/afiliado/manifest.webmanifest`)).json();
    assert.equal(manifest.id, '/afiliado'); assert.equal(manifest.scope, '/afiliado'); assert.equal(manifest.display, 'standalone');
    for (const icon of manifest.icons) assert.ok((await page.request.get(BASE + icon.src)).ok(), `ícone ${icon.src}`);

    // Login do afiliado cai direto no app.
    await page.fill('#email', affiliateEmail); await page.fill('#senha', 'Senha123');
    await page.click('form button.button-primary');
    await page.waitForURL((url) => url.pathname === '/afiliado', { timeout: 30000 });
    await acceptLegalGate(page);
    await page.waitForSelector('.aff-bottomnav', { timeout: 30000 });
    assert.equal(await page.getAttribute('link[rel=manifest]', 'href'), '/afiliado/manifest.webmanifest');
    assert.ok(!(await page.isVisible('.client-app-nav')), 'a barra do app do cliente não aparece no app do afiliado');
    assert.equal(await page.locator('.aff-bottomnav a').count(), 6);
    await page.waitForSelector('.affiliate-kpis', { timeout: 30000 });

    // Aba Cotas pela barra de baixo: a cota do link, só com nome e inicial, sem CPF.
    await page.click('.aff-bottomnav a[href="/afiliado?aba=cotas"]');
    await page.waitForURL((url) => url.searchParams.get('aba') === 'cotas');
    await page.waitForSelector('.aff-quota-list li', { timeout: 30000 });
    const text = await page.textContent('.aff-quota-list');
    assert.match(text, /Cliente S\./); assert.ok(!text.includes(buyerCpf), 'CPF do comprador não pode aparecer'); assert.ok(!text.includes(buyerEmail));
    assert.match(text, /2 cotas/); assert.match(text, /reservada/);
    await page.screenshot({ path: process.env.E2E_SHOT_DIR ? `${process.env.E2E_SHOT_DIR}/afiliado-cotas.png` : '/tmp/afiliado-cotas.png' });
    // Filtro: pagas não traz a cota reservada.
    await page.click('.aff-filters button:has-text("Pagas")');
    await page.waitForSelector('.affiliate-empty', { timeout: 15000 });

    // Vendas, Mais → Grupos e voltar do navegador respeitam a URL.
    await page.click('.aff-bottomnav a[href="/afiliado?aba=vendas"]');
    await page.waitForSelector('text=Vendas por bolão', { timeout: 20000 });
    // Clientes (CRM): o comprador do link aparece no funil como "reservou", sem CPF.
    await page.click('.aff-bottomnav a[href="/afiliado?aba=clientes"]');
    await page.waitForSelector('.crm-funnel', { timeout: 30000 });
    await page.waitForSelector('text=Cliente Silva Souza', { timeout: 30000 });
    const crmText = await page.textContent('.affiliate-crm');
    assert.ok(!crmText.includes(buyerCpf), 'CRM do afiliado não mostra CPF'); assert.ok(!crmText.includes(buyerEmail), 'e-mail aparece mascarado');
    assert.match(crmText, /Reservou/);
    await page.click('.crm-funnel-step:has-text("Reservou")');
    await page.waitForSelector('.affiliate-crm table tbody tr', { timeout: 15000 });
    await page.click('.affiliate-crm table tbody tr button:has-text("Ficha")');
    await page.fill('.affiliate-crm .affiliate-form textarea', 'Prefere pagar à noite');
    await page.click('.affiliate-crm .affiliate-form button.button-primary');
    await page.waitForSelector('text=Ficha salva.', { timeout: 15000 });
    // Painel de vendas na Início: bolão com quem comprou.
    await page.click('.aff-bottomnav a[href="/afiliado"]');
    await page.waitForSelector('[aria-label="Painel de vendas"] table', { timeout: 30000 });
    await page.click('.aff-bottomnav a[href="/afiliado?aba=mais"]');
    await page.click('.aff-more-links a[href="/afiliado?aba=grupos"]');
    await page.waitForSelector('text=Criar grupo próprio', { timeout: 20000 });
    assert.equal(await page.getAttribute('.aff-bottomnav a[aria-current=page]', 'href'), '/afiliado?aba=mais', 'Grupos fica sob "Mais" na barra de baixo');
    await page.goBack();
    await page.waitForSelector('.aff-more-links', { timeout: 15000 });

    // Atalho do manifesto abre a aba certa.
    await page.goto(`${BASE}/afiliado?aba=comissoes`, { waitUntil: 'load' });
    await page.waitForSelector('text=Minhas comissões', { timeout: 30000 });

    // Cliente (não afiliado) não entra pela entrada do afiliado.
    const other = await browser.newContext(); const otherPage = await other.newPage();
    await otherPage.goto(`${BASE}/afiliado/entrar`, { waitUntil: 'load', timeout: 60000 });
    await otherPage.fill('#email', buyerEmail); await otherPage.fill('#senha', 'Senha123');
    await otherPage.click('form button.button-primary');
    await otherPage.waitForSelector('.form-error', { timeout: 20000 });
    assert.match(await otherPage.textContent('.form-error'), /não é de afiliado/);
    assert.equal(new URL(otherPage.url()).pathname, '/afiliado/entrar');

    // Página de instalação lista os três aplicativos.
    await otherPage.goto(`${BASE}/instalar`, { waitUntil: 'load' });
    assert.equal(await otherPage.locator('.install-app-card').count(), 3);
    assert.deepEqual(problems, [], problems.join('; '));
  } finally { await browser.close(); }
});
