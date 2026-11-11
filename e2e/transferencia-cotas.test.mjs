// Transferir cotistas de um bolão para outro do mesmo concurso (ex.: afiliado que não vendeu o bastante).
// Uso: E2E_API_URL=http://localhost:3001 node --test e2e/transferencia-cotas.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const API = (process.env.E2E_API_URL ?? 'http://localhost:3001').replace(/\/$/, '') + '/api/v1';
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const stamp = Date.now();
const admin = { cookie: '' };
const affiliate = { cookie: '' };
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
const NUMBERS = [5, 14, 22, 33, 41, 60];
const pool = (concursoId, grupoId, over = {}) => ({ concursoId, grupoId, numerosApostados: NUMBERS, jogos: [{ ordem: 1, numeros: NUMBERS, quantidadeDezenas: 6, custo: 6 }], cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato', ...over });

async function buyer(name, bolaoId, quantidade, pay) {
  const jar = { cookie: '' };
  const cpf = randomCpf();
  ok(await call('POST', '/auth/registrar', { nome: name, cpf, email: `${name.split(' ')[0].toLowerCase()}.${stamp}@teste.local`, telefone: '11912345678', maiorDeIdade: true, aceiteTermos: true, aceitePrivacidade: true, senha: 'Senha123', confirmarSenha: 'Senha123' }, jar), `cadastro ${name}`);
  const terms = await call('GET', '/config/mandato', undefined, jar); ok(terms, 'termo');
  const reserve = await call('POST', '/cotas/reservar', { aceitoTermos: true, bolaoId, quantidade, titularCpf: cpf, titularNome: name, termoMandatoHash: terms.data.hash }, jar);
  ok(reserve, `reserva ${name}`);
  if (pay) ok(await call('POST', `/admin/cotas/${reserve.data.id}/baixa`, { forma: 'pix_direto' }), `baixa ${name}`);
  return { jar, shareId: reserve.data.id, name };
}
const adminPool = async (id) => (await call('GET', '/admin/boloes?page=1&pageSize=100')).data.items.find((item) => item.id === id);

test('preparo: afiliado com bolão, bolão de destino e cotistas', async () => {
  ok(await call('POST', '/auth/login', { email: EMAIL, senha: PASSWORD }), 'login admin');
  state.official = (await call('GET', '/grupos/bl-oficial')).data.id;
  const email = `afiliado.transf.${stamp}@teste.local`;
  ok(await call('POST', '/admin/afiliados', { nome: 'Afiliado Transfere', cpf: randomCpf(), email, dataNascimento: '1990-01-01', senha: 'Senha123' }), 'criar afiliado');
  state.aff = (await call('GET', `/admin/afiliados?busca=${encodeURIComponent(email)}`)).data.items[0];
  if (state.aff.statusAprovacao !== 'aprovado') ok(await call('POST', `/admin/afiliados/${state.aff.id}/aprovar`, { comissaoPadraoPct: 10 }), 'aprovar afiliado');
  ok(await call('POST', '/auth/login', { email, senha: 'Senha123' }, affiliate), 'login afiliado');
  const contract = await call('GET', '/afiliados/me/contrato', undefined, affiliate); ok(contract, 'contrato');
  ok(await call('POST', '/afiliados/me/contrato/aceitar', { hash: contract.data.hash, aceito: true }, affiliate), 'aceitar contrato');
  const workspace = await call('GET', '/afiliados/me/workspace', undefined, affiliate); ok(workspace, 'workspace');
  state.affGroup = workspace.data.grupos?.[0]?.id ?? workspace.data.grupo?.id;
  ok(await call('PATCH', `/admin/grupos/${state.affGroup}/capacidade`, { capacidadeExtra: 30 }), 'capacidade');

  const mk = async (days) => { const r = await call('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: 90000 + Math.floor(Math.random() * 9000), dataSorteio: future(days) }); ok(r, 'concurso'); return r.data; };
  state.contest = await mk(14);
  state.otherContest = await mk(15);
  const source = await call('POST', '/afiliados/me/boloes', pool(state.contest.id, state.affGroup), affiliate); ok(source, 'bolão de origem');
  state.source = source.data;
  ok(await call('POST', `/admin/boloes/${state.source.id}/publicar`), 'publicar origem');
  const mkAdmin = async (over, contest = state.contest) => { const r = await call('POST', '/admin/boloes', pool(contest.id, state.official, over)); ok(r, 'bolão admin'); ok(await call('POST', `/admin/boloes/${r.data.id}/publicar`), 'publicar'); return r.data; };
  state.dest = await mkAdmin({});
  state.destSmall = await mkAdmin({ totalCotas: 2 });
  const other = [1, 2, 3, 4, 5, 6];
  state.destOtherGames = await mkAdmin({ numerosApostados: other, jogos: [{ ordem: 1, numeros: other, quantidadeDezenas: 6, custo: 6 }] });
  state.destOtherPrice = await mkAdmin({ valorCota: 25 });
  state.destOtherContest = await mkAdmin({}, state.otherContest);

  state.ana = await buyer('Ana Transfere', state.source.id, 2, true);
  state.beto = await buyer('Beto Transfere', state.source.id, 1, true);
  state.caio = await buyer('Caio Reserva', state.source.id, 1, false);
  const row = await adminPool(state.source.id);
  assert.equal(row.cotasVendidas, 4, '2 + 1 pagas e 1 reservada');
});

test('opções de destino: só bolões compatíveis; só administrador', async () => {
  assert.ok([401, 403].includes((await call('GET', `/admin/boloes/${state.source.id}/destinos-transferencia`, undefined, affiliate)).status), 'afiliado não transfere');
  const options = await call('GET', `/admin/boloes/${state.source.id}/destinos-transferencia`); ok(options, 'opções');
  const ids = options.data.destinos.map((item) => item.id);
  assert.ok(ids.includes(state.dest.id) && ids.includes(state.destSmall.id) && ids.includes(state.destOtherGames.id));
  assert.ok(!ids.includes(state.destOtherPrice.id), 'valor diferente não serve');
  assert.ok(!ids.includes(state.destOtherContest.id), 'outro concurso não serve');
  assert.ok(!ids.includes(state.source.id), 'não oferece o próprio bolão');
  assert.equal(options.data.cotistas.length, 2, 'só quem já pagou');
  assert.equal(options.data.reservasEmAberto, 1);
  assert.equal(options.data.destinos.find((item) => item.id === state.dest.id).jogosIguais, true);
  assert.equal(options.data.destinos.find((item) => item.id === state.destOtherGames.id).jogosIguais, false);
});

test('travas: mesmo bolão, outro concurso, outro valor, pouco espaço, jogos diferentes, sem motivo', async () => {
  const t = (body, jar = admin) => call('POST', `/admin/boloes/${state.source.id}/transferir-cotas`, body, jar);
  assert.ok([401, 403].includes((await t({ destinoBolaoId: state.dest.id, motivo: 'teste' }, affiliate)).status));
  assert.equal((await t({ destinoBolaoId: state.source.id, motivo: 'teste' })).status, 400, 'mesmo bolão');
  assert.equal((await t({ destinoBolaoId: state.destOtherContest.id, motivo: 'teste' })).status, 409, 'outro concurso');
  assert.equal((await t({ destinoBolaoId: state.destOtherPrice.id, motivo: 'teste' })).status, 409, 'outro valor');
  assert.equal((await t({ destinoBolaoId: state.destSmall.id, motivo: 'teste' })).status, 409, 'só 2 vagas para 3 cotas');
  assert.equal((await t({ destinoBolaoId: state.destOtherGames.id, motivo: 'teste' })).status, 409, 'jogos diferentes sem confirmar');
  assert.equal((await t({ destinoBolaoId: state.dest.id })).status, 400, 'sem motivo');
  const sim = await t({ destinoBolaoId: state.destSmall.id, simular: true }); ok(sim, 'simulação');
  assert.equal(sim.data.ok, false);
  assert.ok(sim.data.erros[0].includes('livre'));
  // Nada mudou.
  assert.equal((await adminPool(state.source.id)).cotasVendidas, 4);
  assert.equal((await adminPool(state.dest.id)).cotasVendidas, 0);
});

test('transferir uma pessoa escolhida: cota, contagens, grupo, aviso e auditoria', async () => {
  const options = (await call('GET', `/admin/boloes/${state.source.id}/destinos-transferencia`)).data;
  const ana = options.cotistas.find((item) => item.nome.startsWith('Ana'));
  const preview = await call('POST', `/admin/boloes/${state.source.id}/transferir-cotas`, { destinoBolaoId: state.dest.id, cotaIds: [ana.cotaId], simular: true }); ok(preview, 'conferir');
  assert.equal(preview.data.ok, true); assert.equal(preview.data.cotas, 2); assert.equal(preview.data.pessoas, 1);
  assert.equal((await adminPool(state.dest.id)).cotasVendidas, 0, 'conferir não grava');
  const done = await call('POST', `/admin/boloes/${state.source.id}/transferir-cotas`, { destinoBolaoId: state.dest.id, cotaIds: [ana.cotaId], motivo: 'Afiliado não vendeu o mínimo' }); ok(done, 'transferir');
  assert.equal(done.data.ok, true); assert.equal(done.data.simulacao, false);
  assert.equal((await adminPool(state.source.id)).cotasVendidas, 2, 'origem: Beto (1) + reserva do Caio (1)');
  assert.equal((await adminPool(state.dest.id)).cotasVendidas, 2, 'destino recebeu 2');
  const mine = await call('GET', '/cotas/minhas', undefined, state.ana.jar); ok(mine, 'minhas cotas');
  const list = mine.data.items ?? mine.data;
  const share = list.find((item) => item.id === state.ana.shareId);
  assert.equal(share.bolao.id, state.dest.id, 'a cota agora é do bolão de destino');
  assert.equal(share.status, 'paga', 'continua paga');
  const notices = await call('GET', '/notificacoes', undefined, state.ana.jar); ok(notices, 'avisos');
  assert.ok(JSON.stringify(notices.data).includes('mudou de bolão'), 'a pessoa foi avisada');
  const again = await call('POST', `/admin/boloes/${state.source.id}/transferir-cotas`, { destinoBolaoId: state.dest.id, cotaIds: [ana.cotaId], motivo: 'repetido' });
  assert.equal(again.status, 409, 'não transfere duas vezes a mesma cota');
  assert.equal((await adminPool(state.dest.id)).cotasVendidas, 2, 'repetir não duplica');
});

test('transferir todos os que pagaram; a reserva sem pagamento fica; jogos diferentes só com confirmação', async () => {
  const done = await call('POST', `/admin/boloes/${state.source.id}/transferir-cotas`, { destinoBolaoId: state.destOtherGames.id, motivo: 'Juntar tudo no bolão da BL', confirmarJogosDiferentes: true }); ok(done, 'transferir todos');
  assert.equal(done.data.cotas, 1, 'só o Beto tinha pago');
  assert.ok(done.data.avisos.length > 0 && done.data.jogosDiferentes);
  const source = await adminPool(state.source.id);
  assert.equal(source.cotasVendidas, 1, 'sobrou só a reserva do Caio');
  assert.equal(source.indicadores.pagas, 0);
  assert.equal((await adminPool(state.destOtherGames.id)).cotasVendidas, 1);
  const empty = await call('POST', `/admin/boloes/${state.source.id}/transferir-cotas`, { destinoBolaoId: state.dest.id, motivo: 'nada a mover', simular: true }); ok(empty, 'simular vazio');
  assert.equal(empty.data.ok, false);
  const options = await call('GET', `/admin/boloes/${state.source.id}/destinos-transferencia`);
  assert.equal(options.data.cotistas.length, 0);
});

test('limite por pessoa do destino é respeitado', async () => {
  const limited = await call('POST', '/admin/boloes', pool(state.contest.id, state.official, { maxCotasPorPessoa: 1 })); ok(limited, 'bolão com limite');
  ok(await call('POST', `/admin/boloes/${limited.data.id}/publicar`), 'publicar');
  const src = await call('POST', '/admin/boloes', pool(state.contest.id, state.official)); ok(src, 'origem 2');
  ok(await call('POST', `/admin/boloes/${src.data.id}/publicar`), 'publicar');
  await buyer('Dora Limite', src.data.id, 2, true);
  const sim = await call('POST', `/admin/boloes/${src.data.id}/transferir-cotas`, { destinoBolaoId: limited.data.id, simular: true }); ok(sim, 'simular');
  assert.equal(sim.data.ok, false);
  assert.ok(sim.data.erros.join(' ').includes('limite'));
});

test('duas transferências ao mesmo tempo: só uma passa e as contas fecham', async () => {
  const mk = async () => { const r = await call('POST', '/admin/boloes', pool(state.contest.id, state.official)); ok(r, 'bolão'); ok(await call('POST', `/admin/boloes/${r.data.id}/publicar`), 'publicar'); return r.data; };
  const [src, a, b] = [await mk(), await mk(), await mk()];
  await buyer('Eva Paralela', src.id, 3, true);
  const [first, second] = await Promise.all([
    call('POST', `/admin/boloes/${src.id}/transferir-cotas`, { destinoBolaoId: a.id, motivo: 'corrida A' }),
    call('POST', `/admin/boloes/${src.id}/transferir-cotas`, { destinoBolaoId: b.id, motivo: 'corrida B' }),
  ]);
  const statuses = [first.status, second.status].sort();
  assert.ok(statuses[0] >= 200 && statuses[0] < 300 && statuses[1] === 409, `uma passa e a outra recusa: ${statuses}`);
  const total = (await adminPool(src.id)).cotasVendidas + (await adminPool(a.id)).cotasVendidas + (await adminPool(b.id)).cotasVendidas;
  assert.equal(total, 3, 'nenhuma cota some nem duplica');
});

test('no painel: Mais → Transferir cotistas, conferir e transferir', async () => {
  const { createRequire } = await import('node:module');
  const { chromium } = createRequire(import.meta.url)('playwright');
  const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const number = 91000 + Math.floor(Math.random() * 8000);
  const contest = await call('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: number, dataSorteio: future(16) }); ok(contest, 'concurso');
  const mk = async () => { const r = await call('POST', '/admin/boloes', pool(contest.data.id, state.official)); ok(r, 'bolão'); ok(await call('POST', `/admin/boloes/${r.data.id}/publicar`), 'publicar'); return r.data; };
  const src = await mk(); const dst = await mk();
  await buyer('Fabio Painel', src.id, 2, true);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('dialog', (dialog) => void dialog.accept());
    ok(await (async () => { const r = await page.request.fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', data: { email: EMAIL, senha: PASSWORD } }); return { status: r.status(), data: '' }; })(), 'login web');
    await page.goto(`${BASE}/admin?view=boloes`, { waitUntil: 'load', timeout: 90000 });
    const rows = page.locator('tr', { hasText: `#${number}` });
    await rows.first().waitFor({ timeout: 30000 });
    // Só o bolão com cota paga oferece a transferência.
    let opened = false;
    for (let i = 0; i < await rows.count() && !opened; i += 1) {
      const more = rows.nth(i).getByRole('button', { name: /Mais/ });
      await more.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await more.click();
      const item = page.locator('[role=menuitem]', { hasText: /Transferir cotistas/ });
      if (await item.count()) { await item.first().click(); opened = true; } else await page.keyboard.press('Escape');
    }
    assert.ok(opened, 'o menu mostra "Transferir cotistas" no bolão que tem cota paga');
    await page.getByText('Todos que já pagaram').waitFor({ timeout: 15000 });
    const transfer = page.getByRole('button', { name: 'Transferir agora' });
    assert.equal(await transfer.isDisabled(), true, 'só libera depois de conferir');
    await page.getByPlaceholder(/afiliado não vendeu/).fill('Teste pelo painel');
    await page.getByRole('button', { name: 'Conferir' }).click();
    await page.getByText('Tudo certo.').waitFor({ timeout: 15000 });
    await transfer.click();
    await page.getByText(/Cotistas transferidos/).waitFor({ timeout: 20000 });
    assert.equal((await adminPool(dst.id)).cotasVendidas, 2, 'o destino recebeu as cotas');
    assert.equal((await adminPool(src.id)).cotasVendidas, 0);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); }
});
