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

test('publica sem o registro da lotérica e anexa o comprovante depois, dentro do bolão', async () => {
  const publish = await call('POST', `/admin/boloes/${state.poolId}/publicar`);
  ok(publish, 'publicar sem comprovante');
  const page = await call('GET', `/boloes/${state.poolId}`);
  ok(page, 'página pública do bolão');
  assert.equal(page.data.status, 'aberto');

  const before = await call('GET', '/admin/boloes');
  ok(before, 'lista de bolões');
  const rowBefore = (Array.isArray(before.data) ? before.data : before.data.items).find((row) => row.id === state.poolId);
  assert.ok(rowBefore, 'o bolão precisa estar na lista');
  assert.equal(rowBefore.registro.registrado, false, 'ainda sem registro da lotérica');

  const form = new FormData();
  form.set('tipo', 'comprovante_aposta');
  form.set('visivelParticipantes', 'true');
  form.set('arquivo', new Blob([PNG], { type: 'image/png' }), 'comprovante.png');
  const upload = await call('POST', `/operacao/boloes/${state.poolId}/anexos`, form);
  ok(upload, 'enviar comprovante dentro do bolão');

  const after = await call('GET', '/admin/boloes');
  const rowAfter = (Array.isArray(after.data) ? after.data : after.data.items).find((row) => row.id === state.poolId);
  assert.equal(rowAfter.registro.arquivos, 1);
  assert.equal(rowAfter.registro.registrado, false, 'anexar o arquivo não muda o estado: quem marca a aposta como feita é a operação');
});

test('vários bolões no mesmo concurso: jogos de 7 e de 10 números', async () => {
  const seven = [3, 9, 14, 27, 41, 52, 60];
  const ten = [2, 8, 15, 22, 30, 37, 44, 51, 56, 59];
  const base = { concursoId: state.contestId, grupoId: state.groupId, cotasIlimitadas: false, totalCotas: 10, taxaAdministracaoPct: 10, modeloOperacional: 'mandato' };
  const a = await call('POST', '/admin/boloes', { ...base, numerosApostados: seven, jogos: [{ ordem: 1, numeros: seven, quantidadeDezenas: 7, custo: 42 }], valorCota: 8 });
  ok(a, 'bolão de 7 números');
  const b = await call('POST', '/admin/boloes', { ...base, numerosApostados: ten, jogos: [{ ordem: 1, numeros: ten, quantidadeDezenas: 10, custo: 1260 }], totalCotas: 20, valorCota: 70 });
  ok(b, 'bolão de 10 números');
  assert.notEqual(a.data.id, b.data.id);
  assert.notEqual(a.data.id, state.poolId);
  for (const id of [a.data.id, b.data.id]) ok(await call('POST', `/admin/boloes/${id}/publicar`), 'publicar');
  const list = await call('GET', '/admin/boloes');
  const rows = (Array.isArray(list.data) ? list.data : list.data.items).filter((row) => (row.concursoId) === state.contestId);
  assert.ok(rows.length >= 3, `deveria haver 3 bolões no mesmo concurso (veio ${rows.length})`);
  const sizes = rows.map((row) => row.jogos?.[0]?.quantidadeDezenas ?? row.numerosApostados?.length).filter(Boolean).sort((x, y) => x - y);
  assert.deepEqual(sizes, [6, 7, 10]);
});

test('preço livre: cota de R$ 20 com registro de R$ 60 em 100 cotas, taxa de serviço calculada', async () => {
  const numbers = [5, 10, 20, 30, 40, 50];
  const manual = await call('POST', '/admin/boloes', {
    concursoId: state.contestId, grupoId: state.groupId, numerosApostados: numbers,
    jogos: [{ ordem: 1, numeros: numbers, quantidadeDezenas: 6, custo: 60 }],
    cotasIlimitadas: false, totalCotas: 100, valorCota: 20, taxaAdministracaoPct: 97, modeloOperacional: 'mandato',
    precoLivre: true, precificacaoAutomatica: false, custoRegistroCentavos: 6000, totalCotadoCentavos: 200000,
  });
  ok(manual, 'criar bolão com preço livre');
  assert.equal(manual.data.precificacao.modo, 'livre');
  assert.equal(manual.data.precificacao.ticketPerShare, 60);
  assert.equal(manual.data.precificacao.feePerShare, 1940);
  const jogos = Array.from({ length: 10 }, (_, i) => ({ ordem: i + 1, numeros: [1 + i, 12, 23, 34, 45, 56], quantidadeDezenas: 6 }));
  const auto = await call('POST', '/admin/boloes', {
    concursoId: state.contestId, grupoId: state.groupId, numerosApostados: jogos[0].numeros, jogos,
    cotasIlimitadas: false, totalCotas: 100, valorCota: 20, taxaAdministracaoPct: 97, modeloOperacional: 'mandato',
    precoLivre: true, precificacaoAutomatica: true, totalCotadoCentavos: 200000,
  });
  ok(auto, 'criar bolão com preço livre pela tabela da CAIXA');
  assert.equal(auto.data.precificacao.costCents, 6000, '10 jogos de 6 números = R$ 60,00 de registro');
  const tooLow = await call('POST', '/admin/boloes', {
    concursoId: state.contestId, grupoId: state.groupId, numerosApostados: numbers, jogos: [{ ordem: 1, numeros: numbers, quantidadeDezenas: 6, custo: 60 }],
    cotasIlimitadas: false, totalCotas: 100, valorCota: 0.5, taxaAdministracaoPct: 0, modeloOperacional: 'mandato', precoLivre: true, precificacaoAutomatica: false, custoRegistroCentavos: 6000,
  });
  assert.equal(tooLow.status, 409, 'cota menor que o registro por cota é recusada');
  const withFee = await call('POST', '/admin/boloes', {
    concursoId: state.contestId, grupoId: state.groupId, numerosApostados: numbers, jogos: [{ ordem: 1, numeros: numbers, quantidadeDezenas: 6, custo: 60 }],
    cotasIlimitadas: false, totalCotas: 100, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato',
    precoLivre: true, taxaPorCotaCentavos: 200, precificacaoAutomatica: false, custoRegistroCentavos: 6000, totalCotadoCentavos: 200000,
  });
  ok(withFee, 'criar bolão com a taxa definida (R$ 2 por cota)');
  assert.equal(withFee.data.precificacao.feePerShare, 200);
  assert.equal(withFee.data.precificacao.ticketPerShare, 1800);
  const feeTooHigh = await call('POST', '/admin/boloes', {
    concursoId: state.contestId, grupoId: state.groupId, numerosApostados: numbers, jogos: [{ ordem: 1, numeros: numbers, quantidadeDezenas: 6, custo: 60 }],
    cotasIlimitadas: false, totalCotas: 100, valorCota: 20, taxaAdministracaoPct: 99, modeloOperacional: 'mandato',
    precoLivre: true, taxaPorCotaCentavos: 1990, precificacaoAutomatica: false, custoRegistroCentavos: 6000,
  });
  assert.equal(feeTooHigh.status, 409, 'taxa que não deixa o registro de cada cota é recusada');
  const list = await call('GET', '/admin/boloes');
  const rows = (Array.isArray(list.data) ? list.data : list.data.items);
  const row = rows.find((item) => item.id === manual.data.id);
  assert.equal(Number(row.indicadores.taxaPrevista), 1940);
  assert.equal(Number(row.indicadores.receitaPrevista), 2000);
});

test('cadastro exige repetir a senha e aceitar termos, LGPD e 18 anos; o aceite fica registrado', async () => {
  const cpfDigits = () => { const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9)); const d = (len) => { const sum = n.slice(0, len).reduce((a, v, i) => a + v * (len + 1 - i), 0); const r = (sum * 10) % 11; return r === 10 ? 0 : r; }; n.push(d(9)); n.push(d(10)); return n.join(''); };
  const base = () => ({ nome: 'Pessoa Termos', cpf: cpfDigits(), email: `termos.${Date.now()}.${Math.floor(Math.random() * 1e6)}@teste.local`, telefone: '11912345678', maiorDeIdade: true, senha: 'Senha123', confirmarSenha: 'Senha123', aceiteTermos: true, aceitePrivacidade: true });
  const jar = { cookie: '' };
  assert.equal((await call('POST', '/auth/registrar', { ...base(), aceiteTermos: false }, {}, jar)).status, 400, 'sem aceitar os termos');
  assert.equal((await call('POST', '/auth/registrar', { ...base(), aceitePrivacidade: undefined }, {}, jar)).status, 400, 'sem aceitar a LGPD');
  const mismatch = await call('POST', '/auth/registrar', { ...base(), confirmarSenha: 'Outra1234' }, {}, jar);
  assert.equal(mismatch.status, 409); assert.match(JSON.stringify(mismatch.data), /senhas não são iguais/);
  const noAdult = await call('POST', '/auth/registrar', { ...base(), maiorDeIdade: false }, {}, jar);
  assert.equal(noAdult.status, 409, 'sem declarar 18 anos');
  ok(await call('POST', '/auth/registrar', base(), {}, jar), 'cadastro completo');
  const pending = await call('GET', '/conta/aceites-pendentes', null, {}, jar);
  ok(pending, 'pendências'); assert.deepEqual(pending.data.pendentes, []);
  const mine = await call('GET', '/conta/contratos', null, {}, jar);
  ok(mine, 'contratos'); assert.deepEqual(mine.data.afiliacao.map((row) => row.tipo).sort(), ['privacidade', 'termos']);
  // Conta antiga (o administrador de teste, num banco novo, nunca aceitou): fica pendente até aceitar.
  // Em banco já usado em outra rodada o aceite já existe; nesse caso só confere que não há pendência.
  const before = await call('GET', '/conta/aceites-pendentes');
  ok(before, 'pendências do admin'); assert.ok([0, 2].includes(before.data.pendentes.length));
  if (before.data.pendentes.length === 2) {
    assert.equal((await call('POST', '/conta/aceites', { termos: true, privacidade: true, maiorDeIdade: false })).status, 400);
    ok(await call('POST', '/conta/aceites', { termos: true, privacidade: true, maiorDeIdade: true }), 'aceitar');
  }
  assert.deepEqual((await call('GET', '/conta/aceites-pendentes')).data.pendentes, []);
  const doc = await call('GET', '/config/contratos/termos'); ok(doc, 'documento termos'); assert.equal(doc.data.tipo, 'termos');
});

test('senha com no mínimo 8 (sem limite de tamanho) e área Documentos do painel', async () => {
  const cpfDigits = () => { const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9)); const d = (len) => { const sum = n.slice(0, len).reduce((a, v, i) => a + v * (len + 1 - i), 0); const r = (sum * 10) % 11; return r === 10 ? 0 : r; }; n.push(d(9)); n.push(d(10)); return n.join(''); };
  const reg = (senha) => ({ nome: 'Pessoa Senha', cpf: cpfDigits(), email: `senha.${Date.now()}.${Math.floor(Math.random() * 1e6)}@teste.local`, telefone: '11912345678', maiorDeIdade: true, senha, confirmarSenha: senha, aceiteTermos: true, aceitePrivacidade: true });
  const jar = { cookie: '' };
  const short = await call('POST', '/auth/registrar', reg('Senha12'), {}, jar);
  assert.ok([400, 409].includes(short.status), `7 caracteres devem ser recusados (HTTP ${short.status})`);
  const noDigit = await call('POST', '/auth/registrar', reg('SomenteLetras'), {}, jar);
  assert.ok([400, 409].includes(noDigit.status), 'sem número deve ser recusada');
  const longPassword = 'Aa1' + 'x'.repeat(297);
  const body = reg(longPassword);
  ok(await call('POST', '/auth/registrar', body, {}, jar), 'cadastro com senha de 300 caracteres');
  const relogin = { cookie: '' };
  ok(await call('POST', '/auth/login', { email: body.email, senha: longPassword }, {}, relogin), 'entra com a senha longa');

  // Quem não é administrador não vê a área de documentos.
  assert.equal((await call('GET', '/admin/documentos', null, {}, relogin)).status, 403);

  const list = await call('GET', '/admin/documentos');
  ok(list, 'lista de documentos');
  assert.deepEqual(list.data.documentos.map((d) => d.tipo), ['termos', 'privacidade', 'participacao', 'afiliado', 'parceiro', 'funcionario']);
  assert.equal((await call('GET', '/admin/documentos/inexistente')).status, 404);
  assert.equal((await call('POST', '/admin/documentos/parceiro/publicar', { texto: 'curto', confirmo: true })).status, 400);
  assert.equal((await call('POST', '/admin/documentos/parceiro/publicar', { texto: 'x'.repeat(300) })).status, 400, 'sem confirmar a revisão');

  // Banco usado em outra rodada: começa sem texto publicado pelo painel.
  for (const kind of ['parceiro', 'termos']) await call('POST', `/admin/documentos/${kind}/voltar-ao-padrao`);

  // Contrato interno: publica, fica só no painel (não é página pública) e volta ao padrão.
  const partnerText = 'CONTRATO DE PARCERIA DEFINITIVO. ' + 'Cláusula de teste. '.repeat(20).trim();
  const published = await call('POST', '/admin/documentos/parceiro/publicar', { texto: partnerText, confirmo: true });
  ok(published, 'publicar parceiro');
  const detail = await call('GET', '/admin/documentos/parceiro');
  ok(detail, 'detalhe'); assert.equal(detail.data.origem, 'painel'); assert.equal(detail.data.texto, partnerText); assert.equal(detail.data.historico.length >= 1, true);
  assert.equal((await call('GET', '/config/contratos/parceiro')).status, 404, 'contrato de parceiro não é público');
  ok(await call('POST', '/admin/documentos/parceiro/voltar-ao-padrao'), 'voltar ao padrão');
  assert.equal((await call('GET', '/admin/documentos/parceiro')).data.origem, 'minuta');
  assert.equal((await call('POST', '/admin/documentos/parceiro/voltar-ao-padrao')).status, 400);

  // Termos de uso publicados: passa a valer na página pública e todos precisam aceitar de novo; voltar ao padrão restaura.
  const termsText = 'TERMOS DE USO DEFINITIVOS. ' + 'Cláusula de teste. '.repeat(20).trim();
  ok(await call('POST', '/admin/documentos/termos/publicar', { texto: termsText, confirmo: true }), 'publicar termos');
  assert.equal((await call('GET', '/config/contratos/termos')).data.texto, termsText);
  const pendingAfter = await call('GET', '/conta/aceites-pendentes'); ok(pendingAfter, 'pendências');
  assert.deepEqual(pendingAfter.data.pendentes.map((p) => p.tipo), ['termos'], 'quem já aceitou precisa aceitar o texto novo');
  ok(await call('POST', '/admin/documentos/termos/voltar-ao-padrao'), 'voltar termos ao padrão');
  assert.deepEqual((await call('GET', '/conta/aceites-pendentes')).data.pendentes, [], 'o aceite do texto padrão continua valendo');
});

test('funil de conversão: contagem anônima do site e relatório do painel', async () => {
  const send = (nome) => fetch(`${process.env.E2E_API_URL}/api/v1/funil/evento`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome }) });
  assert.equal((await send('visita_home')).status, 200);
  assert.equal((await send('bolao_visto')).status, 200);
  assert.equal((await send('cadastro_iniciado')).status, 200);
  assert.equal((await send('qualquer_coisa')).status, 400, 'só aceita as etapas da lista');
  const report = await call('GET', '/admin/funil');
  ok(report, 'relatório do funil');
  assert.deepEqual(report.data.etapas.map((s) => s.chave), ['visita_home', 'bolao_visto', 'cadastro_iniciado', 'cadastro_concluido', 'reserva', 'pagamento']);
  assert.ok(report.data.etapas[0].total >= 1 && report.data.etapas[1].total >= 1 && report.data.etapas[2].total >= 1);
  assert.equal((await call('GET', '/admin/funil?de=2026-12-01&ate=2026-11-01')).status, 400);
  assert.equal((await fetch(`${process.env.E2E_API_URL}/api/v1/admin/funil`)).status, 401, 'o relatório não é público');
});

test('onda 2: conferidor público, avise-me por jogo e Google desligado sem configuração', async () => {
  const anon = { cookie: '' };
  const modalities = await call('GET', '/conferidor/modalidades', undefined, {}, anon);
  ok(modalities, 'modalidades do conferidor');
  assert.equal(modalities.data.length, 7);
  assert.equal((await call('POST', '/conferidor', { modalidade: 'loteca', jogos: [[1, 2, 3]] }, {}, anon)).status, 400, 'modalidade sem dezenas é recusada');
  assert.equal((await call('POST', '/conferidor', { modalidade: 'megasena', jogos: Array.from({ length: 21 }, () => [1, 2, 3, 4, 5, 6]) }, {}, anon)).status, 400, 'no máximo 20 jogos');
  const checked = await call('POST', '/conferidor', { modalidade: 'megasena', jogos: [[1, 2, 3, 4, 5, 6], [1, 2, 3]] }, {}, anon);
  assert.ok([200, 404].includes(checked.status), `conferir: HTTP ${checked.status}`);
  if (checked.status === 200) assert.ok(checked.data.jogos[1].erro, 'jogo inválido volta com explicação, sem derrubar o outro');

  const google = await call('GET', '/auth/google/config', undefined, {}, anon);
  ok(google, 'config do Google');
  assert.equal(typeof google.data.ativo, 'boolean');
  if (!google.data.ativo) assert.equal((await call('POST', '/auth/google', { credential: 'x'.repeat(40) }, {}, anon)).status, 409, 'sem GOOGLE_CLIENT_ID o recurso fica desligado');

  assert.equal((await call('GET', '/usuarios/me/alertas-bolao', undefined, {}, anon)).status, 401, 'avise-me exige conta');
  const prefs = await call('GET', '/usuarios/me/alertas-bolao');
  ok(prefs, 'preferências de aviso');
  assert.ok(prefs.data.disponiveis.some((item) => item.modalidade === 'megasena'));
  const saved = await call('PUT', '/usuarios/me/alertas-bolao', { modalidades: ['megasena', 'megasena', 'nao-existe'] });
  ok(saved, 'salvar avisos');
  assert.deepEqual(saved.data.modalidades, ['megasena']);
  assert.deepEqual((await call('GET', '/usuarios/me/alertas-bolao')).data.modalidades, ['megasena']);
  ok(await call('PUT', '/usuarios/me/alertas-bolao', { modalidades: [] }), 'desligar avisos');

  const health = await call('GET', '/operacao/saude');
  ok(health, 'saúde');
  for (const key of ['faixasEspeciais', 'pagamentosFalhos', 'premiosSemAviso']) assert.ok(Array.isArray(health.data.pendencias[key]), key);
});

test('bolão de data festiva: abre a venda sem números e define os jogos depois', async () => {
  const noNumbers = await call('POST', '/admin/boloes', {
    concursoId: state.contestId, grupoId: state.groupId, numerosApostados: [],
    cotasIlimitadas: false, totalCotas: 50, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato',
    precoLivre: true, numerosADefinir: true, taxaPorCotaCentavos: 200, custoRegistroCentavos: 6000, vendaAntecipada: true,
  });
  ok(noNumbers, 'criar bolão com números a definir');
  assert.equal(noNumbers.data.numerosDefinidos, false);
  assert.equal(noNumbers.data.quantidadeJogos, 0);
  const published = await call('POST', `/admin/boloes/${noNumbers.data.id}/publicar`);
  ok(published, 'publicar sem números');
  const invalid = await call('POST', `/admin/boloes/${noNumbers.data.id}/numeros`, { jogos: [{ ordem: 1, numeros: [1, 2, 3, 4, 5, 61] }] });
  assert.equal(invalid.status, 409, 'número fora da regra da Mega-Sena é recusado');
  const defined = await call('POST', `/admin/boloes/${noNumbers.data.id}/numeros`, { jogos: [{ ordem: 1, numeros: [3, 14, 25, 36, 47, 58] }] });
  ok(defined, 'definir os números');
  assert.equal(defined.data.numerosDefinidos, true);
  assert.deepEqual(defined.data.jogos[0].numeros, [3, 14, 25, 36, 47, 58]);
  const again = await call('POST', `/admin/boloes/${noNumbers.data.id}/numeros`, { jogos: [{ ordem: 1, numeros: [1, 2, 3, 4, 5, 6] }] });
  assert.equal(again.status, 409, 'os números não mudam depois de definidos');
  state.festivePoolId = noNumbers.data.id;
});

test('admin exclui bolão sem venda e troca o concurso de outro', async () => {
  const numbers = [7, 17, 27, 37, 47, 57];
  const draft = await call('POST', '/admin/boloes', {
    concursoId: state.contestId, grupoId: state.groupId, numerosApostados: numbers, jogos: [{ ordem: 1, numeros: numbers, quantidadeDezenas: 6, custo: 6 }],
    cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato',
  });
  ok(draft, 'criar bolão de teste');
  const nextNumber = 90000 + Math.floor(Math.random() * 9000);
  const other = await call('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: nextNumber, dataSorteio: future(20) });
  ok(other, 'criar outro concurso');
  const moved = await call('POST', `/admin/boloes/${draft.data.id}/trocar-concurso`, { concursoId: other.data.id });
  ok(moved, 'trocar concurso');
  assert.equal(moved.data.concursoId, other.data.id);
  const wrong = await call('POST', `/admin/boloes/${draft.data.id}/trocar-concurso`, { concursoId: other.data.id });
  assert.equal(wrong.status, 409, 'já está nesse concurso');
  const preview = await call('GET', `/admin/boloes/${draft.data.id}/exclusao`);
  ok(preview, 'prévia da exclusão');
  assert.equal(preview.data.podeExcluir, true);
  const removed = await call('DELETE', `/admin/boloes/${draft.data.id}/sem-movimentacao`);
  ok(removed, 'excluir bolão sem movimentação');
  assert.equal(removed.data.excluido, true);
  const gone = await call('GET', `/admin/boloes/${draft.data.id}/exclusao`);
  assert.equal(gone.status, 404);
  const fails = await call('POST', '/admin/cotas/limpar-falhas');
  ok(fails, 'limpar compras que falharam');
  assert.equal(typeof fails.data.excluidas, 'number');
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

test('carteira, indicação entre clientes, Pix no cadastro e CRM com funil', async () => {
  const stamp = Date.now();
  const cpf = () => { const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)); const dv = (arr) => { const sum = arr.reduce((acc, n, i) => acc + n * (arr.length + 1 - i), 0); const r = (sum * 10) % 11; return r === 10 ? 0 : r; }; d.push(dv(d)); d.push(dv(d)); return d.join(''); };
  const body = (name, extra = {}) => ({ nome: name, cpf: cpf(), email: `${name.split(' ')[0].toLowerCase()}.${stamp}@teste.local`, telefone: '11912345678', maiorDeIdade: true, aceiteTermos: true, aceitePrivacidade: true, senha: 'Senha123', confirmarSenha: 'Senha123', ...extra });

  // Pix inválido é recusado; Pix válido é guardado.
  const bad = await call('POST', '/auth/registrar', body('Indicador Silva', { chavePix: '###' }), {}, { cookie: '' });
  assert.equal(bad.status, 409, 'chave Pix inválida');
  const referrerBody = body('Indicador Silva', { chavePix: 'indicador@teste.local' });
  const referrer = { cookie: '' };
  ok(await call('POST', '/auth/registrar', referrerBody, {}, referrer), 'cadastro do indicador');
  const profile = await call('GET', '/usuarios/me/perfil', undefined, {}, referrer);
  assert.equal(profile.data.chavePix, 'indicador@teste.local');

  // Link de indicação do cliente e carteira vazia.
  const referral = await call('GET', '/usuarios/me/indicacao', undefined, {}, referrer);
  ok(referral, 'link de indicação');
  assert.match(referral.data.codigo, /^[A-Z2-9]{8}$/);
  const wallet = await call('GET', '/usuarios/me/carteira', undefined, {}, referrer);
  ok(wallet, 'carteira'); assert.equal(wallet.data.saldoCentavos, 0);

  // Amigo entra pelo link e aparece como indicado.
  const friend = { cookie: '' };
  const friendBody = body('Amigo Souza', { codigoAfiliado: referral.data.codigo, chavePix: '11912345678' });
  ok(await call('POST', '/auth/registrar', friendBody, {}, friend), 'cadastro do amigo');
  const after = await call('GET', '/usuarios/me/indicacao', undefined, {}, referrer);
  assert.equal(after.data.totalIndicados, 1);

  // Administração: liga o cashback e credita um reembolso em saldo; o cliente vê no extrato.
  ok(await call('PUT', '/admin/carteira/cashback', { percentual: 50 }), 'ligar cashback');
  const credit = await call('POST', '/admin/carteira/ajuste', { email: referrerBody.email, valorCentavos: 5000, motivo: 'Devolução de teste', tipo: 'reembolso' });
  ok(credit, 'reembolso em crédito'); assert.equal(credit.data.saldoCentavos, 5000);
  const extract = await call('GET', '/usuarios/me/carteira', undefined, {}, referrer);
  assert.equal(extract.data.saldoCentavos, 5000); assert.equal(extract.data.movimentos[0].nome, 'Reembolso em crédito');
  const tooMuch = await call('POST', '/admin/carteira/ajuste', { email: referrerBody.email, valorCentavos: -999999, motivo: 'Desconto grande demais' });
  assert.equal(tooMuch.status, 400, 'não deixa o saldo ficar negativo');
  const asClient = await call('GET', '/admin/carteira', undefined, {}, referrer);
  assert.ok([401, 403].includes(asClient.status), 'cliente não abre a carteira do admin');

  // Bolão novo: o indicador paga a cota com o saldo (R$ 20 + taxa cabem nos R$ 50).
  const number = 70000 + Math.floor(Math.random() * 20000);
  const contest = await call('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: number, dataSorteio: future(14) });
  ok(contest, 'concurso');
  const nums = [3, 14, 25, 36, 47, 58];
  const pool = await call('POST', '/admin/boloes', { concursoId: contest.data.id, grupoId: state.groupId, numerosApostados: nums, jogos: [{ ordem: 1, numeros: nums, quantidadeDezenas: 6, custo: 6 }], cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato' });
  ok(pool, 'bolão do teste');
  ok(await call('POST', `/admin/boloes/${pool.data.id}/publicar`), 'publicar');
  const terms = await call('GET', '/config/mandato', undefined, {}, referrer);
  const reserved = await call('POST', '/cotas/reservar', { aceitoTermos: true, bolaoId: pool.data.id, quantidade: 1, titularCpf: referrerBody.cpf, titularNome: referrerBody.nome, termoMandatoHash: terms.data.hash }, {}, referrer);
  ok(reserved, 'reserva do indicador');
  const paid = await call('POST', `/cotas/${reserved.data.id}/pagar-com-saldo`, undefined, {}, referrer);
  ok(paid, 'pagar com saldo'); assert.equal(paid.data.status, 'confirmado');
  const afterPay = await call('GET', '/usuarios/me/carteira', undefined, {}, referrer);
  assert.equal(afterPay.data.saldoCentavos, 5000 - Math.round(Number(paid.data.valorBruto) * 100), 'saldo debitado pelo valor da cota');
  const again = await call('POST', `/cotas/${reserved.data.id}/pagar-com-saldo`, undefined, {}, referrer);
  assert.equal(again.status, 409, 'não paga duas vezes');

  // Amigo reserva e o admin dá baixa: o indicador recebe cashback (50% da taxa), uma vez só.
  const friendTerms = await call('GET', '/config/mandato', undefined, {}, friend);
  const friendShare = await call('POST', '/cotas/reservar', { aceitoTermos: true, bolaoId: pool.data.id, quantidade: 1, titularCpf: friendBody.cpf, titularNome: friendBody.nome, termoMandatoHash: friendTerms.data.hash }, {}, friend);
  ok(friendShare, 'reserva do amigo');
  ok(await call('POST', `/admin/cotas/${friendShare.data.id}/baixa`, { forma: 'pix_direto' }), 'baixa manual');
  const withCashback = await call('GET', '/usuarios/me/carteira', undefined, {}, referrer);
  assert.ok(withCashback.data.totalCashbackCentavos > 0, 'cashback creditado ao indicador');
  const friends = await call('GET', '/usuarios/me/indicacao', undefined, {}, referrer);
  assert.equal(friends.data.totalCompraram, 1);
  ok(await call('PUT', '/admin/carteira/cashback', { percentual: 0 }), 'desligar cashback');

  // CRM do admin traz o funil e filtra por etapa.
  const overview = await call('GET', '/admin/crm/resumo');
  ok(overview, 'resumo do CRM'); assert.equal(overview.data.funil.etapas.length, 6);
  const paidStage = await call('GET', '/admin/crm/apostadores?etapa=pagou&porPagina=100');
  ok(paidStage, 'filtro por etapa'); assert.ok(paidStage.data.items.every((row) => row.etapa === 'pagou'));
});
