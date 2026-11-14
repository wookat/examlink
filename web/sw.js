const CACHE = "examlink-v1";
const SHELL = ["/", "/style.css", "/app.js", "/manifest.webmanifest",
               "/icons/icon128.png", "/icons/icon192.png", "/icons/icon512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => e.waitUntil(clients.claim()));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return;
  if (u.pathname === "/" || u.pathname === "/index.html") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/", { ignoreSearch: true })));
    return;
  }
  if (SHELL.includes(u.pathname)) {
    e.respondWith(caches.match(e.request).then(r => r ||
      fetch(e.request).then(res => {
        const cp = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, cp));
        return res;
      })));
  }
});
