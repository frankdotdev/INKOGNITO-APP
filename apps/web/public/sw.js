/* Inkognito service worker: an offline shell. It never touches other origins (the database, Workers, payments),
   never caches URLs with a query string (pairing codes and payment references live there), and caches only public page shells. */
const VERSION = 'ink-v1', STATIC = `${VERSION}-static`, PAGES = `${VERSION}-pages`, MAX_PAGES = 40;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(PAGES).then(c => c.add('/offline')).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(cache) { const keys = await cache.keys(); for (let i = 0; i < keys.length - MAX_PAGES; i++) await cache.delete(keys[i]); }

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/pwa-icon/')) { // hashed, immutable: cache first
    e.respondWith(caches.open(STATIC).then(async c => { const hit = await c.match(req); if (hit) return hit; const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res; }));
    return;
  }
  if (req.mode === 'navigate') { // network first, fall back to the last copy, then the offline page
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && !url.search && res.headers.get('content-type')?.includes('text/html')) { const c = await caches.open(PAGES); await c.put(req, res.clone()); await trim(c); }
        return res;
      } catch {
        const c = await caches.open(PAGES);
        return (await c.match(req)) || (await c.match('/offline')) || new Response('Offline', { status: 503 });
      }
    })());
  }
});

/* Push notifications. The message text is generic by design; only same-site paths are ever opened. */
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = {}; }
  const url = typeof d.url === 'string' && d.url.startsWith('/') && !d.url.startsWith('//') ? d.url : '/void';
  e.waitUntil(self.registration.showNotification(typeof d.title === 'string' ? d.title.slice(0, 80) : 'Inkognito', {
    body: typeof d.body === 'string' ? d.body.slice(0, 200) : 'You have a new notification.', icon: '/pwa-icon/192', badge: '/pwa-icon/192',
    tag: typeof d.tag === 'string' ? d.tag.slice(0, 80) : undefined, data: { url },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data && typeof e.notification.data.url === 'string' ? e.notification.data.url : '/void';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { if (c.navigate) c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
