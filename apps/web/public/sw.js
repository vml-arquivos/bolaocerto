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

/* Avisos do BL (Web Push). Mostra a mensagem mesmo com o app fechado, com ícone, imagem de destaque e botão. */
const SAFE_LINK = link => (typeof link === 'string' && link.startsWith('/') && !link.startsWith('//')) ? link : '/aplicativo';
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { titulo: 'BL — Bolão Livre', mensagem: event.data ? event.data.text() : '' }; }
  const urgent = data.urgente === true;
  const actions = Array.isArray(data.acoes) ? data.acoes.filter(a => a && a.action && a.title).slice(0, 2).map(a => ({ action: String(a.action), title: String(a.title).slice(0, 40) })) : [];
  const options = {
    body: data.mensagem || 'Você tem uma novidade na sua conta.',
    icon: '/brand/bl-icon-192.png',
    badge: '/brand/bl-push-badge-96.png',
    lang: 'pt-BR',
    timestamp: Date.now(),
    vibrate: urgent ? [220, 100, 220, 100, 320] : [120, 60, 120],
    requireInteraction: urgent,
    tag: (data.tag || 'aviso') + ':' + Date.now(),
    actions,
    data: { link: SAFE_LINK(data.link) },
  };
  if (typeof data.imagem === 'string' && data.imagem.startsWith('/brand/')) options.image = data.imagem;
  event.waitUntil(self.registration.showNotification(data.titulo || 'BL — Bolão Livre', options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(SAFE_LINK(event.notification.data && event.notification.data.link), self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if ('focus' in client) { if ('navigate' in client) client.navigate(target); return client.focus(); }
    }
    return self.clients.openWindow(target);
  }));
});
/* O navegador renovou a inscrição de avisos: guarda a nova no servidor sem precisar abrir o app. */
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    try {
      const keyResponse = await fetch('/api/v1/push/chave', { credentials: 'include' });
      if (!keyResponse.ok) return;
      const { chave } = await keyResponse.json();
      const padded = chave.padEnd(chave.length + ((4 - (chave.length % 4)) % 4), '=').replace(/-/g, '+').replace(/_/g, '/');
      const raw = atob(padded); const bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
      const subscription = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      const json = subscription.toJSON();
      await fetch('/api/v1/push/inscrever', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) });
    } catch { /* tenta de novo quando o app abrir */ }
  })());
});
