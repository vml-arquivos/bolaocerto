import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
function worker() {
  const listeners = {}; const saved = []; const removed = []; let skipped = 0;
  const cache = { addAll: async () => {}, put: async (req) => { saved.push(req.url); }, keys: async () => [], delete: async () => true };
  const ctx = { URL, Response, self: { location: { origin: 'https://bl.example' }, addEventListener: (name, fn) => { listeners[name] = fn; }, skipWaiting: async () => { skipped++; }, clients: { claim: async () => {} } }, caches: { open: async () => cache, match: async () => undefined, keys: async () => ['other-app-cache', 'bl-static-v1', 'bl-static-v2'], delete: async key => { removed.push(key); } }, fetch: async () => new Response('network') };
  vm.runInNewContext(source, ctx);
  async function request(path, method = 'GET', mode = 'cors') {
    let result; const req = { url: 'https://bl.example' + path, method, mode };
    listeners.fetch({ request: req, respondWith: value => { result = value; } });
    return result === undefined ? undefined : await result;
  }
  return { listeners, ctx, saved, removed, request, skipped: () => skipped };
}
test('service worker never intercepts purchase POSTs, auth or payment API', async () => {
  const w = worker();
  for (const [path, method] of [['/api/v1/cotas/reservar', 'POST'], ['/api/v1/auth/me', 'GET'], ['/api/v1/pagamentos', 'GET']]) assert.equal(await w.request(path, method), undefined);
  assert.deepEqual(w.saved, []);
});
test('private navigation goes to network and is not persisted', async () => {
  const w = worker(); const response = await w.request('/minha-conta/contratos', 'GET', 'navigate');
  assert.equal(await response.text(), 'network'); assert.deepEqual(w.saved, []);
});
test('offline navigation returns an offline notice, never a previous account page', async () => {
  const w = worker(); w.ctx.fetch = async () => { throw new Error('offline'); }; w.ctx.caches.match = async path => path === '/offline.html' ? new Response('offline notice') : undefined;
  assert.equal(await (await w.request('/minha-conta', 'GET', 'navigate')).text(), 'offline notice'); assert.deepEqual(w.saved, []);
});
test('updates wait for explicit activation and do not delete other applications caches', async () => {
  const w = worker(); let done;
  w.listeners.install({ waitUntil: p => { done = p; } }); await done; assert.equal(w.skipped(), 0);
  w.listeners.message({ data: { type: 'ACTIVATE_UPDATE' }, waitUntil: p => { done = p; } }); await done; assert.equal(w.skipped(), 1);
  w.listeners.activate({ waitUntil: p => { done = p; } }); await done; assert.deepEqual(w.removed, ['bl-static-v1']);
});
test('only static public assets are stored', async () => {
  const w = worker(); await w.request('/brand/bl-icon-192.png'); assert.deepEqual(w.saved, ['https://bl.example/brand/bl-icon-192.png']);
  assert.equal(await w.request('/anexos/private.pdf'), undefined);
});
