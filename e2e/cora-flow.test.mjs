// Compra completa pela Cora (simulada): reserva, Pix, boleto, aviso de pago, conferência automática e comissão.
// Precisa da API configurada para a Cora simulada (veja e2e/README.md) e de `node e2e/fake-cora.mjs` no ar.
import test from 'node:test';
import assert from 'node:assert/strict';

const API = (process.env.E2E_API_URL ?? 'http://localhost:3001').replace(/\/$/, '') + '/api/v1';
const CONTROL = (process.env.FAKE_CORA_CONTROL_URL ?? 'http://localhost:8444').replace(/\/$/, '');
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha123';
const WEBHOOK_TOKEN = process.env.PAYMENT_WEBHOOK_SECRET ?? 'segredo-teste-webhook';

const admin = { cookie: '' }; const buyer = { cookie: '' }; const state = {};
async function call(method, path, body, jar = admin, extra = {}) {
  const headers = { cookie: jar.cookie, ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...extra };
  const response = await fetch(API + path, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) jar.cookie = set.map((item) => item.split(';')[0]).join('; ');
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
const ok = (result, label) => assert.ok(result.status >= 200 && result.status < 300, `${label}: HTTP ${result.status} ${JSON.stringify(result.data).slice(0, 300)}`);
const control = async (method, path) => { const response = await fetch(CONTROL + path, { method }); return response.json(); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
function randomCpf() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digit = (list) => { const sum = list.reduce((total, value, index) => total + value * (list.length + 1 - index), 0); const rest = (sum * 10) % 11; return rest === 10 ? 0 : rest; };
  const first = digit(base); return [...base, first, digit([...base, first])].join('');
}

test('prepara: administrador, afiliado, bolão publicado e comprador', async () => {
  const start = await control('GET', '/__state');
  state.baseline = { semCertificado: start.semCertificado, rejeitadas: start.rejeitadas.length };
  ok(await call('POST', '/auth/login', { email: EMAIL, senha: PASSWORD }), 'login admin');
  const stamp = Date.now();
  ok(await call('POST', '/admin/afiliados', { nome: 'Afiliado Cora', cpf: randomCpf(), email: `afiliado.cora.${stamp}@teste.local`, dataNascimento: '1990-01-01', senha: 'Senha123' }), 'criar afiliado');
  const list = await call('GET', `/admin/afiliados?busca=afiliado.cora.${stamp}`);
  state.affiliate = list.data.items[0]; assert.ok(state.affiliate, 'afiliado não encontrado');
  if (state.affiliate.statusAprovacao !== 'aprovado') ok(await call('POST', `/admin/afiliados/${state.affiliate.id}/aprovar`, { comissaoPadraoPct: 10 }), 'aprovar afiliado');

  const group = await call('GET', '/grupos/bl-oficial'); ok(group, 'grupo');
  const contest = await call('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: 80000 + Math.floor(Math.random() * 9000), dataSorteio: future(15) }); ok(contest, 'concurso');
  const numbers = [3, 12, 24, 36, 47, 58];
  const pool = await call('POST', '/admin/boloes', { concursoId: contest.data.id, grupoId: group.data.id, numerosApostados: numbers, jogos: [{ ordem: 1, numeros: numbers, quantidadeDezenas: 6, custo: 6 }], cotasIlimitadas: false, totalCotas: 10, valorCota: 20, taxaAdministracaoPct: 10, modeloOperacional: 'mandato' }); ok(pool, 'bolão');
  state.poolId = pool.data.id;
  const form = new FormData(); form.set('tipo', 'comprovante_aposta'); form.set('visivelParticipantes', 'true'); form.set('arquivo', new Blob([PNG], { type: 'image/png' }), 'comprovante.png');
  ok(await call('POST', `/operacao/boloes/${state.poolId}/anexos`, form), 'comprovante');
  ok(await call('POST', `/admin/boloes/${state.poolId}/publicar`), 'publicar');

  state.cpf = randomCpf();
  ok(await call('POST', '/auth/registrar', { nome: 'Comprador Teste', cpf: state.cpf, email: `comprador.${stamp}@teste.local`, telefone: '11912345678', maiorDeIdade: true, senha: 'Senha123' }, buyer), 'cadastrar comprador');
  if (!buyer.cookie) ok(await call('POST', '/auth/login', { email: `comprador.${stamp}@teste.local`, senha: 'Senha123' }, buyer), 'login comprador');
});

test('a Cora está configurada e os avisos são cadastrados com a senha do webhook', async () => {
  const settings = await call('GET', '/admin/pagamentos/configuracao'); ok(settings, 'configuração de pagamentos');
  assert.equal(settings.data.provedor, 'cora');
  assert.equal(settings.data.habilitado, true);
  assert.ok(settings.data.metodos.includes('pix') && settings.data.metodos.includes('boleto'));
  assert.equal(settings.data.webhookTokenConfigurado, true);
  const registered = await call('POST', '/admin/pagamentos/cora/webhooks'); ok(registered, 'cadastrar avisos na Cora');
  const fake = await control('GET', '/__state');
  assert.deepEqual([...new Set(fake.endpoints.map((item) => item.trigger))].sort(), ['canceled', 'paid']);
  assert.ok(fake.endpoints.every((item) => item.url.includes('/webhooks/pagamento/cora') && item.url.includes('token=')), 'o endereço do aviso precisa levar a senha');
  assert.equal(fake.semCertificado, state.baseline.semCertificado, 'toda chamada precisa ter ido com o certificado de cliente');
  assert.deepEqual(fake.rejeitadas.slice(state.baseline.rejeitadas), [], 'a Cora recusou chamadas do BL');
});

async function reserve() {
  const terms = await call('GET', '/config/mandato'); ok(terms, 'mandato');
  assert.equal(terms.data.aprovado, true, 'contratos precisam estar aprovados (LEGAL_*) para vender');
  const reservation = await call('POST', '/cotas/reservar', { aceitoTermos: true, bolaoId: state.poolId, quantidade: 1, titularCpf: state.cpf, titularNome: 'Comprador Teste', termoMandatoHash: terms.data.hash, codigoAfiliado: state.affiliate.codigoAfiliado }, buyer);
  ok(reservation, 'reservar cota');
  return reservation.data;
}

test('Pix: gera a cobrança na Cora, o aviso confirma e a cota fica paga com comissão pendente', async () => {
  const share = await reserve();
  const payment = await call('POST', `/cotas/${share.id}/pagamento`, { metodo: 'pix' }, buyer); ok(payment, 'criar Pix');
  assert.ok(String(payment.data.qrCodePix ?? '').startsWith('0002'), 'o código copia-e-cola do Pix precisa vir');
  const fake = await control('GET', '/__state');
  const invoice = fake.invoices.find((item) => item.id === payment.data.pspTransactionId);
  assert.ok(invoice, 'a cobrança precisa existir na Cora');
  assert.equal(invoice.total_amount, Math.round(Number(payment.data.valorBruto) * 100), 'o valor cobrado precisa ser o da cota, em centavos');
  assert.equal(invoice.payment_options.bank_slip, undefined, 'Pix puro não leva boleto');

  const paid = await control('POST', `/__pay/${invoice.id}`);
  assert.equal(paid.avisos.length, 1);
  assert.ok(paid.avisos[0].status >= 200 && paid.avisos[0].status < 300, `o aviso de pago voltou HTTP ${paid.avisos[0].status}`);
  const current = await call('GET', `/cotas/${share.id}/pagamento`, undefined, buyer); ok(current, 'consultar pagamento');
  assert.equal(current.data.status, 'confirmado');
  const mine = await call('GET', '/cotas/minhas', undefined, buyer); ok(mine, 'minhas cotas');
  assert.equal((Array.isArray(mine.data) ? mine.data : mine.data.items).find((item) => item.id === share.id)?.status, 'paga');

  const affiliate = { cookie: '' };
  ok(await call('POST', '/auth/login', { email: state.affiliate.usuario.email, senha: 'Senha123' }, affiliate), 'login afiliado');
  const commissions = await call('GET', '/afiliados/me/comissoes', undefined, affiliate); ok(commissions, 'comissões');
  assert.equal(commissions.data.length, 1);
  assert.equal(commissions.data[0].status, 'pendente');

  // Rastreio: a venda aparece no painel do afiliado, por bolão, com o link rastreado.
  const sales = await call('GET', '/afiliados/me/vendas', undefined, affiliate); ok(sales, 'vendas por bolão');
  const row = sales.data.items.find((item) => item.bolaoId === state.poolId);
  assert.ok(row, 'o bolão vendido precisa aparecer nas vendas do afiliado');
  assert.equal(row.cotasVendidas, 1);
  assert.equal(row.link, `/r/${state.affiliate.codigoAfiliado}?bolao=${state.poolId}`);

  // Cota a cota: o afiliado vê o comprador só com nome e inicial, a situação e a comissão; nada de CPF.
  const quotas = await call('GET', '/afiliados/me/cotas', undefined, affiliate); ok(quotas, 'cotas do afiliado');
  const quota = quotas.data.items.find((item) => item.bolaoId === state.poolId && ['paga', 'registrada'].includes(item.status));
  assert.ok(quota, 'a cota paga precisa aparecer em Cotas');
  assert.equal(quota.comprador, 'Comprador T.');
  assert.equal(quota.comissao?.status, 'pendente');
  assert.ok(!JSON.stringify(quotas.data).includes(state.cpf), 'o CPF do comprador não pode sair para o afiliado');
  const noAccess = await call('GET', '/afiliados/me/cotas', undefined, buyer);
  assert.ok([401, 403].includes(noAccess.status), 'quem não é afiliado não vê as cotas');
});

test('Boleto com Pix: devolve linha digitável e vencimento', async () => {
  const share = await reserve();
  const payment = await call('POST', `/cotas/${share.id}/pagamento`, { metodo: 'boleto' }, buyer); ok(payment, 'criar boleto');
  assert.ok(payment.data.linhaDigitavel, 'a linha digitável precisa vir');
  assert.ok(payment.data.codigoBarras, 'o código de barras precisa vir');
  assert.ok(payment.data.boletoUrl, 'o link do boleto precisa vir');
  assert.ok(payment.data.vencimentoEm, 'o vencimento precisa vir');
  state.boletoInvoice = payment.data.pspTransactionId;
  state.boletoShare = share.id;
});

test('aviso perdido: a conferência automática descobre o pagamento sozinha', async () => {
  const paid = await control('POST', `/__pay/${state.boletoInvoice}?silent=1`);
  assert.equal(paid.avisos.length, 0);
  const before = await call('GET', `/cotas/${state.boletoShare}/pagamento`, undefined, buyer); ok(before, 'consultar antes');
  const reconciled = await call('POST', '/admin/pagamentos/conciliar'); ok(reconciled, 'conciliar');
  const after = await call('GET', `/cotas/${state.boletoShare}/pagamento`, undefined, buyer); ok(after, 'consultar depois');
  assert.equal(after.data.status, 'confirmado', `antes: ${before.data.status}`);
});

test('aviso com senha errada é recusado', async () => {
  const wrong = await fetch(`${API}/webhooks/pagamento/cora?token=errado`, { method: 'POST', headers: { 'webhook-event-type': 'invoice.paid', 'webhook-resource-id': 'inv_qualquer' } });
  assert.equal(wrong.status, 401);
});

test('conciliação financeira fecha depois das vendas', async () => {
  const result = await call('GET', '/admin/financeiro/conciliacao'); ok(result, 'conciliação');
  assert.equal(result.data.pagamentosSemCota, 0);
  assert.equal(result.data.cotasPagasSemPagamento, 0);
});

test('preço livre: o cliente paga R$ 20 e o sistema separa R$ 0,60 de registro e R$ 19,40 de serviço (base da nota)', async () => {
  const group = await call('GET', '/grupos/bl-oficial'); ok(group, 'grupo');
  const contest = await call('POST', '/admin/concursos', { modalidade: 'megasena', numeroConcurso: 81000 + Math.floor(Math.random() * 900), dataSorteio: future(16) }); ok(contest, 'concurso');
  const numbers = [2, 13, 25, 37, 48, 59];
  const pool = await call('POST', '/admin/boloes', {
    concursoId: contest.data.id, grupoId: group.data.id, numerosApostados: numbers, jogos: [{ ordem: 1, numeros: numbers, quantidadeDezenas: 6, custo: 60 }],
    cotasIlimitadas: false, totalCotas: 100, valorCota: 20, taxaAdministracaoPct: 97, modeloOperacional: 'mandato', precoLivre: true, precificacaoAutomatica: false, custoRegistroCentavos: 6000, totalCotadoCentavos: 200000,
  });
  ok(pool, 'criar bolão de preço livre');
  // Sem o registro da lotérica: a venda abre e o comprovante entra depois, dentro do bolão.
  ok(await call('POST', `/admin/boloes/${pool.data.id}/publicar`), 'publicar sem comprovante');
  state.poolId = pool.data.id;
  const share = await reserve();
  const payment = await call('POST', `/cotas/${share.id}/pagamento`, { metodo: 'pix' }, buyer); ok(payment, 'criar Pix');
  assert.equal(Number(payment.data.valorBruto), 20);
  const fake = await control('GET', '/__state');
  const invoice = fake.invoices.find((item) => item.id === payment.data.pspTransactionId);
  assert.equal(invoice.total_amount, 2000);
  await control('POST', `/__pay/${invoice.id}`);
  const notes = await call('GET', '/admin/notas-fiscais'); ok(notes, 'notas fiscais');
  const row = notes.data.semNota.find((item) => item.pagamentoId === payment.data.id);
  assert.ok(row, 'o pagamento confirmado precisa aparecer para emitir a nota');
  assert.equal(row.valor, 20);
  assert.equal(row.valorServico, 19.4, 'a nota é só da taxa de serviço');
  assert.equal(row.valorRegistro, 0.6, 'o registro da CAIXA fica fora da nota');
});
