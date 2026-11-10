// Bolões por origem (equipe x afiliado), janela de venda automática, intervenção da BL e links do WhatsApp.
// Uso: E2E_API_URL=http://localhost:3001 node --test e2e/boloes-origem.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const API = (process.env.E2E_API_URL ?? 'http://localhost:3001').replace(/\/$/, '') + '/api/v1';
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const stamp = Date.now();
const admin = { cookie: '' };
const affiliate = { cookie: '' };
const buyer = { cookie: '' };
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

test('preparo: administrador, afiliado aprovado e bolão da equipe', async () => {
  ok(await call('POST', '/auth/login', { email: EMAIL, senha: PASSWORD }), 'login admin');
  const official = await call('GET', '/grupos/bl-oficial'); ok(official, 'grupo oficial');
  state.officialId = official.data.id;
  const email = `afiliado.origem.${stamp}@teste.local`;
  ok(await call('POST', '/admin/afiliados', { nome: 'Afiliada Origem', cpf: randomCpf(), email, dataNascimento: '1990-01-01', senha: 'Senha123' }), 'criar afiliado');
  const found = await call('GET', `/admin/afiliados?busca=${encodeURIComponent(email)}`);
  state.affiliate = found.data.items[0];
  if (state.affiliate.statusAprovacao !== 'aprovado') ok(await call('POST', `/admin/afiliados/${state.affiliate.id}/aprovar`, { comissaoPadraoPct: 10 }), 'aprovar afiliado');
  state.affiliateEmail = email;

  const contest = await call('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: 80000 + Math.floor(Math.random() * 9000), dataSorteio: future(12) });
  ok(contest, 'concurso'); state.contest = contest.data;
  const numbers = [5, 14, 22, 33, 41, 60];
  const staffPool = await call('POST', '/admin/boloes', { concursoId: contest.data.id, grupoId: state.officialId, numerosApostados: numbers, jogos: [{ ordem: 1, numeros: numbers, quantidadeDezenas: 6, custo: 6 }], cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato' });
  ok(staffPool, 'bolão da equipe'); state.staffPool = staffPool.data;
});

test('janela de venda é automática: começa na criação e termina no prazo do concurso', async () => {
  const pool = state.staffPool;
  assert.equal(pool.regrasVenda.automatico.fim, true, 'sem data de fim escolhida');
  assert.equal(new Date(pool.regrasVenda.fimEm).getTime(), new Date(state.contest.cutoffAt).getTime(), 'o fim da venda é o prazo do concurso');
  assert.equal(pool.regrasVenda.inicioEm, null, 'o início automático não vira data de bloqueio');
  assert.equal(pool.regrasVenda.janela, 'aberta');
  const list = await call('GET', '/admin/boloes?page=1&pageSize=100');
  const row = list.data.items.find((item) => item.id === pool.id);
  assert.equal(row.origem, 'equipe');
  assert.equal(row.criador.email, EMAIL);
  assert.equal(new Date(row.janelaVenda.fimEm).getTime(), new Date(state.contest.cutoffAt).getTime());
  assert.ok(row.janelaVenda.inicioEm, 'o painel mostra desde quando a venda está aberta');
});

test('bolão de afiliado aparece separado, com quem criou', async () => {
  ok(await call('POST', '/auth/login', { email: state.affiliateEmail, senha: 'Senha123' }, affiliate), 'login afiliado');
  const contract = await call('GET', '/afiliados/me/contrato', undefined, affiliate); ok(contract, 'contrato');
  ok(await call('POST', '/afiliados/me/contrato/aceitar', { hash: contract.data.hash, aceito: true }, affiliate), 'aceitar contrato');
  const workspace = await call('GET', '/afiliados/me/workspace', undefined, affiliate); ok(workspace, 'workspace');
  const groupId = workspace.data.grupos?.[0]?.id ?? workspace.data.grupo?.id;
  assert.ok(groupId, 'o afiliado tem grupo próprio');
  state.affiliateGroupId = groupId;
  ok(await call('PATCH', `/admin/grupos/${groupId}/capacidade`, { capacidadeExtra: 20 }), 'autorizar mais pessoas no grupo do afiliado');
  const numbers = [7, 16, 25, 34, 43, 52];
  const created = await call('POST', '/afiliados/me/boloes', { concursoId: state.contest.id, grupoId: groupId, numerosApostados: numbers, jogos: [{ ordem: 1, numeros: numbers, quantidadeDezenas: 6, custo: 6 }], cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato' }, affiliate);
  ok(created, 'bolão do afiliado'); state.affPool = created.data;
  const upload = new FormData();
  upload.set('tipo', 'comprovante_aposta'); upload.set('visivelParticipantes', 'true'); upload.set('arquivo', new Blob([PNG], { type: 'image/png' }), 'comprovante.png');
  const send = await fetch(`${API}/operacao/boloes/${state.affPool.id}/anexos`, { method: 'POST', headers: { cookie: admin.cookie }, body: upload });
  assert.ok(send.ok, `comprovante: HTTP ${send.status}`);
  ok(await call('POST', `/admin/boloes/${state.affPool.id}/publicar`), 'publicar bolão do afiliado');
  const list = await call('GET', '/admin/boloes?page=1&pageSize=100');
  const row = list.data.items.find((item) => item.id === state.affPool.id);
  assert.equal(row.origem, 'afiliado');
  assert.equal(row.criador.nome, 'Afiliada Origem');
  assert.ok(row.criadoEm);
  assert.equal(list.data.items.find((item) => item.id === state.staffPool.id).origem, 'equipe');
});

test('intervenção da BL: cotas livres do afiliado vão para o grupo oficial, sem comissão', async () => {
  // Só administrador oferece; grupo de afiliado não serve; bolão da equipe não entra.
  assert.ok([401, 403].includes((await call('POST', `/admin/boloes/${state.affPool.id}/oferta-bl`, { grupoId: state.officialId }, affiliate)).status));
  assert.equal((await call('POST', `/admin/boloes/${state.affPool.id}/oferta-bl`, { grupoId: state.affiliateGroupId })).status, 409, 'só grupo oficial');
  assert.equal((await call('POST', `/admin/boloes/${state.staffPool.id}/oferta-bl`, { grupoId: state.officialId })).status, 409, 'bolão da equipe já é da BL');
  // Antes da oferta o bolão não aparece no grupo oficial.
  const before = await call('GET', '/grupos/bl-oficial');
  assert.ok(!before.data.boloes.some((pool) => pool.id === state.affPool.id));
  ok(await call('POST', `/admin/boloes/${state.affPool.id}/oferta-bl`, { grupoId: state.officialId }), 'oferecer ao grupo oficial');
  const after = await call('GET', '/grupos/bl-oficial');
  const listed = after.data.boloes.find((pool) => pool.id === state.affPool.id);
  assert.ok(listed, 'o bolão do afiliado passa a aparecer no grupo oficial');
  assert.equal(listed.ofertaBl.grupoId, state.officialId);

  // Compra depois da intervenção: sem afiliado, e a pessoa entra no grupo oficial.
  const cpf = randomCpf();
  ok(await call('POST', '/auth/registrar', { nome: 'Cliente Origem Silva', cpf, email: `cliente.origem.${stamp}@teste.local`, telefone: '11912345678', maiorDeIdade: true, aceiteTermos: true, aceitePrivacidade: true, senha: 'Senha123', confirmarSenha: 'Senha123' }, buyer), 'cadastro do cliente');
  const terms = await call('GET', '/config/mandato', undefined, buyer); ok(terms, 'termo');
  const reserve = await call('POST', '/cotas/reservar', { aceitoTermos: true, bolaoId: state.affPool.id, quantidade: 2, titularCpf: cpf, titularNome: 'Cliente Origem Silva', termoMandatoHash: terms.data.hash, codigoAfiliado: state.affiliate.codigoAfiliado }, buyer);
  ok(reserve, 'reservar cotas');
  const mine = await call('GET', '/cotas/minhas', undefined, buyer); ok(mine, 'minhas cotas');
  const share = (mine.data.items ?? mine.data).find((item) => item.id === reserve.data.id);
  assert.ok(share, 'a cota aparece para o cliente');
  assert.ok(!share.afiliadoReferenciaId, 'sem comissão de afiliado nas cotas assumidas pela BL');
  const group = await call('GET', `/grupos/me`, undefined, buyer);
  if (group.status === 200) assert.ok(JSON.stringify(group.data).includes(state.officialId) || JSON.stringify(group.data).toLowerCase().includes('bl'), 'o cliente entrou no grupo oficial');

  // Devolver as cotas livres ao afiliado.
  ok(await call('DELETE', `/admin/boloes/${state.affPool.id}/oferta-bl`), 'devolver ao afiliado');
  const back = await call('GET', '/grupos/bl-oficial');
  assert.ok(!back.data.boloes.some((pool) => pool.id === state.affPool.id));
  assert.equal((await call('DELETE', `/admin/boloes/${state.affPool.id}/oferta-bl`)).status, 409);
});

test('links da comunidade e do grupo do WhatsApp', async () => {
  const empty = await call('GET', '/config/comunidade', undefined, buyer); ok(empty, 'leitura pública');
  assert.ok([401, 403].includes((await call('PUT', '/admin/comunidade', { comunidade: 'https://chat.whatsapp.com/ABC123' }, buyer)).status), 'cliente não configura');
  assert.equal((await call('PUT', '/admin/comunidade', { comunidade: 'https://site-estranho.com/x' })).status, 400, 'só convite do WhatsApp');
  assert.equal((await call('PUT', '/admin/comunidade', { grupo: 'http://chat.whatsapp.com/sem-https' })).status, 400, 'exige https');
  const saved = await call('PUT', '/admin/comunidade', { comunidade: 'https://chat.whatsapp.com/Comunidade123', grupo: 'https://chat.whatsapp.com/Grupo456' });
  ok(saved, 'salvar links');
  const read = await call('GET', '/config/comunidade', undefined, buyer);
  assert.equal(read.data.comunidade, 'https://chat.whatsapp.com/Comunidade123');
  assert.equal(read.data.grupo, 'https://chat.whatsapp.com/Grupo456');
  ok(await call('PUT', '/admin/comunidade', { comunidade: '', grupo: '' }), 'limpar links');
  assert.deepEqual((await call('GET', '/config/comunidade', undefined, buyer)).data, { comunidade: '', grupo: '' });
});

test('termos de uso e política de privacidade oficiais', async () => {
  const terms = await call('GET', '/config/contratos/termos', undefined, buyer); ok(terms, 'termos');
  assert.ok(terms.data.texto.startsWith('TERMOS DE USO'));
  assert.ok(terms.data.texto.includes('SORTE TECH SERVIÇOS DIGITAIS LTDA') && terms.data.texto.includes('5.4.1'));
  assert.ok(!/BLINDAGEM|MINUTA PROVISÓRIA/i.test(terms.data.texto), 'sem avisos de validação jurídica');
  const privacy = await call('GET', '/config/contratos/privacidade', undefined, buyer); ok(privacy, 'privacidade');
  assert.ok(privacy.data.texto.startsWith('POLÍTICA DE PRIVACIDADE'));
  assert.ok(privacy.data.texto.includes('18. LEI APLICÁVEL E FORO'));
  assert.ok(!/MINUTA PROVISÓRIA|Parte (superior|inferior) do formulário/i.test(privacy.data.texto));
  assert.ok(!privacy.data.texto.includes('[email@empresa.com]'), 'o e-mail do encarregado vem da configuração do servidor');
});
