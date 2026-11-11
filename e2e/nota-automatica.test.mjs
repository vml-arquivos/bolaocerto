// Nota fiscal automática: o modo é escolhido no painel e vale mais que o NFSE_MODE do servidor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@teste.local', senha: process.env.E2E_ADMIN_PASSWORD ?? 'Senha123' };
let cookie = '';

async function call(method, path, body) {
  const response = await fetch(`${API}/api/v1${path}`, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((item) => item.split(';')[0]).join('; ');
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}

test('o painel liga e desliga a emissão automática', async () => {
  assert.equal((await call('POST', '/auth/login', ADMIN)).status, 201);
  const before = (await call('GET', '/admin/nfse/configuracao')).data;
  try {
    const on = await call('PUT', '/admin/nfse/modo', { modo: 'auto' });
    assert.equal(on.status, 200, JSON.stringify(on.data));
    assert.equal(on.data.modo, 'auto');
    assert.equal(on.data.modoDoPainel, true);
    assert.ok(on.data.automaticaDesde, 'guarda desde quando a automática vale');
    assert.equal((await call('GET', '/admin/nfse/configuracao')).data.modo, 'auto');
    const bad = await call('PUT', '/admin/nfse/modo', { modo: 'qualquer' });
    assert.equal(bad.status, 400);
    const off = await call('PUT', '/admin/nfse/modo', { modo: 'off' });
    assert.equal(off.data.modo, 'off');
    const pending = await call('POST', '/admin/notas-fiscais/emitir-pendentes', {});
    assert.equal(pending.status, 400, 'desligada não emite');
  } finally {
    await call('PUT', '/admin/nfse/modo', { modo: before.modo });
  }
});

test('"Ver nota" abre o resumo e o PDF da nota registrada', async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  if ((await call('POST', '/auth/login', ADMIN)).status !== 201) assert.fail('login');
  const pending = (await call('GET', '/admin/notas-fiscais')).data.semNota ?? [];
  if (!pending.length) return; // base de teste sem pagamento pendente: nada a conferir
  const numero = `T${Date.now().toString().slice(-6)}`;
  const registered = await call('POST', `/admin/notas-fiscais/pagamento/${pending[0].pagamentoId}/manual`, { numero, pdfUrl: 'https://exemplo.test/nota.pdf' });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await context.request.fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', data: ADMIN });
    const page = await context.newPage();
    await page.goto(`${BASE}/admin?view=notas-fiscais`, { waitUntil: 'load', timeout: 90000 });
    const row = page.locator('tr', { hasText: numero });
    await row.getByRole('button', { name: 'Ver nota' }).click({ timeout: 30000 });
    const panel = page.locator('section, div', { hasText: `Nota fiscal nº ${numero}` }).first();
    await panel.waitFor({ timeout: 15000 });
    const link = page.getByRole('link', { name: /Abrir a nota \(PDF\)/ });
    assert.equal(await link.getAttribute('href'), 'https://exemplo.test/nota.pdf');
  } finally {
    await browser.close();
    await call('POST', `/admin/notas-fiscais/${registered.data.id}/cancelar`, { motivo: 'teste automático' });
  }
});
