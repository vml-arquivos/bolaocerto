// Cupom (qualquer pessoa com o código, até 100% = cota grátis) e cashback por campanha (grupos, clientes ou nível). Só o administrador cria.
// Uso: E2E_API_URL=http://localhost:3001 node --test e2e/cupons-cashback.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const API = (process.env.E2E_API_URL ?? 'http://localhost:3001').replace(/\/$/, '') + '/api/v1';
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';
const stamp = Date.now();
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
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
const NUMBERS = [3, 12, 24, 36, 47, 58];

async function newClient(label) {
  const jar = { cookie: '' }; const cpf = randomCpf(); const name = `${label} Teste`;
  const email = `${label.toLowerCase()}.${stamp}.${Math.floor(Math.random() * 1e6)}@teste.local`;
  ok(await call('POST', '/auth/registrar', { nome: name, cpf, email, telefone: '11912345678', maiorDeIdade: true, aceiteTermos: true, aceitePrivacidade: true, senha: 'Senha123', confirmarSenha: 'Senha123' }, jar), `cadastro ${label}`);
  const me = (await call('GET', '/auth/me', undefined, jar)).data;
  return { jar, cpf, name, email, id: me.id ?? me.usuario?.id };
}
async function reserve(client, body = {}) {
  const terms = await call('GET', '/config/mandato', undefined, client.jar);
  return call('POST', '/cotas/reservar', { aceitoTermos: true, bolaoId: state.pool.id, quantidade: 1, titularCpf: client.cpf, titularNome: client.name, termoMandatoHash: terms.data.hash, ...body }, client.jar);
}
const wallet = async (client) => (await call('GET', '/usuarios/me/carteira', undefined, client.jar)).data;
const paymentOf = async (shareId) => (await call('GET', `/cotas/${shareId}/pagamento`, undefined, state.holder?.jar ?? admin));

test('preparo: grupo, bolão aberto e três clientes', async () => {
  ok(await call('POST', '/auth/login', { email: EMAIL, senha: PASSWORD }), 'login admin');
  state.slug = `cotistas-e2e-${stamp}`;
  const group = await call('POST', '/admin/grupos', { nome: `Cotistas E2E ${stamp}`, slug: state.slug, descricao: 'teste' }); ok(group, 'grupo');
  state.group = group.data;
  state.official = (await call('GET', '/grupos/bl-oficial')).data.id;
  const contest = await call('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: 60000 + Math.floor(Math.random() * 9000), dataSorteio: future(25) }); ok(contest, 'concurso');
  const pool = await call('POST', '/admin/boloes', { concursoId: contest.data.id, grupoId: state.official, numerosApostados: NUMBERS, jogos: [{ ordem: 1, numeros: NUMBERS, quantidadeDezenas: 6, custo: 6 }], cotasIlimitadas: false, totalCotas: 100, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato' }); ok(pool, 'bolão');
  state.pool = pool.data;
  ok(await call('POST', `/admin/boloes/${state.pool.id}/publicar`), 'publicar');
  state.a = await newClient('Alice'); state.b = await newClient('Bruno'); state.c = await newClient('Carla');
  ok(await call('POST', `/grupos/${state.slug}/entrar`, undefined, state.a.jar), 'Alice entra no grupo');
  assert.ok(state.a.id && state.b.id && state.c.id, 'ids dos clientes');
});

test('só o administrador mexe em cupom e cashback', async () => {
  for (const path of ['/admin/cupons', '/admin/cashback-campanhas', '/admin/promocoes/grupos']) {
    assert.equal((await call('GET', path, undefined, { cookie: '' })).status, 401, `${path} sem login`);
    assert.equal((await call('GET', path, undefined, state.a.jar)).status, 403, `${path} cliente`);
  }
  // A equipe de operação também não: é função só do administrador.
  const staff = await newClient('Operador');
  ok(await call('PATCH', `/admin/usuarios/${staff.id}/papel`, { papel: 'operacao' }), 'virar operação');
  ok(await call('POST', '/auth/login', { email: staff.email, senha: 'Senha123' }, staff.jar), 'login operação');
  for (const path of ['/admin/cupons', '/admin/cashback-campanhas', '/admin/promocoes/grupos']) assert.equal((await call('GET', path, undefined, staff.jar)).status, 403, `${path} operação`);
  assert.equal((await call('POST', '/admin/cupons', { tipo: 'percentual', valor: 5 }, staff.jar)).status, 403, 'operação não cria cupom');
  assert.equal((await call('POST', '/admin/cupons', { tipo: 'percentual', valor: 5 }, state.a.jar)).status, 403, 'cliente não cria cupom');
  assert.equal((await call('POST', '/admin/cashback-campanhas', { nome: 'Hack', percentual: 5, grupoIds: [state.group.id] }, state.a.jar)).status, 403, 'cliente não cria campanha');
});

test('cupom: validações na criação', async () => {
  assert.equal((await call('POST', '/admin/cupons', { tipo: 'percentual', valor: 150 })).status, 400, 'mais de 100%');
  assert.equal((await call('POST', '/admin/cupons', { tipo: 'percentual', valor: 0 })).status, 400, 'zero');
  assert.equal((await call('POST', '/admin/cupons', { tipo: 'sorteio', valor: 5 })).status, 400, 'tipo inválido');
  assert.equal((await call('POST', '/admin/cupons', { tipo: 'valor', valor: 1, grupoIds: ['00000000-0000-4000-8000-000000000000'] })).status, 400, 'grupo que não existe');
  assert.equal((await call('POST', '/admin/cupons', { tipo: 'valor', valor: 1, usuarioIds: ['00000000-0000-4000-8000-000000000000'] })).status, 400, 'cliente que não existe');
  assert.equal((await call('POST', '/admin/cupons', { tipo: 'valor', valor: 1, inicioEm: '2030-02-01T00:00:00Z', fimEm: '2030-01-01T00:00:00Z' })).status, 400, 'fim antes do início');
  assert.equal((await call('POST', '/admin/cupons', { tipo: 'valor', valor: 1, automatico: true })).status, 400, 'automático sem público valeria para todo mundo');
});

test('cupom de qualquer pessoa: criado sem público, vale para todo mundo que tiver o código', async () => {
  state.code = `E2E${String(stamp).slice(-6)}`;
  const created = await call('POST', '/admin/cupons', { codigo: state.code.toLowerCase(), descricao: 'teste', tipo: 'percentual', valor: 5, limiteTotal: 3, limitePorCliente: 1 }); ok(created, 'criar cupom');
  assert.equal(created.data.codigo, state.code, 'código normalizado em maiúsculas');
  state.coupon = created.data;
  assert.equal((await call('POST', '/admin/cupons', { codigo: state.code, tipo: 'valor', valor: 1 })).status, 409, 'código repetido');
  const list = (await call('GET', '/admin/cupons')).data.items.find((item) => item.id === state.coupon.id);
  assert.equal(list.estado, 'ativo'); assert.equal(list.publico, 'qualquer'); assert.equal(list.grupos.length, 0); assert.equal(list.clientes.length, 0);
});

test('cliente vê o desconto antes de pagar; sem o código não há desconto', async () => {
  const query = `bolaoId=${state.pool.id}&quantidade=1&codigo=${state.code}`;
  for (const [label, client] of [['Alice', state.a], ['Bruno', state.b], ['Carla', state.c]]) {
    const r = await call('GET', `/cupons/aplicavel?${query}`, undefined, client.jar); ok(r, `preview ${label}`);
    assert.equal(r.data.aplicado, true, `${label} usa o cupom`); assert.equal(r.data.totalCentavos, 2000); assert.equal(r.data.descontoCentavos, 100); assert.equal(r.data.totalComDescontoCentavos, 1900); assert.equal(r.data.gratis, false);
  }
  const two = await call('GET', `/cupons/aplicavel?bolaoId=${state.pool.id}&quantidade=2&codigo=${state.code}`, undefined, state.a.jar);
  assert.equal(two.data.descontoCentavos, 200, '5% de 2 cotas');
  const wrong = await call('GET', `/cupons/aplicavel?bolaoId=${state.pool.id}&quantidade=1&codigo=NAOEXISTE`, undefined, state.a.jar);
  assert.equal(wrong.data.aplicado, false); assert.ok(wrong.data.erro, 'mensagem para código que não existe');
  const none = await call('GET', `/cupons/aplicavel?bolaoId=${state.pool.id}&quantidade=1`, undefined, state.a.jar);
  assert.equal(none.data.aplicado, false, 'sem código e sem automático não aplica nada');
});

test('reserva com cupom: desconto sai da taxa, custo do bolão intacto, baixa pelo valor com desconto', async () => {
  const mine = await reserve(state.a, { cupom: state.code }); ok(mine, 'Alice reserva com cupom');
  assert.equal(mine.data.cupom.descontoCentavos, 100); state.shareA = mine.data.id;
  ok(await call('POST', `/admin/cotas/${state.shareA}/baixa`, { forma: 'pix_direto' }), 'baixa');
  const payment = await call('GET', `/cotas/${state.shareA}/pagamento`, undefined, state.a.jar); ok(payment, 'pagamento');
  const p = payment.data;
  assert.equal(Math.round(Number(p.valorBruto) * 100), 1900, 'cobra o valor com desconto');
  if (p.valorTaxaAdmin !== undefined) {
    assert.equal(Math.round(Number(p.valorTaxaAdmin) * 100), 82, 'taxa do BL (R$ 1,82) reduzida em R$ 1,00');
    assert.equal(Math.round(Number(p.valorCustoBilhete) * 100), 1818, 'custo do bolão não muda');
  }
  const uses = (await call('GET', `/admin/cupons/${state.coupon.id}/usos`)).data.items;
  assert.equal(uses.length, 1); assert.equal(uses[0].situacao, 'pago'); assert.equal(uses[0].descontoCentavos, 100); assert.equal(uses[0].subsidioCentavos, 0, 'desconto dentro da taxa não custa nada ao BL');
});

test('limite por cliente, limite total e cancelamento devolve o uso', async () => {
  const again = await reserve(state.a, { cupom: state.code });
  assert.equal(again.status, 409, 'Alice já usou'); assert.match(String(again.data.message), /já usou/);
  const bruno = await reserve(state.b, { cupom: state.code }); ok(bruno, 'Bruno reserva');
  const carla = await reserve(state.c, { cupom: state.code }); ok(carla, 'Carla também usa (cupom de qualquer pessoa)');
  assert.equal((await call('GET', `/admin/cupons`)).data.items.find((item) => item.id === state.coupon.id).usosEmAberto, 3, 'conta Alice (paga) + Bruno + Carla');
  const dana = await newClient('Dana');
  assert.equal((await reserve(dana, { cupom: state.code })).status, 409, 'limite total de 3 usos esgotado');
  assert.equal((await reserve(state.b, { cupom: state.code })).status, 409, 'Bruno já tem um uso em aberto');
  ok(await call('POST', `/admin/cotas/${bruno.data.id}/cancelar`, { motivo: 'teste' }), 'cancelar reserva');
  ok(await call('POST', `/admin/cotas/${carla.data.id}/cancelar`, { motivo: 'teste' }), 'cancelar reserva da Carla');
  const free = await reserve(state.b, { cupom: state.code }); ok(free, 'depois de cancelar o uso volta');
  ok(await call('POST', `/admin/cotas/${free.data.id}/cancelar`, { motivo: 'teste' }), 'cancelar de novo');
});

test('cupom pausado não vale; apagar com uso é bloqueado; limite não pode ficar menor que os usos', async () => {
  assert.equal((await call('PUT', `/admin/cupons/${state.coupon.id}`, { limiteTotal: 0 })).status, 400);
  ok(await call('POST', `/admin/cupons/${state.coupon.id}/pausar`), 'pausar');
  const preview = await call('GET', `/cupons/aplicavel?bolaoId=${state.pool.id}&quantidade=1&codigo=${state.code}`, undefined, state.b.jar);
  assert.equal(preview.data.aplicado, false, 'pausado');
  assert.equal((await reserve(state.b, { cupom: state.code })).status, 409);
  assert.equal((await call('DELETE', `/admin/cupons/${state.coupon.id}`)).status, 409, 'tem uso, não apaga');
  ok(await call('POST', `/admin/cupons/${state.coupon.id}/ativar`), 'ativar');
});

test('cupom de 100%: cota grátis gerada e confirmada na hora, sem pagamento', async () => {
  const code = `GRATIS${String(stamp).slice(-5)}`;
  const created = await call('POST', '/admin/cupons', { codigo: code, tipo: 'percentual', valor: 100, limiteTotal: 2, limitePorCliente: 1 }); ok(created, 'criar cupom 100%');
  state.free = created.data;
  const preview = await call('GET', `/cupons/aplicavel?bolaoId=${state.pool.id}&quantidade=1&codigo=${code}`, undefined, state.a.jar);
  assert.equal(preview.data.aplicado, true); assert.equal(preview.data.gratis, true); assert.equal(preview.data.totalComDescontoCentavos, 0); assert.equal(preview.data.descontoCentavos, 2000);
  const reserved = await reserve(state.a, { cupom: code }); ok(reserved, 'reservar com 100%');
  const paid = await call('POST', `/cotas/${reserved.data.id}/pagamento`, { metodo: 'pix' }, state.a.jar); ok(paid, 'confirmar cota grátis');
  assert.equal(paid.data.status, 'confirmado', 'confirmada na hora');
  assert.equal(Math.round(Number(paid.data.valorBruto) * 100), 0);
  const again = await call('GET', `/cotas/${reserved.data.id}/pagamento`, undefined, state.a.jar);
  assert.equal(again.data.status, 'confirmado');
  const uses = (await call('GET', `/admin/cupons/${state.free.id}/usos`)).data.items;
  assert.equal(uses.length, 1); assert.equal(uses[0].situacao, 'pago'); assert.equal(uses[0].descontoCentavos, 2000); assert.equal(uses[0].subsidioCentavos, 1818, 'o BL paga o custo do jogo (R$ 18,18)');
  const stats = (await call('GET', '/admin/cupons')).data.items.find((item) => item.id === state.free.id);
  assert.equal(stats.usosPagos, 1); assert.equal(stats.subsidioTotalCentavos, 1818);
  // Mesmo cliente não repete; outro cliente usa; o terceiro esbarra no limite total de 2.
  assert.equal((await reserve(state.a, { cupom: code })).status, 409, 'Alice já usou');
  const second = await reserve(state.b, { cupom: code }); ok(second, 'Bruno usa o 100%');
  ok(await call('POST', `/cotas/${second.data.id}/pagamento`, { metodo: 'pix' }, state.b.jar), 'confirmar Bruno');
  assert.equal((await reserve(state.c, { cupom: code })).status, 409, 'limite total de 2');
  // Estornar a cota grátis devolve o uso.
  ok(await call('POST', `/admin/cotas/${second.data.id}/cancelar`, { motivo: 'teste' }), 'cancelar cota grátis');
  const afterCancel = (await call('GET', '/admin/cupons')).data.items.find((item) => item.id === state.free.id);
  assert.equal(afterCancel.usosPagos, 1, 'o uso cancelado deixa de contar');
});

test('valor que cobre a cota inteira também deixa grátis; desconto parcial respeita o mínimo cobrável', async () => {
  const big = await call('POST', '/admin/cupons', { tipo: 'valor', valor: 50, limitePorCliente: 5 }); ok(big, 'cupom de R$ 50');
  const p1 = await call('GET', `/cupons/aplicavel?bolaoId=${state.pool.id}&quantidade=1&codigo=${big.data.codigo}`, undefined, state.c.jar);
  assert.equal(p1.data.gratis, true); assert.equal(p1.data.totalComDescontoCentavos, 0);
  const near = await call('POST', '/admin/cupons', { tipo: 'percentual', valor: 99, limitePorCliente: 5 }); ok(near, 'cupom de 99%');
  const p2 = await call('GET', `/cupons/aplicavel?bolaoId=${state.pool.id}&quantidade=1&codigo=${near.data.codigo}`, undefined, state.c.jar);
  assert.equal(p2.data.gratis, false); assert.equal(p2.data.totalComDescontoCentavos, 500, 'nunca abaixo do mínimo de R$ 5,00');
  const capped = await call('POST', '/admin/cupons', { tipo: 'percentual', valor: 100, descontoMaximoReais: 5, limitePorCliente: 5 }); ok(capped, 'cupom 100% com teto');
  const p3 = await call('GET', `/cupons/aplicavel?bolaoId=${state.pool.id}&quantidade=1&codigo=${capped.data.codigo}`, undefined, state.c.jar);
  assert.equal(p3.data.gratis, false); assert.equal(p3.data.descontoCentavos, 500, 'o teto do cupom vale');
  for (const coupon of [big, near, capped]) ok(await call('DELETE', `/admin/cupons/${coupon.data.id}`), 'apagar cupom de teste');
});

test('cupom automático (com público escolhido) aplica sem digitar', async () => {
  const auto = await call('POST', '/admin/cupons', { tipo: 'valor', valor: 1, automatico: true, limitePorCliente: 5, usuarioIds: [state.c.id], descricao: 'automático' }); ok(auto, 'criar automático');
  state.auto = auto.data;
  const preview = await call('GET', `/cupons/aplicavel?bolaoId=${state.pool.id}&quantidade=1`, undefined, state.c.jar);
  assert.equal(preview.data.aplicado, true, 'automático aplica sem digitar'); assert.equal(preview.data.descontoCentavos, 100);
  assert.equal(preview.data.totalComDescontoCentavos, 1900);
  const noAuto = await call('GET', `/cupons/aplicavel?bolaoId=${state.pool.id}&quantidade=1`, undefined, state.b.jar);
  assert.equal(noAuto.data.aplicado, false, 'quem não é do público não recebe');
  ok(await call('POST', `/admin/cupons/${state.auto.id}/pausar`), 'pausar automático');
});

test('cashback: campanha nasce pausada, só vale para o público, respeita teto e orçamento', async () => {
  assert.equal((await call('POST', '/admin/cashback-campanhas', { nome: 'Sem público', percentual: 5 })).status, 400, 'precisa de grupo, cliente ou nível');
  assert.equal((await call('POST', '/admin/cashback-campanhas', { nome: 'Muito', percentual: 101, grupoIds: [state.group.id] })).status, 400);
  const created = await call('POST', '/admin/cashback-campanhas', { nome: `Cashback E2E ${stamp}`, percentual: 5, orcamentoReais: 1.5, grupoIds: [state.group.id], usuarioIds: [state.b.id] }); ok(created, 'criar campanha');
  state.campaign = created.data;
  const listed = (await call('GET', '/admin/cashback-campanhas')).data.items.find((item) => item.id === state.campaign.id);
  assert.equal(listed.ativa, false); assert.equal(listed.estado, 'pausada');
  // Pausada: não paga cashback.
  const before = (await wallet(state.a)).saldoCentavos;
  const paused = await reserve(state.a); ok(paused, 'Alice reserva (campanha pausada)');
  ok(await call('POST', `/admin/cotas/${paused.data.id}/baixa`, { forma: 'pix_direto' }), 'baixa');
  assert.equal((await wallet(state.a)).saldoCentavos, before, 'campanha pausada não dá cashback');
  ok(await call('POST', `/admin/cashback-campanhas/${state.campaign.id}/ativar`), 'ativar campanha');
  // Ativa: 5% de R$ 20,00 = R$ 1,00.
  const first = await reserve(state.a); ok(first, 'reserva 1');
  ok(await call('POST', `/admin/cotas/${first.data.id}/baixa`, { forma: 'pix_direto' }), 'baixa 1');
  const w1 = await wallet(state.a); assert.equal(w1.saldoCentavos, before + 100, 'cashback de R$ 1,00 na carteira');
  assert.ok(w1.movimentos.some((item) => item.nome === 'Cashback'), 'aparece no extrato como Cashback');
  state.firstShare = first.data.id;
  // Baixa repetida não duplica.
  await call('POST', `/admin/cotas/${first.data.id}/baixa`, { forma: 'pix_direto' });
  assert.equal((await wallet(state.a)).saldoCentavos, before + 100, 'sem duplicar');
  // Orçamento de R$ 1,50: o segundo pagamento só recebe os R$ 0,50 que restam.
  const second = await reserve(state.a); ok(second, 'reserva 2');
  ok(await call('POST', `/admin/cotas/${second.data.id}/baixa`, { forma: 'pix_direto' }), 'baixa 2');
  assert.equal((await wallet(state.a)).saldoCentavos, before + 150, 'limitado ao orçamento');
  const third = await reserve(state.a); ok(third, 'reserva 3');
  ok(await call('POST', `/admin/cotas/${third.data.id}/baixa`, { forma: 'pix_direto' }), 'baixa 3');
  assert.equal((await wallet(state.a)).saldoCentavos, before + 150, 'orçamento esgotado');
  const stats = (await call('GET', '/admin/cashback-campanhas')).data.items.find((item) => item.id === state.campaign.id);
  assert.equal(stats.creditadoCentavos, 150); assert.equal(stats.restanteCentavos, 0); assert.equal(stats.estado, 'esgotada');
  // Quem não é do público não recebe (Carla).
  const carla = (await wallet(state.c)).saldoCentavos;
  const other = await reserve(state.c); ok(other, 'Carla reserva');
  ok(await call('POST', `/admin/cotas/${other.data.id}/baixa`, { forma: 'pix_direto' }), 'baixa Carla');
  assert.equal((await wallet(state.c)).saldoCentavos, carla, 'Carla fora da campanha');
});

test('cashback é desfeito quando o pagamento é estornado; campanha com crédito não é apagada', async () => {
  const before = (await wallet(state.a)).saldoCentavos;
  ok(await call('POST', `/admin/cotas/${state.firstShare}/cancelar`, { motivo: 'estorno de teste' }), 'estornar');
  const after = await wallet(state.a);
  assert.equal(after.saldoCentavos, before - 100, 'cashback de R$ 1,00 desfeito');
  const stats = (await call('GET', '/admin/cashback-campanhas')).data.items.find((item) => item.id === state.campaign.id);
  assert.equal(stats.creditadoCentavos, 50, 'orçamento usado considera o estorno');
  assert.equal((await call('DELETE', `/admin/cashback-campanhas/${state.campaign.id}`)).status, 409);
  ok(await call('POST', `/admin/cashback-campanhas/${state.campaign.id}/pausar`), 'pausar');
  const unused = await call('POST', '/admin/cashback-campanhas', { nome: 'Sem uso', percentual: 3, usuarioIds: [state.c.id] }); ok(unused, 'campanha sem uso');
  ok(await call('DELETE', `/admin/cashback-campanhas/${unused.data.id}`), 'apagar campanha sem uso');
  const couponUnused = await call('POST', '/admin/cupons', { tipo: 'valor', valor: 1, usuarioIds: [state.c.id] }); ok(couponUnused, 'cupom sem uso');
  ok(await call('DELETE', `/admin/cupons/${couponUnused.data.id}`), 'apagar cupom sem uso');
});

test('cashback por nível de compra: só quem já comprou o mínimo recebe', async () => {
  const created = await call('POST', '/admin/cashback-campanhas', { nome: `Nível E2E ${stamp}`, percentual: 5, comprasMinimas: 2, ativa: true }); ok(created, 'criar campanha por nível');
  const dana = await newClient('Nivel');
  const buy = async () => { const r = await reserve(dana); ok(r, 'reserva'); ok(await call('POST', `/admin/cotas/${r.data.id}/baixa`, { forma: 'pix_direto' }), 'baixa'); return (await wallet(dana)).saldoCentavos; };
  assert.equal(await buy(), 0, '1ª compra: ainda sem nível');
  assert.equal(await buy(), 0, '2ª compra: tinha só 1 antes');
  assert.equal(await buy(), 100, '3ª compra: já tinha 2 compras, ganha 5% de R$ 20,00');
  const listed = (await call('GET', '/admin/cashback-campanhas')).data.items.find((item) => item.id === created.data.id);
  assert.equal(listed.comprasMinimas, 2);
  ok(await call('POST', `/admin/cashback-campanhas/${created.data.id}/pausar`), 'pausar');
  assert.equal((await call('POST', '/admin/cashback-campanhas', { nome: 'Gasto', percentual: 5, gastoMinimoReais: 100 })).status, 201, 'só por gasto mínimo também vale');
  const spend = (await call('GET', '/admin/cashback-campanhas')).data.items.find((item) => item.nome === 'Gasto');
  assert.equal(spend.gastoMinimoCentavos, 10000);
  ok(await call('DELETE', `/admin/cashback-campanhas/${spend.id}`), 'apagar');
});

test('seletores do painel: grupos e busca de clientes', async () => {
  const groups = await call('GET', '/admin/promocoes/grupos'); ok(groups, 'grupos');
  assert.ok(groups.data.items.some((item) => item.id === state.group.id && item.membros === 1));
  assert.deepEqual((await call('GET', '/admin/promocoes/clientes?busca=a')).data.items, [], 'busca curta não lista');
  const found = await call('GET', `/admin/promocoes/clientes?busca=${encodeURIComponent(state.b.email)}`);
  assert.equal(found.data.items.length, 1); assert.equal(found.data.items[0].id, state.b.id);
});
