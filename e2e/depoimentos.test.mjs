// Página do afiliado (WhatsApp, comunidade, Instagram), depoimentos com estrelas (escrever, aprovar, mostrar no site)
// e botões Logar / Criar conta no celular.
// Uso: E2E_API_URL=http://localhost:3001 E2E_BASE_URL=http://localhost:3000 node --test e2e/depoimentos.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const API = (process.env.E2E_API_URL ?? 'http://localhost:3001').replace(/\/$/, '') + '/api/v1';
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const stamp = Date.now();
const admin = { cookie: '' };
const state = {};

async function call(method, path, body, jar = admin) {
  const response = await fetch(API + path, { method, headers: { cookie: jar.cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) jar.cookie = set.map((item) => item.split(';')[0]).join('; ');
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
const ok = (result, label) => assert.ok(result.status >= 200 && result.status < 300, `${label}: HTTP ${result.status} ${JSON.stringify(result.data).slice(0, 300)}`);
function randomCpf() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digit = (list) => { const sum = list.reduce((total, value, index) => total + value * (list.length + 1 - index), 0); const rest = (sum * 10) % 11; return rest === 10 ? 0 : rest; };
  const first = digit(base); return [...base, first, digit([...base, first])].join('');
}
const NUMBERS = [3, 12, 24, 36, 47, 58];
const pool = (concursoId, grupoId, over = {}) => ({ concursoId, grupoId, numerosApostados: NUMBERS, jogos: [{ ordem: 1, numeros: NUMBERS, quantidadeDezenas: 6, custo: 6 }], cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato', ...over });

const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

test('página do afiliado e depoimentos com estrelas', async () => {
  ok(await call('POST', '/auth/login', { email: EMAIL, senha: PASSWORD }), 'login admin');
  // Afiliado aprovado.
  const aff = { cookie: '' };
  const email = `afil.pagina.${stamp}@teste.local`;
  ok(await call('POST', '/admin/afiliados', { nome: 'Joana Afiliada', cpf: randomCpf(), email, dataNascimento: '1990-01-01', senha: 'Senha123' }), 'criar afiliado');
  const row = (await call('GET', `/admin/afiliados?busca=${encodeURIComponent(email)}`)).data.items[0];
  if (row.statusAprovacao !== 'aprovado') ok(await call('POST', `/admin/afiliados/${row.id}/aprovar`, { comissaoPadraoPct: 10 }), 'aprovar');
  ok(await call('POST', '/auth/login', { email, senha: 'Senha123' }, aff), 'login afiliado');

  // Página do afiliado: só convites do WhatsApp e perfil do Instagram.
  assert.equal((await call('PUT', '/afiliados/me/links', { instagram: 'https://site.com/joana' }, aff)).status, 400);
  ok(await call('PUT', '/afiliados/me/links', { grupo: 'https://chat.whatsapp.com/GrupoJoana', comunidade: 'https://chat.whatsapp.com/ComunidadeJoana', instagram: 'https://www.instagram.com/joana' }, aff), 'salvar links da página');
  assert.equal((await call('GET', '/afiliados/me/links', undefined, aff)).data.instagram, 'https://www.instagram.com/joana');

  // Cliente trazido por ela vê os links dela.
  const client = { cookie: '' };
  const clientEmail = `cliente.dep.${stamp}@teste.local`;
  ok(await call('POST', '/auth/registrar', { nome: 'Carla Mendes Souza', cpf: randomCpf(), email: clientEmail, telefone: '11912345678', maiorDeIdade: true, aceiteTermos: true, aceitePrivacidade: true, senha: 'Senha123', confirmarSenha: 'Senha123', codigoAfiliado: row.codigoAfiliado }, client), 'cadastro pelo link da afiliada');
  const links = (await call('GET', '/usuarios/me/comunidade', undefined, client)).data;
  assert.deepEqual(links.afiliado, { nome: 'Joana', grupo: 'https://chat.whatsapp.com/GrupoJoana', comunidade: 'https://chat.whatsapp.com/ComunidadeJoana', instagram: 'https://www.instagram.com/joana' });
  assert.equal((await call('PUT', '/afiliados/me/links', { grupo: '' }, client)).status, 403, 'cliente não mexe na página do afiliado');

  // Depoimentos: sobre o BL e sobre a afiliada.
  const mine = (await call('GET', '/depoimentos/meus', undefined, client)).data;
  assert.deepEqual(mine.destinos.map((item) => item.nome), ['Bolão Livre', 'Joana Afiliada']);
  assert.equal(mine.nomeSugerido, 'Carla S.');
  assert.equal((await call('POST', '/depoimentos', { texto: 'curto', estrelas: 5 }, client)).status, 400);
  assert.equal((await call('POST', '/depoimentos', { texto: 'Texto válido aqui.', estrelas: 0 }, client)).status, 400);
  const sys = await call('POST', '/depoimentos', { texto: `Participar foi simples e recebi o comprovante ${stamp}.`, estrelas: 5 }, client); ok(sys, 'depoimento sobre o BL');
  const aboutAff = await call('POST', '/depoimentos', { texto: 'A Joana me ajudou a escolher o bolão.', estrelas: 4, afiliadoId: row.id, nome: 'Carla' }, client); ok(aboutAff, 'depoimento sobre a afiliada');
  assert.equal(sys.data.status, 'pendente');
  assert.ok(!(await call('GET', '/depoimentos?limite=50')).data.items.some((item) => item.id === sys.data.id), 'antes de aprovar não aparece no site');
  assert.ok([401, 403].includes((await call('PATCH', `/admin/depoimentos/${sys.data.id}`, { status: 'aprovado' }, client)).status), 'cliente não aprova');
  ok(await call('PATCH', `/admin/depoimentos/${sys.data.id}`, { status: 'aprovado' }), 'aprovar BL');
  ok(await call('PATCH', `/admin/depoimentos/${aboutAff.data.id}`, { status: 'aprovado' }), 'aprovar afiliada');
  const pub = (await call('GET', '/depoimentos?limite=50')).data;
  const shown = pub.items.find((item) => item.id === sys.data.id);
  assert.ok(shown && shown.nome === 'Carla S.' && shown.estrelas === 5, 'aprovado aparece no site com o nome escolhido');
  assert.ok(!JSON.stringify(pub).includes(clientEmail), 'o site não mostra e-mail de ninguém');
  const affView = (await call('GET', '/afiliados/me/depoimentos', undefined, aff)).data;
  assert.equal(affView.total, 1); assert.equal(affView.media, 4);
  assert.equal((await call('GET', `/depoimentos?afiliado=${row.codigoAfiliado}`)).data.items.length, 1, 'filtro por afiliado');

  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  try {
    // Visitante no celular: Logar e Criar conta à vista, sem rolagem lateral, no site e no app do cliente.
    for (const width of [360, 390]) {
      const page = await (await browser.newContext({ viewport: { width, height: 800 } })).newPage();
      for (const path of ['/', '/aplicativo']) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 60000 });
        for (const name of ['Logar', 'Criar conta']) assert.equal(await page.locator('.site-header .header-actions').getByRole('link', { name, exact: true }).isVisible(), true, `${name} visível em ${path} @${width}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `sem rolagem lateral em ${path} @${width}`);
      }
    }
    // Site: seção na página inicial e página de depoimentos.
    const site = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
    await site.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60000 });
    await site.locator('#depoimentos').getByText('O que dizem os cotistas').waitFor({ timeout: 20000 });
    await site.goto(`${BASE}/depoimentos`, { waitUntil: 'load', timeout: 60000 });
    await site.getByText(`recebi o comprovante ${stamp}`, { exact: false }).waitFor({ timeout: 20000 });
    // Cliente: escreve pelo app (estrelas clicáveis) e vê os links da afiliada.
    const app = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await app.request.post(`${BASE}/api/v1/auth/login`, { data: { email: clientEmail, senha: 'Senha123' } });
    await app.goto(`${BASE}/aplicativo?bemvindo=1`, { waitUntil: 'load', timeout: 60000 });
    const welcome = app.locator('.welcome-join');
    await welcome.waitFor({ timeout: 20000 });
    assert.equal(await welcome.locator('[data-testid="afiliado-instagram"]').getAttribute('href'), 'https://www.instagram.com/joana');
    assert.equal(await welcome.locator('[data-testid="afiliado-comunidade"]').getAttribute('href'), 'https://chat.whatsapp.com/ComunidadeJoana');
    await app.goto(`${BASE}/minha-conta?aba=conta&abrir=depoimento`, { waitUntil: 'load', timeout: 60000 });
    const form = app.locator('.testimonial-form');
    await form.waitFor({ timeout: 20000 });
    await form.getByRole('radio', { name: '3 estrelas' }).click();
    await form.getByLabel('Seu depoimento').fill('Atualizei: gostei, mas quero mais bolões de Quina.');
    await form.getByRole('button', { name: 'Atualizar depoimento' }).click();
    await app.getByText(/Seu depoimento foi enviado/).waitFor({ timeout: 20000 });
    assert.equal(await app.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'formulário sem rolagem lateral');
    // Afiliada: aba Minha página.
    const affPage = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await affPage.request.post(`${BASE}/api/v1/auth/login`, { data: { email, senha: 'Senha123' } });
    await affPage.goto(`${BASE}/afiliado?aba=pagina`, { waitUntil: 'load', timeout: 60000 });
    await affPage.getByText('Depoimentos sobre você').waitFor({ timeout: 20000 });
    // Os links carregam logo depois da tela: espera o valor salvo aparecer no campo.
    await affPage.waitForFunction(() => [...document.querySelectorAll('input')].some((input) => input.value === 'https://www.instagram.com/joana'), undefined, { timeout: 15000 });
    assert.equal(await affPage.getByLabel('Meu Instagram').inputValue(), 'https://www.instagram.com/joana');
  } finally { await browser.close(); }
  // Voltou para aprovação depois de editar.
  assert.equal((await call('GET', '/depoimentos/meus', undefined, client)).data.itens.find((item) => item.id === sys.data.id).status, 'pendente');
  ok(await call('DELETE', `/admin/depoimentos/${sys.data.id}`), 'excluir');
  ok(await call('DELETE', `/admin/depoimentos/${aboutAff.data.id}`), 'excluir 2');
});
