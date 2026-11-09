// Link de cadastro da equipe: o administrador gera o link e a pessoa faz o próprio cadastro já com o papel certo.
// Precisa da API no ar com ADMIN_BOOTSTRAP_EMAIL = E2E_ADMIN_EMAIL (o administrador principal).
import test from 'node:test';
import assert from 'node:assert/strict';

const API = (process.env.E2E_API_URL ?? 'http://localhost:3001').replace(/\/$/, '') + '/api/v1';
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';

const admin = { cookie: '' };
async function call(method, path, body, jar = admin) {
  const response = await fetch(API + path, { method, headers: { cookie: jar.cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) jar.cookie = set.map((item) => item.split(';')[0]).join('; ');
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
const ok = (result, label) => assert.ok(result.status >= 200 && result.status < 300, `${label}: HTTP ${result.status} ${JSON.stringify(result.data).slice(0, 300)}`);
function randomCpf() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digit = (list) => { const sum = list.reduce((total, value, index) => total + value * (list.length + 1 - index), 0); const rest = (sum * 10) % 11; return rest === 10 ? 0 : rest; };
  const first = digit(base); return [...base, first, digit([...base, first])].join('');
}
const person = (email) => ({ nome: 'Pessoa Equipe', cpf: randomCpf(), email, telefone: '11912345678', maiorDeIdade: true, aceiteTermos: true, aceitePrivacidade: true, senha: 'Senha123', confirmarSenha: 'Senha123' });

test('link de operação: a pessoa se cadastra sozinha e entra como operação; o link vale uma vez', async () => {
  ok(await call('POST', '/auth/login', { email: EMAIL, senha: PASSWORD }), 'login admin');
  const invite = await call('POST', '/admin/convites', { tipo: 'operacao' }); ok(invite, 'gerar link');
  assert.match(invite.data.codigo, /^OP-/);
  const info = await call('GET', `/auth/convite/${invite.data.codigo}`);
  assert.equal(info.data.tipo, 'equipe'); assert.equal(info.data.papel, 'operacao');

  const newbie = { cookie: '' };
  const email = `operacao.${Date.now()}@teste.local`;
  const signup = await call('POST', '/auth/registrar', { ...person(email), codigoAfiliado: invite.data.codigo }, newbie); ok(signup, 'cadastro pelo link');
  const me = await call('GET', '/auth/me', undefined, newbie); ok(me, 'me');
  assert.equal(me.data.papel, 'operacao');
  assert.equal(me.data.superadmin, false);

  const again = await call('POST', '/auth/registrar', { ...person(`outro.${Date.now()}@teste.local`), codigoAfiliado: invite.data.codigo }, { cookie: '' });
  assert.ok(again.status >= 400, 'o link já usado não pode cadastrar outra pessoa');
  const list = await call('GET', '/admin/convites?tipo=operacao');
  assert.equal(list.data.items.find((item) => item.id === invite.data.id)?.status, 'usado');
});

test('a equipe de operação não gera link de cadastro', async () => {
  const jar = { cookie: '' };
  const email = `operacao2.${Date.now()}@teste.local`;
  const invite = await call('POST', '/admin/convites', { tipo: 'operacao' }); ok(invite, 'gerar link');
  ok(await call('POST', '/auth/registrar', { ...person(email), codigoAfiliado: invite.data.codigo }, jar), 'cadastro');
  const denied = await call('POST', '/admin/convites', { tipo: 'operacao' }, jar);
  assert.ok([401, 403].includes(denied.status), `HTTP ${denied.status}`);
});

test('link de administrador: exige e-mail e só funciona para ele', async () => {
  const noEmail = await call('POST', '/admin/convites', { tipo: 'admin' });
  assert.ok(noEmail.status >= 400, 'sem e-mail não pode');
  const email = `admin.novo.${Date.now()}@teste.local`;
  const invite = await call('POST', '/admin/convites', { tipo: 'admin', emailDestino: email }); ok(invite, 'gerar link de administrador');
  const wrong = await call('POST', '/auth/registrar', { ...person(`intruso.${Date.now()}@teste.local`), codigoAfiliado: invite.data.codigo }, { cookie: '' });
  assert.ok(wrong.status >= 400, 'outro e-mail não pode usar');
  const jar = { cookie: '' };
  ok(await call('POST', '/auth/registrar', { ...person(email), codigoAfiliado: invite.data.codigo }, jar), 'cadastro do administrador');
  const me = await call('GET', '/auth/me', undefined, jar); ok(me, 'me');
  assert.equal(me.data.papel, 'admin');
  assert.equal(me.data.superadmin, false, 'o novo administrador não é o principal');
  // Administrador comum não gera link de administrador nem vê Conexões.
  const denied = await call('POST', '/admin/convites', { tipo: 'admin', emailDestino: 'x@teste.local' }, jar);
  assert.equal(denied.status, 403);
  assert.equal((await call('GET', '/admin/conexoes', undefined, jar)).status, 403);
});

test('link cancelado não cadastra ninguém', async () => {
  const invite = await call('POST', '/admin/convites', { tipo: 'operacao' }); ok(invite, 'gerar link');
  ok(await call('POST', `/admin/convites/${invite.data.id}/revogar`), 'cancelar');
  const info = await call('GET', `/auth/convite/${invite.data.codigo}`);
  assert.equal(info.data.valido, false);
  const signup = await call('POST', '/auth/registrar', { ...person(`cancelado.${Date.now()}@teste.local`), codigoAfiliado: invite.data.codigo }, { cookie: '' });
  assert.ok(signup.status >= 400, 'link cancelado não pode cadastrar');
});
