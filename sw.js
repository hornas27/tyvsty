// Ty vs. Ty – service worker: appka se otevře i bez internetu (data dosynchronizuje Firebase).
const CACHE = "tvt-v10";
const SHELL = ["./", "index.html", "app.js", "ai.js", "config.js", "manifest.json", "icons/icon-192.png", "icons/icon-512.png", "pdf.js", "vendor/jspdf.umd.min.js", "fonts/DejaVuSans.ttf", "fonts/DejaVuSans-Bold.ttf", "fonts/big-shoulders-display-latin-800-normal.woff2", "fonts/big-shoulders-display-latin-900-normal.woff2", "fonts/big-shoulders-display-latin-ext-800-normal.woff2", "fonts/big-shoulders-display-latin-ext-900-normal.woff2", "fonts/dm-sans-latin-400-normal.woff2", "fonts/dm-sans-latin-500-normal.woff2", "fonts/dm-sans-latin-700-normal.woff2", "fonts/dm-sans-latin-ext-400-normal.woff2", "fonts/dm-sans-latin-ext-500-normal.woff2", "fonts/dm-sans-latin-ext-700-normal.woff2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// vlastní soubory: nejdřív síť (ať máš vždy novou verzi), bez sítě cache
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match("index.html")))
  );
});
