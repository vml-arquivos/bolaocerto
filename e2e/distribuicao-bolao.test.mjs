// Bolão da equipe enviado por link para vários afiliados: cada um recebe no painel, as cotas são compartilhadas
// e o rastreio vai do envio do link até quem comprou.
// Uso: E2E_API_URL=http://localhost:3001 node --test e2e/distribuicao-bolao.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

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

async function newAffiliate(label) {
  const jar = { cookie: '' };
  const email = `afil.${label}.${stamp}@teste.local`;
  ok(await call('POST', '/admin/afiliados', { nome: `Afiliado ${label}`, cpf: randomCpf(), email, dataNascimento: '1990-01-01', senha: 'Senha123' }), `criar afiliado ${label}`);
  const row = (await call('GET', `/admin/afiliados?busca=${encodeURIComponent(email)}`)).data.items[0];
  if (row.statusAprovacao !== 'aprovado') ok(await call('POST', `/admin/afiliados/${row.id}/aprovar`, { comissaoPadraoPct: 10 }), 'aprovar');
  ok(await call('POST', '/auth/login', { email, senha: 'Senha123' }, jar), `login ${label}`);
  const contract = await call('GET', '/afiliados/me/contrato', undefined, jar); ok(contract, 'contrato');
  ok(await call('POST', '/afiliados/me/contrato/aceitar', { hash: contract.data.hash, aceito: true }, jar), 'aceitar contrato');
  return { jar, id: row.id, codigo: row.codigoAfiliado, nome: `Afiliado ${label}` };
}
async function buyer(name, bolaoId, quantidade, codigoAfiliado, expect = 'paga') {
  const jar = { cookie: '' };
  const cpf = randomCpf();
  ok(await call('POST', '/auth/registrar', { nome: name, cpf, email: `${name.split(' ')[0].toLowerCase()}.${stamp}${Math.floor(Math.random() * 1e6)}@teste.local`, telefone: '11912345678', maiorDeIdade: true, aceiteTermos: true, aceitePrivacidade: true, senha: 'Senha123', confirmarSenha: 'Senha123' }, jar), `cadastro ${name}`);
  const terms = await call('GET', '/config/mandato', undefined, jar); ok(terms, 'termo');
  const reserve = await call('POST', '/cotas/reservar', { aceitoTermos: true, bolaoId, quantidade, titularCpf: cpf, titularNome: name, termoMandatoHash: terms.data.hash, ...(codigoAfiliado ? { codigoAfiliado } : {}) }, jar);
  if (expect === 'recusa') return reserve;
  ok(reserve, `reserva ${name}`);
  ok(await call('POST', `/admin/cotas/${reserve.data.id}/baixa`, { forma: 'pix_direto' }), `baixa ${name}`);
  return { jar, shareId: reserve.data.id };
}
const overview = async () => (await call('GET', `/admin/boloes/${state.pool.id}/distribuicao`)).data;

test('preparo: bolão da equipe aberto e três afiliados', async () => {
  ok(await call('POST', '/auth/login', { email: EMAIL, senha: PASSWORD }), 'login admin');
  state.official = (await call('GET', '/grupos/bl-oficial')).data.id;
  const contest = await call('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: 80000 + Math.floor(Math.random() * 9000), dataSorteio: future(20) }); ok(contest, 'concurso');
  state.contest = contest.data;
  const created = await call('POST', '/admin/boloes', pool(state.contest.id, state.official)); ok(created, 'bolão');
  state.pool = created.data;
  state.draft = (await call('POST', '/admin/boloes', pool(state.contest.id, state.official))).data;
  ok(await call('POST', `/admin/boloes/${state.pool.id}/publicar`), 'publicar');
  state.a1 = await newAffiliate('Um'); state.a2 = await newAffiliate('Dois'); state.a3 = await newAffiliate('Tres');
});

test('só a equipe envia, só bolão aberto', async () => {
  assert.ok([401, 403].includes((await call('POST', `/admin/boloes/${state.pool.id}/distribuicao`, {}, state.a1.jar)).status), 'afiliado não gera link da equipe');
  assert.equal((await call('POST', `/admin/boloes/${state.draft.id}/distribuicao`, {})).status, 409, 'rascunho não pode');
});

test('link geral: vários afiliados aceitam e o bolão entra no painel de cada um', async () => {
  const link = await call('POST', `/admin/boloes/${state.pool.id}/distribuicao`, {}); ok(link, 'gerar link');
  state.link = link.data;
  assert.ok(state.link.codigo.length >= 10 && state.link.caminho.startsWith('/bolao-afiliado/'));
  const preview = await call('GET', `/bolao-distribuicao/${state.link.codigo}`, undefined, { cookie: '' }); ok(preview, 'prévia pública');
  assert.equal(preview.data.valido, true); assert.equal(preview.data.bolao.id, state.pool.id); assert.ok(preview.data.enviadoPor);
  assert.ok(!JSON.stringify(preview.data).includes('@'), 'a prévia não tem dados pessoais');
  const clientJar = { cookie: '' };
  ok(await call('POST', '/auth/registrar', { nome: 'Cliente Link', cpf: randomCpf(), email: `cliente.link.${stamp}@teste.local`, telefone: '11912345678', maiorDeIdade: true, aceiteTermos: true, aceitePrivacidade: true, senha: 'Senha123', confirmarSenha: 'Senha123' }, clientJar), 'cliente');
  assert.ok([401, 403].includes((await call('POST', '/afiliados/me/boloes-recebidos/aceitar', { codigo: state.link.codigo }, clientJar)).status), 'cliente só compra, não recebe para vender');
  const first = await call('POST', '/afiliados/me/boloes-recebidos/aceitar', { codigo: state.link.codigo }, state.a1.jar); ok(first, 'a1 aceita');
  assert.equal(first.data.jaTinha, false); assert.ok(first.data.linkVenda.includes(state.a1.codigo) && first.data.linkVenda.includes(state.pool.id));
  const again = await call('POST', '/afiliados/me/boloes-recebidos/aceitar', { codigo: state.link.codigo }, state.a1.jar); ok(again, 'a1 de novo');
  assert.equal(again.data.jaTinha, true, 'não duplica');
  ok(await call('POST', '/afiliados/me/boloes-recebidos/aceitar', { codigo: state.link.codigo }, state.a2.jar), 'a2 aceita');
  const mine = await call('GET', '/afiliados/me/boloes-recebidos', undefined, state.a1.jar); ok(mine, 'painel a1');
  assert.equal(mine.data.items.length, 1);
  assert.equal(mine.data.items[0].bolaoId, state.pool.id); assert.equal(mine.data.items[0].cotasDisponiveis, 10);
  assert.ok(mine.data.items[0].recebidoDe, 'mostra quem enviou');
  assert.equal((await call('GET', '/afiliados/me/boloes-recebidos', undefined, state.a3.jar)).data.items.length, 0, 'quem não abriu o link não vê');
  const data = await overview();
  assert.equal(data.afiliados.length, 2); assert.equal(data.links.length, 1); assert.equal(data.links[0].aceites, 2);
  assert.ok(data.afiliados.every((row) => row.enviadoPor), 'cada aceite sabe quem enviou');
  const row = (await call('GET', '/admin/boloes?page=1&pageSize=100')).data.items.find((item) => item.id === state.pool.id);
  assert.equal(row.distribuicao.afiliados, 2); assert.ok(row.distribuicao.enviadoPor.length >= 1);
});

test('link direto para um afiliado só vale para ele', async () => {
  const direct = await call('POST', `/admin/boloes/${state.pool.id}/distribuicao`, { afiliadoId: state.a3.id }); ok(direct, 'link direto');
  assert.equal((await call('POST', '/afiliados/me/boloes-recebidos/aceitar', { codigo: direct.data.codigo }, state.a1.jar)).status, 403, 'outro afiliado não usa');
  ok(await call('POST', '/afiliados/me/boloes-recebidos/aceitar', { codigo: direct.data.codigo }, state.a3.jar), 'a3 aceita o dele');
  const notices = await call('GET', '/notificacoes', undefined, state.a3.jar); ok(notices, 'avisos');
  assert.ok(JSON.stringify(notices.data).includes('Novo bolão para você vender'), 'o afiliado foi avisado do envio direto');
});

test('cotas compartilhadas: cada venda aparece no afiliado certo e o total acaba para todos', async () => {
  await buyer('Comprador Um', state.pool.id, 2, state.a1.codigo);
  await buyer('Comprador Dois', state.pool.id, 3, state.a2.codigo);
  await buyer('Comprador Direto', state.pool.id, 1, undefined);
  const data = await overview();
  const sold = (code) => data.vendas.find((row) => row.codigo === code)?.pagas;
  assert.equal(sold(state.a1.codigo), 2); assert.equal(sold(state.a2.codigo), 3);
  assert.equal(data.vendas.find((row) => row.afiliadoId === null).pagas, 1, 'venda direta separada');
  assert.equal(data.bolao.cotasVendidas, 6);
  assert.ok(data.cotas.some((cota) => cota.vendidoPor === 'Afiliado Um' && cota.quantidade === 2), 'relatório diz quem comprou e por qual afiliado');
  const mine = (await call('GET', '/afiliados/me/boloes-recebidos', undefined, state.a1.jar)).data.items[0];
  assert.equal(mine.minhasCotas.pagas, 2, 'o afiliado vê só o que ele vendeu');
  assert.equal(mine.cotasDisponiveis, 4, 'mas as cotas que sobram são as de todos');
  const tooMany = await buyer('Comprador Demais', state.pool.id, 5, state.a2.codigo, 'recusa');
  assert.equal(tooMany.status, 409, 'passou do que sobra');
  await buyer('Comprador Final', state.pool.id, 4, state.a1.codigo);
  const closed = (await call('GET', '/afiliados/me/boloes-recebidos', undefined, state.a2.jar)).data.items[0];
  assert.equal(closed.cotasDisponiveis, 0, 'acabou para todos os afiliados');
  const soldOut = await buyer('Sem Cota', state.pool.id, 1, state.a2.codigo, 'recusa');
  assert.equal(soldOut.status, 409);
});

test('revogar link e tirar afiliado: o histórico das vendas fica', async () => {
  ok(await call('DELETE', `/admin/boloes/${state.pool.id}/distribuicao/${state.link.id}`), 'revogar');
  assert.equal((await call('GET', `/bolao-distribuicao/${state.link.codigo}`, undefined, { cookie: '' })).data.valido, false);
  assert.equal((await call('POST', '/afiliados/me/boloes-recebidos/aceitar', { codigo: state.link.codigo }, state.a2.jar)).status, 404);
  ok(await call('DELETE', `/admin/boloes/${state.pool.id}/distribuicao/afiliados/${state.a2.id}`), 'tirar a2');
  assert.equal((await call('GET', '/afiliados/me/boloes-recebidos', undefined, state.a2.jar)).data.items.length, 0, 'saiu do painel');
  const data = await overview();
  assert.equal(data.vendas.find((row) => row.codigo === state.a2.codigo).pagas, 3, 'o que ele vendeu continua contado');
  assert.ok(data.afiliados.find((row) => row.afiliadoId === state.a2.id).removidoEm, 'registro mostra quando saiu');
});

test('nas telas: painel da equipe envia, página do link e painel do afiliado', async () => {
  const { createRequire } = await import('node:module');
  const { chromium } = createRequire(import.meta.url)('playwright');
  const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const number = 92000 + Math.floor(Math.random() * 7000);
  const contest = await call('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: number, dataSorteio: future(18) }); ok(contest, 'concurso');
  const created = await call('POST', '/admin/boloes', pool(contest.data.id, state.official)); ok(created, 'bolão');
  ok(await call('POST', `/admin/boloes/${created.data.id}/publicar`), 'publicar');
  await newAffiliate('Web');
  const affiliateEmail = `afil.Web.${stamp}@teste.local`;
  const browser = await chromium.launch();
  try {
    const login = async (context, email, senha) => { const r = await context.request.fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', data: { email, senha } }); assert.ok(r.ok(), `login ${email}: ${r.status()}`); };
    const problems = [];
    const watch = (page) => { page.on('pageerror', (error) => problems.push(error.message)); page.on('dialog', (dialog) => void dialog.accept()); };

    // 1) A equipe gera o link pelo painel.
    const adminContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await login(adminContext, EMAIL, PASSWORD);
    const adminPage = await adminContext.newPage(); watch(adminPage);
    await adminPage.goto(`${BASE}/admin?view=boloes`, { waitUntil: 'load', timeout: 90000 });
    const row = adminPage.locator('tr', { hasText: `#${number}` }).first();
    await row.waitFor({ timeout: 30000 });
    await row.getByRole('button', { name: /Mais/ }).click();
    await adminPage.locator('[role=menuitem]', { hasText: /Enviar para afiliados/ }).first().click();
    await adminPage.getByText('Links enviados').waitFor({ timeout: 15000 });
    await adminPage.getByRole('button', { name: 'Criar e copiar link' }).click();
    await adminPage.getByText(/Link criado/).first().waitFor({ timeout: 20000 });
    const link = (await call('GET', `/admin/boloes/${created.data.id}/distribuicao`)).data.links[0];
    assert.ok(link?.codigo, 'o link aparece na lista da equipe');

    // 2) Sem login: a página oferece entrar como afiliado ou só comprar.
    const anon = await (await browser.newContext()).newPage(); watch(anon);
    await anon.goto(`${BASE}/bolao-afiliado/${link.codigo}`, { waitUntil: 'load', timeout: 60000 });
    await anon.getByRole('link', { name: 'Entrar como afiliado' }).waitFor({ timeout: 15000 });
    assert.ok(await anon.getByRole('link', { name: /comprar minha cota/ }).count(), 'quem não é afiliado ainda pode comprar a cota');

    // 3) Afiliado logado: o bolão entra no painel dele.
    const affContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await login(affContext, affiliateEmail, 'Senha123');
    const affPage = await affContext.newPage(); watch(affPage);
    await affPage.goto(`${BASE}/bolao-afiliado/${link.codigo}`, { waitUntil: 'load', timeout: 60000 });
    await affPage.getByText(/Pronto! O bolão entrou no seu painel/).waitFor({ timeout: 20000 });
    await affPage.getByRole('link', { name: 'Abrir meu painel de bolões' }).click();
    await affPage.getByText('Bolões recebidos da BL').waitFor({ timeout: 30000 });
    await affPage.getByText(new RegExp(`#${number}`)).first().waitFor({ timeout: 15000 });
    assert.ok(await affPage.getByRole('button', { name: /Copiar link de venda/ }).count(), 'tem o link de venda');
    assert.equal(await affPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'sem rolagem lateral no celular');

    // 4) De volta ao painel da equipe: o afiliado e quem enviou aparecem.
    await adminPage.reload({ waitUntil: 'load' });
    const again = adminPage.locator('tr', { hasText: `#${number}` }).first();
    await again.waitFor({ timeout: 30000 });
    await again.getByText(/1 afiliado\(s\) com o bolão/).waitFor({ timeout: 15000 });
    assert.deepEqual(problems, []);
  } finally { await browser.close(); }
});
