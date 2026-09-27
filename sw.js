// ponytail: stale-while-revalidate for same-origin GETs, so the app opens even when the host is slow/blocked in China.
// New versions show up on the next launch after an update.
addEventListener('install', e => e.waitUntil(caches.open('app').then(c => c.add('./'))));
addEventListener('fetch', e => {
  if (e.request.method != 'GET' || !e.request.url.startsWith(location.origin)) return;
  e.respondWith(caches.open('app').then(async c => {
    const hit = await c.match(e.request, {ignoreSearch: true});
    const net = fetch(e.request).then(r => (r.ok && c.put(e.request, r.clone()), r));
    return hit ? (net.catch(() => {}), hit) : net;
  }));
});
