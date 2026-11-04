// Fluxo de negócio completo contra uma API de verdade (banco real).
// Uso: E2E_API_URL=http://localhost:3001 E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... node --test e2e/api-flow.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const API = (process.env.E2E_API_URL ?? 'http://localhost:3001').replace(/\/$/, '') + '/api/v1';
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';

const admin = { cookie: '' };
const state = {};

async function call(method, path, body, extra = {}, jar = admin) {
  const headers = { cookie: jar.cookie, ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...extra };
  const response = await fetch(API + path, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) jar.cookie = set.map((item) => item.split(';')[0]).join('; ');
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
const ok = (result, label) => assert.ok(result.status >= 200 && result.status < 300, `${label}: HTTP ${result.status} ${JSON.stringify(result.data).slice(0, 300)}`);

// PNG mínimo válido (1x1) para servir de comprovante.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

test('entra como administrador', async () => {
  const login = await call('POST', '/auth/login', { email: EMAIL, senha: PASSWORD });
  ok(login, 'login');
  const me = await call('GET', '/auth/me');
  ok(me, 'me');
  assert.equal(me.data.papel, 'admin');
});

test('cria concurso e bolão em rascunho', async () => {
  const group = await call('GET', '/grupos/bl-oficial');
  ok(group, 'grupo oficial');
  state.groupId = group.data.id;
  const number = 70000 + Math.floor(Math.random() * 20000);
  const contest = await call('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: number, dataSorteio: future(12) });
  ok(contest, 'concurso manual');
  state.contestId = contest.data.id;
  const numbers = [4, 11, 23, 35, 48, 59];
  const pool = await call('POST', '/admin/boloes', {
    concursoId: state.contestId, grupoId: state.groupId, numerosApostados: numbers,
    jogos: [{ ordem: 1, numeros: numbers, quantidadeDezenas: 6, custo: 6 }],
    cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato',
  });
  ok(pool, 'criar bolão');
  state.poolId = pool.data.id;
  assert.equal(pool.data.status, 'rascunho');
});

test('guarda os jogos no banco de números e não duplica', async () => {
  const used = await call('POST', '/admin/numeros/usar', { modalidade: 'megasena', jogos: [{ numeros: [4, 11, 23, 35, 48, 59] }], bolaoId: state.poolId });
  ok(used, 'usar números');
  const again = await call('POST', '/admin/numeros/usar', { modalidade: 'megasena', jogos: [{ numeros: [59, 48, 35, 23, 11, 4] }], bolaoId: state.poolId });
  ok(again, 'usar números de novo');
  const list = await call('GET', '/admin/numeros?modalidade=megasena&busca=59');
  ok(list, 'listar banco');
  const same = list.data.items.filter((item) => item.numeros.join(',') === '4,11,23,35,48,59');
  assert.equal(same.length, 1, 'o mesmo jogo não pode aparecer duas vezes');
  assert.ok(same[0].usos >= 1, 'o uso precisa ser contado');
});

test('digita e gera jogos no banco de números', async () => {
  const typed = await call('POST', '/admin/numeros', { modalidade: 'megasena', jogos: '1 2 3 4 5 6\n7, 8, 9, 10, 11, 12', rotulo: 'teste e2e' });
  ok(typed, 'digitar jogos');
  const generated = await call('POST', '/admin/numeros/gerar', { modalidade: 'megasena', quantidade: 3, dezenas: 7, estrategia: 'aleatorio', salvar: true, rotulo: 'gerado e2e' });
  ok(generated, 'gerar jogos');
  assert.equal(generated.data.quantidade, 3);
});

test('não publica sem comprovante e publica depois de enviar o arquivo', async () => {
  const early = await call('POST', `/admin/boloes/${state.poolId}/publicar`);
  assert.ok(early.status >= 400 && early.status < 500, `publicar sem comprovante deveria ser recusado (veio ${early.status})`);

  const form = new FormData();
  form.set('tipo', 'comprovante_aposta');
  form.set('visivelParticipantes', 'true');
  form.set('arquivo', new Blob([PNG], { type: 'image/png' }), 'comprovante.png');
  const upload = await call('POST', `/operacao/boloes/${state.poolId}/anexos`, form);
  ok(upload, 'enviar comprovante');

  const queue = await call('GET', '/admin/operacao');
  ok(queue, 'fila de operação');
  const item = (Array.isArray(queue.data) ? queue.data : queue.data.items).find((row) => row.id === state.poolId);
  assert.ok(item, 'o rascunho precisa aparecer na fila de comprovantes');
  assert.equal(item.arquivos, 1);

  const publish = await call('POST', `/admin/boloes/${state.poolId}/publicar`);
  ok(publish, 'publicar');
  const page = await call('GET', `/boloes/${state.poolId}`);
  ok(page, 'página pública do bolão');
  assert.equal(page.data.status, 'aberto');
});

test('salva a página inicial (sem erro interno) e ela aparece no site', async () => {
  const current = await call('GET', '/admin/home');
  ok(current, 'ler página inicial');
  const config = current.data.config ?? current.data;
  const saved = await call('PUT', '/admin/home', {
    slides: [{ id: 'e2e-slide', tipo: 'livre', ativo: true, titulo: 'Teste e2e', etiqueta: 'Novo', subtitulo: 'Texto', botao: 'Ver', link: '/boloes' }],
    destaques: [state.poolId],
    secoes: { numeros: true, modalidades: true, resultados: true, sorteados: true, encerrados: true, concursos: true, comoFunciona: true, duvidas: true, ...(config.secoes ?? {}) },
  });
  ok(saved, 'salvar página inicial');
  const publicConfig = await call('GET', '/home/config');
  ok(publicConfig, 'config pública');
  assert.ok(JSON.stringify(publicConfig.data).includes('Teste e2e'));
});

test('conciliação financeira soma no banco e responde', async () => {
  const result = await call('GET', '/admin/financeiro/conciliacao');
  ok(result, 'conciliação');
  for (const key of ['valorArrecadado', 'taxaAdministracao', 'custoBilhetes', 'comissoes']) assert.match(String(result.data[key]), /^\d+\.\d{2}$/);
});

test('rotas públicas respondem sem erro interno', async () => {
  for (const path of ['/health', '/concursos', '/boloes', '/boloes/disponiveis', '/resultados/ultimos', '/estatisticas', '/loterias/precos']) {
    const result = await call('GET', path);
    assert.ok(result.status < 500, `${path}: HTTP ${result.status}`);
  }
});

test('análise estatística pública tem limite de acessos', async () => {
  let blocked = 0;
  for (let index = 0; index < 40; index += 1) {
    // IP próprio (via cabeçalho do proxy) para não bloquear os outros testes que usam a mesma máquina.
    const result = await call('GET', '/estatisticas/megasena/sugestoes?jogos=1&dezenas=6', undefined, { 'x-forwarded-for': '203.0.113.77' });
    if (result.status === 429) blocked += 1;
  }
  assert.ok(blocked > 0, 'depois de 30 chamadas no mesmo minuto o limite precisa agir');
});

/** CPF válido aleatório (a API confere os dígitos). */
function randomCpf() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digit = (list) => { const sum = list.reduce((total, value, index) => total + value * (list.length + 1 - index), 0); const rest = (sum * 10) % 11; return rest === 10 ? 0 : rest; };
  const first = digit(base); const second = digit([...base, first]);
  return [...base, first, second].join('');
}

test('afiliado: cadastro pelo admin, aprovação, painel e comissões', async () => {
  const stamp = Date.now();
  const email = `afiliado.${stamp}@teste.local`;
  const created = await call('POST', '/admin/afiliados', { nome: 'Afiliado Teste', cpf: randomCpf(), email, dataNascimento: '1990-05-10', senha: 'Senha123' });
  ok(created, 'criar afiliado');

  const list = await call('GET', `/admin/afiliados?busca=${encodeURIComponent(email)}`);
  ok(list, 'listar afiliados');
  const row = list.data.items.find((item) => item.usuario?.email === email);
  assert.ok(row, 'o afiliado novo precisa aparecer na lista do admin');
  assert.equal(row.indicadores.pendente, '0.00');
  if (row.statusAprovacao !== 'aprovado') ok(await call('POST', `/admin/afiliados/${row.id}/aprovar`, { comissaoPadraoPct: 10 }), 'aprovar afiliado');

  const mine = { cookie: '' };
  ok(await call('POST', '/auth/login', { email, senha: 'Senha123' }, {}, mine), 'login do afiliado');
  const dashboard = await call('GET', '/afiliados/me/dashboard', undefined, {}, mine);
  ok(dashboard, 'painel do afiliado');
  assert.equal(dashboard.data.comissaoPendente, '0.00');
  assert.equal(dashboard.data.totalComissoes, 0);
  const commissions = await call('GET', '/afiliados/me/comissoes', undefined, {}, mine);
  ok(commissions, 'comissões do afiliado');
  assert.deepEqual(commissions.data, []);
  const workspace = await call('GET', '/afiliados/me/workspace', undefined, {}, mine);
  assert.ok(workspace.status < 500, `workspace do afiliado: HTTP ${workspace.status}`);
  const adminOnly = await call('GET', '/admin/usuarios', undefined, {}, mine);
  assert.ok([401, 403].includes(adminOnly.status), 'afiliado não pode abrir telas de administrador');
});

test('telas administrativas com dados reais respondem sem erro interno', async () => {
  for (const path of ['/admin/dashboard', '/admin/concursos?status=aberto', '/admin/boloes', '/admin/cotas', '/admin/recebimentos', '/admin/afiliados', '/admin/comissoes', '/admin/repasses', '/admin/usuarios', '/admin/grupos', '/admin/convites', '/admin/operacao', '/admin/lotericas', '/admin/auditoria', '/admin/numeros', '/admin/crm/resumo']) {
    const result = await call('GET', path);
    assert.ok(result.status < 500, `${path}: HTTP ${result.status} ${JSON.stringify(result.data).slice(0, 200)}`);
  }
});
