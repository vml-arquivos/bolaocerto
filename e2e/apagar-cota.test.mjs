// Superadmin apaga venda de teste: cota paga some, o estoque do bolão volta e o pagamento é apagado.
import test from 'node:test';
import assert from 'node:assert/strict';

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local', senha: process.env.E2E_ADMIN_PASSWORD ?? 'Senha123' };
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let cookie = '';

async function call(method, path, body) {
  const response = await fetch(`${API}/api/v1${path}`, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((item) => item.split(';')[0]).join('; ');
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}

test('superadmin apaga cota paga de teste', async () => {
  const login = await call('POST', '/auth/login', ADMIN);
  assert.equal(login.status, 201);
  const me = (await call('GET', '/auth/me')).data;
  const group = (await call('GET', '/grupos/bl-oficial')).data;
  const number = 60000 + Math.floor(Math.random() * 9000);
  const contest = (await call('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: number, dataSorteio: future(25) })).data;
  const numbers = [4, 13, 25, 37, 48, 59];
  const created = await call('POST', '/admin/boloes', { concursoId: contest.id, grupoId: group.id, numerosApostados: numbers, jogos: [{ ordem: 1, numeros: numbers, quantidadeDezenas: 6, custo: 6 }], cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato' });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const pool = created.data;
  const form = new FormData();
  form.set('tipo', 'comprovante_aposta'); form.set('visivelParticipantes', 'true');
  form.set('arquivo', new Blob([PNG], { type: 'image/png' }), 'comprovante.png');
  const upload = await fetch(`${API}/api/v1/operacao/boloes/${pool.id}/anexos`, { method: 'POST', headers: { cookie }, body: form });
  assert.ok(upload.ok, `comprovante: HTTP ${upload.status}`);
  assert.equal((await call('POST', `/admin/boloes/${pool.id}/publicar`)).status, 201);
  const terms = (await call('GET', '/config/mandato')).data;
  const sale = await call('POST', '/admin/cotas/venda-manual', { bolaoId: pool.id, usuarioId: me.id, quantidade: 2, pago: true, forma: 'pix_direto', termoMandatoHash: terms.hash, aceiteTermoConfirmado: true });
  assert.ok([200, 201].includes(sale.status), JSON.stringify(sale.data));
  const shareId = sale.data.cota?.id ?? sale.data.id ?? sale.data.cotaId;
  assert.ok(shareId, `venda sem id: ${JSON.stringify(sale.data).slice(0, 200)}`);

  const poolOf = async () => (await call('GET', `/admin/boloes?pageSize=100&busca=${pool.id}`)).data.items.find((item) => item.id === pool.id);
  assert.equal((await poolOf())?.cotasVendidas, 2);

  const normal = await call('DELETE', `/admin/cotas/${shareId}`);
  assert.equal(normal.status, 409, 'o botão antigo continua recusando cota paga');

  const removed = await call('DELETE', `/admin/cotas/${shareId}/definitivo`);
  assert.equal(removed.status, 200, JSON.stringify(removed.data));
  assert.equal(removed.data.excluida, true);
  assert.equal(removed.data.estoqueDevolvido, 2);

  const list = (await call('GET', `/admin/cotas?pageSize=100&busca=`)).data.items;
  assert.ok(!list.some((item) => item.id === shareId), 'a cota não aparece mais');
  assert.equal((await poolOf())?.cotasVendidas, 0, 'estoque voltou');
  assert.equal((await call('DELETE', `/admin/cotas/${shareId}/definitivo`)).status, 404);
});
