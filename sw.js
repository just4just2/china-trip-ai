// ponytail: stale-while-revalidate for same-origin GETs, so the app opens even when the host is slow/blocked in China.
// Install a fresh page before taking over; an unavailable host must not destroy the offline copy.
const CACHE = 'china-trip-ai-v3';
addEventListener('install', e => e.waitUntil(caches.open(CACHE)
  .then(c => c.add(new Request('./', {cache: 'reload'}))).then(() => self.skipWaiting())));
addEventListener('activate', e => e.waitUntil(self.clients.claim()));
addEventListener('fetch', e => {
  if (e.request.method != 'GET' || !e.request.url.startsWith(location.origin)) return;
  const cache = caches.open(CACHE);
  const net = fetch(e.request).then(async r => {
    if (r.ok) await (await cache).put(e.request, r.clone());
    return r;
  });
  // Keep background revalidation alive even after a cached page has been returned.
  e.waitUntil(net.then(() => {}, () => {}));
  e.respondWith(e.request.cache == 'reload' ? net : cache.then(async c => (await c.match(e.request, {ignoreSearch: true})) || net));
});
