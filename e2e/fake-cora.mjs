// Cora simulada, só para testes. Fala o mesmo protocolo da Integração Direta:
// mTLS (certificado de cliente obrigatório), POST /token, /v2/invoices, /endpoints e avisos de pago.
// Não faz nenhuma cobrança real. Uso:
//   node e2e/fake-cora.mjs [pasta-dos-certificados]    # https na 8443 (Cora) e http na 8444 (controle do teste)
import https from 'node:https';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? join(import.meta.dirname, '.cora-certs'));
const CORA_PORT = Number(process.env.FAKE_CORA_PORT ?? 8443);
const CONTROL_PORT = Number(process.env.FAKE_CORA_CONTROL_PORT ?? 8444);
const CLIENT_ID = process.env.FAKE_CORA_CLIENT_ID ?? 'int-teste';

function openssl(...args) { execFileSync('openssl', args, { cwd: dir, stdio: 'ignore' }); }
function ensureCerts() {
  mkdirSync(dir, { recursive: true });
  if (existsSync(join(dir, 'certificate.pem'))) return;
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-days', '30', '-subj', '/CN=Cora Teste CA');
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr', '-subj', '/CN=localhost');
  writeExt('server.ext', 'subjectAltName=DNS:localhost,IP:127.0.0.1');
  openssl('x509', '-req', '-in', 'server.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'server.pem', '-days', '30', '-extfile', 'server.ext');
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'private-key.key', '-out', 'client.csr', '-subj', '/CN=cliente-bl');
  openssl('x509', '-req', '-in', 'client.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'certificate.pem', '-days', '30');
}
import { writeFileSync } from 'node:fs';
function writeExt(name, text) { writeFileSync(join(dir, name), text + '\n'); }
ensureCerts();

const invoices = new Map();      // id -> fatura
const byKey = new Map();         // Idempotency-Key -> id
const endpoints = [];            // webhooks cadastrados
const log = { tokens: 0, semCertificado: 0, rejeitadas: [] };
const tokens = new Set();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const readBody = (request) => new Promise((resolveBody) => { const chunks = []; request.on('data', (chunk) => chunks.push(chunk)); request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8'))); });
const send = (response, status, body) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(body === undefined ? '' : JSON.stringify(body)); };
const refuse = (response, status, motivo) => { log.rejeitadas.push(motivo); send(response, status, { message: motivo }); };

const coraServer = https.createServer({
  key: readFileSync(join(dir, 'server.key')), cert: readFileSync(join(dir, 'server.pem')),
  ca: readFileSync(join(dir, 'ca.pem')), requestCert: true, rejectUnauthorized: false,
}, async (request, response) => {
  if (!request.socket.authorized) { log.semCertificado += 1; return refuse(response, 403, 'certificado de cliente ausente ou inválido'); }
  const body = await readBody(request);
  const path = request.url ?? '';
  if (request.method === 'POST' && path === '/token') {
    const form = new URLSearchParams(body);
    if (form.get('grant_type') !== 'client_credentials' || form.get('client_id') !== CLIENT_ID) return refuse(response, 400, 'token: parâmetros inválidos');
    if (!String(request.headers['content-type']).startsWith('application/x-www-form-urlencoded')) return refuse(response, 400, 'token: content-type inválido');
    const token = randomBytes(16).toString('hex'); tokens.add(token); log.tokens += 1;
    return send(response, 200, { access_token: token, token_type: 'Bearer', expires_in: 86400, refresh_expires_in: 0, scope: 'offline_access' });
  }
  if (!tokens.has(String(request.headers.authorization ?? '').replace(/^Bearer /, ''))) return refuse(response, 401, 'sem token válido');

  if (request.method === 'POST' && path === '/v2/invoices') {
    const key = String(request.headers['idempotency-key'] ?? '');
    if (!UUID.test(key)) return refuse(response, 400, 'Idempotency-Key precisa ser UUID');
    if (byKey.has(key)) return send(response, 200, invoices.get(byKey.get(key)));
    let payload; try { payload = JSON.parse(body); } catch { return refuse(response, 400, 'JSON inválido'); }
    const service = payload.services?.[0];
    if (!payload.code || !/^\d{11}$/.test(payload.customer?.document?.identity ?? '') || payload.customer?.document?.type !== 'CPF') return refuse(response, 400, 'cliente/documento inválido');
    if (!Number.isInteger(service?.amount) || service.amount < 500) return refuse(response, 400, 'valor em centavos inválido (mínimo R$ 5,00)');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.payment_terms?.due_date ?? '')) return refuse(response, 400, 'vencimento inválido');
    if (!Array.isArray(payload.payment_forms) || !payload.payment_forms.every((form) => ['PIX', 'BANK_SLIP'].includes(form))) return refuse(response, 400, 'formas de pagamento inválidas');
    const id = `inv_${randomBytes(8).toString('hex')}`;
    const invoice = {
      id, status: 'OPEN', code: payload.code, total_amount: service.amount, total_paid: 0,
      pix: { emv: `00020126580014br.gov.bcb.pix0136${randomUUID()}5204000053039865406${(service.amount / 100).toFixed(2)}5802BR5909BL TESTE6009SAO PAULO62070503***6304ABCD` },
      payment_options: payload.payment_forms.includes('BANK_SLIP') ? { bank_slip: { url: `https://teste.invalid/boleto/${id}`, barcode: '23793380296000000000000000000000100000000000', digitable: '23793.38029 60000.000000 00000.000000 1 00000000000000' } } : {},
    };
    invoices.set(id, invoice); byKey.set(key, id);
    return send(response, 201, invoice);
  }
  const match = /^\/v2\/invoices\/(inv_[\w-]+)$/.exec(path);
  if (match) {
    const invoice = invoices.get(match[1]);
    if (!invoice) return send(response, 404, { message: 'não encontrada' });
    if (request.method === 'GET') return send(response, 200, invoice);
    if (request.method === 'DELETE') { invoice.status = 'CANCELLED'; return send(response, 204); }
  }
  if (request.method === 'POST' && path === '/endpoints') {
    let payload; try { payload = JSON.parse(body); } catch { return refuse(response, 400, 'JSON inválido'); }
    if (!/^https?:\/\//.test(payload.url ?? '') || payload.resource !== 'invoice' || !['paid', 'canceled'].includes(payload.trigger)) return refuse(response, 400, 'endpoint inválido');
    const endpoint = { id: `end_${randomBytes(6).toString('hex')}`, ...payload }; endpoints.push(endpoint);
    return send(response, 201, endpoint);
  }
  return refuse(response, 404, `rota desconhecida ${request.method} ${path}`);
});

/** Controle do teste (HTTP simples, sem certificado): marcar como pago e avisar o BL, ver o que foi recebido. */
const control = http.createServer(async (request, response) => {
  const path = request.url ?? '';
  const pay = /^\/__pay\/(inv_[\w-]+)(?:\?.*)?$/.exec(path);
  if (request.method === 'POST' && pay) {
    const invoice = invoices.get(pay[1]);
    if (!invoice) return send(response, 404, { message: 'não encontrada' });
    invoice.status = 'PAID'; invoice.total_paid = invoice.total_amount;
    const notified = [];
    // ?silent=1 simula um aviso perdido: só a conferência automática do BL pode descobrir o pagamento.
    const silent = new URL(path, 'http://x').searchParams.get('silent') === '1';
    for (const endpoint of silent ? [] : endpoints.filter((item) => item.trigger === 'paid')) {
      const result = await fetch(endpoint.url, { method: 'POST', headers: { 'webhook-event-type': 'invoice.paid', 'webhook-resource-id': invoice.id } }).catch((error) => ({ status: 0, error: String(error) }));
      notified.push({ url: endpoint.url.replace(/token=[^&]+/, 'token=***'), status: result.status });
    }
    return send(response, 200, { avisos: notified });
  }
  if (request.method === 'GET' && path === '/__state') return send(response, 200, { invoices: [...invoices.values()], endpoints, ...log });
  return send(response, 404, { message: 'controle: rota desconhecida' });
});

coraServer.listen(CORA_PORT, () => console.log(`Cora simulada (mTLS) em https://localhost:${CORA_PORT}`));
control.listen(CONTROL_PORT, () => console.log(`Controle do teste em http://localhost:${CONTROL_PORT}`));
console.log(`Certificados em ${dir}`);
