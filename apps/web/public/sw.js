/* BL client app. Never cache navigation, account, payment, contract or API responses.
 * A new worker waits for consent; no automatic reload during checkout. */
const CACHE = 'bl-static-v2';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/brand/bl-icon-192.png', '/brand/bl-icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('bl-static-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.match(OFFLINE_URL)) || new Response('Sem conexão. Reconecte para consultar suas cotas.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
    return;
  }
  if (url.pathname.startsWith('/brand/') || url.pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const response = await fetch(req);
      if (response.ok && response.type !== 'opaque') {
        const cache = await caches.open(CACHE);
        await cache.put(req, response.clone());
        const keys = await cache.keys();
        const removable = keys.filter(key => !PRECACHE.includes(new URL(key.url).pathname));
        await Promise.all(removable.slice(0, Math.max(0, keys.length - 100)).map(key => cache.delete(key)));
      }
      return response;
    })());
  }
});
