// O cliente cancela a reserva e pede o cancelamento de cota paga; o administrador aprova (carteira) ou recusa.
// Uso: E2E_API_URL=http://localhost:3001 node --test e2e/cancelamento-cliente.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const API = (process.env.E2E_API_URL ?? 'http://localhost:3001').replace(/\/$/, '') + '/api/v1';
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';
const stamp = Date.now();
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const NUMBERS = [5, 14, 26, 38, 49, 57];
const admin = { cookie: '' };
const state = {};

async function call(method, path, body, jar = admin) {
  const response = await fetch(API + path, { method, headers: { cookie: jar.cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) jar.cookie = set.map((item) => item.split(';')[0]).join('; ');
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
const ok = (r, label) => assert.ok(r.status >= 200 && r.status < 300, `${label}: HTTP ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
function randomCpf() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digit = (list) => { const sum = list.reduce((total, value, index) => total + value * (list.length + 1 - index), 0); const rest = (sum * 10) % 11; return rest === 10 ? 0 : rest; };
  const first = digit(base); return [...base, first, digit([...base, first])].join('');
}
async function newClient(label) {
  const jar = { cookie: '' }; const cpf = randomCpf(); const name = `${label} Teste`;
  const email = `${label.toLowerCase()}.${stamp}.${Math.floor(Math.random() * 1e6)}@teste.local`;
  ok(await call('POST', '/auth/registrar', { nome: name, cpf, email, telefone: '11912345678', maiorDeIdade: true, aceiteTermos: true, aceitePrivacidade: true, senha: 'Senha123', confirmarSenha: 'Senha123' }, jar), 'cadastro');
  return { jar, cpf, name, email };
}
async function reserve(client) {
  const terms = await call('GET', '/config/mandato', undefined, client.jar);
  const reserved = await call('POST', '/cotas/reservar', { aceitoTermos: true, bolaoId: state.pool.id, quantidade: 1, titularCpf: client.cpf, titularNome: client.name, termoMandatoHash: terms.data.hash }, client.jar);
  ok(reserved, 'reservar');
  return reserved.data.id ?? reserved.data.cotaId ?? reserved.data.cota?.id;
}
const mine = async (client, id) => (await call('GET', '/cotas/minhas', undefined, client.jar)).data.find((item) => item.id === id);
const sold = async () => (await call('GET', `/admin/boloes?pageSize=100&busca=${state.pool.id}`)).data.items.find((item) => item.id === state.pool.id)?.cotasVendidas;
const balance = async (client) => (await call('GET', '/usuarios/me/carteira', undefined, client.jar)).data.saldoCentavos;
async function payManually(shareId) { ok(await call('POST', `/admin/cotas/${shareId}/baixa`, { forma: 'pix_direto' }), 'baixa'); }

test('preparo: bolão aberto e clientes', async () => {
  ok(await call('POST', '/auth/login', { email: EMAIL, senha: PASSWORD }), 'login admin');
  const group = (await call('GET', '/grupos/bl-oficial')).data;
  const contest = await call('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: 60000 + Math.floor(Math.random() * 9000), dataSorteio: future(25) }); ok(contest, 'concurso');
  const pool = await call('POST', '/admin/boloes', { concursoId: contest.data.id, grupoId: group.id, numerosApostados: NUMBERS, jogos: [{ ordem: 1, numeros: NUMBERS, quantidadeDezenas: 6, custo: 6 }], cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato' }); ok(pool, 'bolão');
  state.pool = pool.data;
  const form = new FormData(); form.set('tipo', 'comprovante_aposta'); form.set('visivelParticipantes', 'true'); form.set('arquivo', new Blob([PNG], { type: 'image/png' }), 'comprovante.png');
  assert.ok((await fetch(`${API}/operacao/boloes/${state.pool.id}/anexos`, { method: 'POST', headers: { cookie: admin.cookie }, body: form })).ok, 'comprovante');
  ok(await call('POST', `/admin/boloes/${state.pool.id}/publicar`), 'publicar');
  state.a = await newClient('Alice'); state.b = await newClient('Bruno');
});

test('cliente cancela a reserva que não pagou: a cota volta ao estoque', async () => {
  const id = await reserve(state.a);
  assert.equal(await sold(), 1);
  const card = await mine(state.a, id);
  assert.deepEqual([card.cancelamento.tipo, card.cancelamento.pode], ['reserva', true]);
  assert.equal((await call('POST', `/cotas/${id}/cancelar`, {}, state.b.jar)).status, 404, 'outra pessoa não cancela');
  ok(await call('POST', `/cotas/${id}/cancelar`, {}, state.a.jar), 'cancelar reserva');
  assert.equal((await mine(state.a, id)).status, 'cancelada');
  assert.equal(await sold(), 0);
  assert.equal((await call('POST', `/cotas/${id}/cancelar`, {}, state.a.jar)).status, 409, 'cancelar de novo é recusado');
});

test('cota paga: o cliente pede, o administrador aprova em carteira e o estoque volta', async () => {
  const id = await reserve(state.a);
  assert.equal((await call('POST', `/cotas/${id}/pedido-cancelamento`, {}, state.a.jar)).status, 409, 'sem pagar, usa "Cancelar compra"');
  await payManually(id);
  const card = await mine(state.a, id);
  assert.equal(card.status, 'paga');
  assert.deepEqual([card.cancelamento.tipo, card.cancelamento.pode], ['pedido', true]);
  assert.equal((await call('POST', `/cotas/${id}/cancelar`, {}, state.a.jar)).status, 409, 'cota paga não cancela direto');
  assert.equal((await call('POST', `/cotas/${id}/pedido-cancelamento`, { motivo: 'comprei por engano' }, state.b.jar)).status, 404);
  ok(await call('POST', `/cotas/${id}/pedido-cancelamento`, { motivo: 'comprei por engano' }, state.a.jar), 'pedir');
  assert.equal((await call('POST', `/cotas/${id}/pedido-cancelamento`, {}, state.a.jar)).status, 409, 'só um pedido por vez');
  assert.equal((await mine(state.a, id)).cancelamento.pedido.status, 'pendente');

  const list = (await call('GET', '/admin/pedidos-cancelamento?status=pendente')).data;
  const request = list.items.find((item) => item.cotaId === id);
  assert.ok(request && list.abertos >= 1, 'pedido aparece para o administrador');
  assert.equal(request.motivo, 'comprei por engano');
  assert.equal((await call('POST', `/admin/pedidos-cancelamento/${request.id}/aprovar`, { devolucao: 'carteira' }, state.a.jar)).status, 403, 'cliente não aprova');

  const before = await balance(state.a);
  ok(await call('POST', `/admin/pedidos-cancelamento/${request.id}/aprovar`, { devolucao: 'carteira', resposta: 'Sem problemas' }), 'aprovar');
  const after = await mine(state.a, id);
  assert.equal(after.status, 'estornada');
  assert.equal(after.cancelamento.pedido.status, 'aprovado');
  assert.equal(after.cancelamento.pedido.devolucao, 'carteira');
  assert.equal(await balance(state.a), before + Math.round(Number(after.valorTotal) * 100), 'valor pago voltou para a carteira');
  assert.equal(await sold(), 0, 'estoque voltou');
  assert.equal((await call('POST', `/admin/pedidos-cancelamento/${request.id}/aprovar`, { devolucao: 'carteira' })).status, 409, 'não aprova duas vezes');
  assert.equal(await balance(state.a), before + Math.round(Number(after.valorTotal) * 100), 'sem crédito em dobro');
});

test('pedido recusado mantém a cota paga e mostra a resposta ao cliente', async () => {
  const id = await reserve(state.b);
  await payManually(id);
  ok(await call('POST', `/cotas/${id}/pedido-cancelamento`, {}, state.b.jar), 'pedir');
  const request = (await call('GET', '/admin/pedidos-cancelamento?status=pendente')).data.items.find((item) => item.cotaId === id);
  assert.equal((await call('POST', `/admin/pedidos-cancelamento/${request.id}/recusar`, { resposta: 'x' })).status, 400, 'recusa pede um motivo');
  ok(await call('POST', `/admin/pedidos-cancelamento/${request.id}/recusar`, { resposta: 'O sorteio é amanhã e a aposta já foi feita.' }), 'recusar');
  const card = await mine(state.b, id);
  assert.equal(card.status, 'paga');
  assert.equal(card.cancelamento.pedido.status, 'recusado');
  assert.match(card.cancelamento.pedido.resposta, /sorteio/);
  // pode pedir de novo; e retirar o pedido
  ok(await call('POST', `/cotas/${id}/pedido-cancelamento`, {}, state.b.jar), 'pedir de novo');
  ok(await call('DELETE', `/cotas/${id}/pedido-cancelamento`, undefined, state.b.jar), 'retirar');
  assert.equal((await mine(state.b, id)).cancelamento.pedido.status, 'retirado');
  assert.equal((await call('DELETE', `/cotas/${id}/pedido-cancelamento`, undefined, state.b.jar)).status, 404);
});

test('administrador estorna cota paga sem pedido, devolvendo por Pix (só registro)', async () => {
  const id = await reserve(state.b);
  await payManually(id);
  const before = await balance(state.b);
  ok(await call('POST', `/admin/cotas/${id}/estornar`, { devolucao: 'pix' }), 'estornar');
  assert.equal((await mine(state.b, id)).status, 'estornada');
  assert.equal(await balance(state.b), before, 'Pix não mexe na carteira');
  assert.equal((await call('POST', `/admin/cotas/${id}/estornar`, { devolucao: 'pix' })).status, 409, 'já estornada');
});
