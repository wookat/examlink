const CACHE = "examlink-v2";
const SHELL = ["/", "/style.css", "/app.js", "/manifest.webmanifest",
               "/icons/icon128.png", "/icons/icon192.png", "/icons/icon512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
/* drop stale caches from older versions, then take control immediately */
self.addEventListener("activate", e => e.waitUntil(
  caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => clients.claim())));
/* network-first: fresh code whenever the server is reachable,
   cache only as an offline fallback */
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) {
        const cp = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, cp));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
