/* BL client app. Never cache navigation, account, payment, contract or API responses.
 * A new worker waits for consent; no automatic reload during checkout. */
const CACHE = 'bl-static-v3';
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

/* Avisos do BL (Web Push). Mostra a mensagem mesmo com o site fechado e abre a conta ao tocar. */
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { titulo: 'BL — Bolão Livre', mensagem: event.data ? event.data.text() : '' }; }
  const title = data.titulo || 'BL — Bolão Livre';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.mensagem || 'Você tem uma novidade na sua conta.',
    icon: '/brand/bl-icon-192.png',
    badge: '/brand/bl-icon-192.png',
    tag: data.tag || undefined,
    data: { link: typeof data.link === 'string' && data.link.startsWith('/') ? data.link : '/minha-conta' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.link) || '/minha-conta', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if ('focus' in client) { if ('navigate' in client) client.navigate(target); return client.focus(); }
    }
    return self.clients.openWindow(target);
  }));
});
