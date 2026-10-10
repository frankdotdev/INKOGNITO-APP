// Runs the service worker against a fake caches/fetch to check what it caches and what it leaves alone.
import { readFileSync } from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const stores = new Map(), listeners = {}; let online = true; const origin = 'https://app.test';
const cacheFor = n => { if (!stores.has(n)) stores.set(n, new Map()); const m = stores.get(n); return { match: async (r) => m.get(typeof r === 'string' ? new URL(r, origin).href : r.url), put: async (r, res) => { m.set(r.url, res); }, add: async u => { m.set(new URL(u, origin).href, new Response('offline page', { headers: { 'content-type': 'text/html' } })); }, keys: async () => [...m.keys()].map(u => ({ url: u })), delete: async r => m.delete(typeof r === 'string' ? r : r.url) }; };
const shown = [], opened = []; const ctx = { self: { registration: { showNotification: async (t, o) => shown.push([t, o]) }, location: new URL(origin), addEventListener: (t, f) => (listeners[t] = f), skipWaiting: async () => {}, clients: { claim: async () => {}, matchAll: async () => [], openWindow: async u => opened.push(u) } }, caches: { open: async n => cacheFor(n), keys: async () => [...stores.keys()], delete: async n => stores.delete(n) }, fetch: async r => { if (!online) throw new Error('offline'); return new Response('live:' + r.url, { headers: { 'content-type': r.url.includes('/_next/') ? 'text/javascript' : 'text/html' } }); }, Response, URL, Promise };
vm.createContext(ctx); vm.runInContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), ctx);
const wait = []; await (async () => { listeners.install({ waitUntil: p => wait.push(p) }); await Promise.all(wait); })();
const go = async (path, o = {}) => { let out; const req = Object.assign(new Request(new URL(path, o.origin ?? origin)), {}); const r = o.mode ? { url: req.url, method: o.method ?? 'GET', mode: o.mode } : { url: req.url, method: o.method ?? 'GET', mode: 'cors' }; listeners.fetch({ request: r, respondWith: p => (out = p) }); return out ? await out : null; };
assert.ok(stores.get('ink-v1-pages').has(origin + '/offline'), 'offline page is precached');
assert.equal(await go('https://db.supabase.test/rest/v1/rpc/x', { origin: 'https://db.supabase.test', mode: 'cors' }), null, 'other origins are never intercepted');
assert.equal(await go('/anything', { method: 'POST', mode: 'navigate' }), null, 'non-GET requests are never intercepted');
assert.equal(await go('/api/x'), null, 'ordinary same-origin requests pass through untouched');
await go('/_next/static/chunk.js'); online = false; const hit = await go('/_next/static/chunk.js'); assert.equal(await hit.text(), 'live:' + origin + '/_next/static/chunk.js', 'static files are served from cache when offline'); online = true;
await go('/void', { mode: 'navigate' }); online = false;
assert.equal(await (await go('/void', { mode: 'navigate' })).text(), 'live:' + origin + '/void', 'a visited page opens offline');
assert.equal(await (await go('/create', { mode: 'navigate' })).text(), 'offline page', 'an unvisited page shows the offline page');
online = true; await go('/link?p=abc&c=SECRET', { mode: 'navigate' }); await go('/settings/plus/return?reference=ink_1', { mode: 'navigate' });
const cached = [...stores.get('ink-v1-pages').keys()].join(' '); assert.ok(!cached.includes('SECRET') && !cached.includes('reference') && !cached.includes('/link'), 'URLs with query strings (pairing codes, payment references) are never stored');
stores.set('old-cache', new Map()); const w2 = []; listeners.activate({ waitUntil: p => w2.push(p) }); await Promise.all(w2); assert.ok(!stores.has('old-cache') && stores.has('ink-v1-pages'), 'activation removes old caches only');
// ---- push ----
const push = async data => { const w = []; listeners['push']({ data: { json: () => data }, waitUntil: p => w.push(p) }); await Promise.all(w); };
await push({ title: 'Inkognito', body: 'Someone replied to your confession.', url: '/post/abc', tag: 'reply:abc' });
assert.deepEqual([shown[0][0], shown[0][1].body, shown[0][1].data.url, shown[0][1].tag], ['Inkognito', 'Someone replied to your confession.', '/post/abc', 'reply:abc'], 'a push shows a notification with its link');
await push({ title: 'x', body: 'y', url: 'https://evil.example/phish' }); assert.equal(shown[1][1].data.url, '/void', 'an off-site link in a push is replaced with the home page');
await push({ title: 'x', body: 'y', url: '//evil.example' }); assert.equal(shown[2][1].data.url, '/void', 'a protocol-relative link is replaced with the home page');
await push({}); assert.equal(shown[3][1].body, 'You have a new notification.', 'an empty push still shows something generic');
let closed = false; const w3 = []; listeners.notificationclick({ notification: { close: () => (closed = true), data: { url: '/messages' } }, waitUntil: p => w3.push(p) }); await Promise.all(w3);
assert.ok(closed && opened[0] === '/messages', 'tapping a notification opens its page');
console.log('SERVICE WORKER TESTS PASSED');
