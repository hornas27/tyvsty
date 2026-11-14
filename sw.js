// Ty vs. Ty – service worker: appka se otevře i bez internetu (data dosynchronizuje Firebase).
const CACHE = "tvt-v17";
const SHELL = ["./", "index.html", "app.js", "ai.js", "config.js", "manifest.json", "icons/icon-192.png", "icons/icon-512.png", "pdf.js", "vendor/jspdf.umd.min.js", "fonts/DejaVuSans.ttf", "fonts/DejaVuSans-Bold.ttf", "fonts/big-shoulders-display-latin-800-normal.woff2", "fonts/big-shoulders-display-latin-900-normal.woff2", "fonts/big-shoulders-display-latin-ext-800-normal.woff2", "fonts/big-shoulders-display-latin-ext-900-normal.woff2", "fonts/dm-sans-latin-400-normal.woff2", "fonts/dm-sans-latin-500-normal.woff2", "fonts/dm-sans-latin-700-normal.woff2", "fonts/dm-sans-latin-ext-400-normal.woff2", "fonts/dm-sans-latin-ext-500-normal.woff2", "fonts/dm-sans-latin-ext-700-normal.woff2"];

// knihovny Firebase z gstatic: mají číslo verze v adrese, takže se drží v cache napořád → appka se otevře i bez netu
const LIBS = "tvt-libs-1";
const LIB_SCRIPTS = ["app", "auth", "firestore"].map(n => "https://www.gstatic.com/firebasejs/10.12.2/firebase-" + n + "-compat.js");

self.addEventListener("install", e => {
  e.waitUntil(Promise.all([
    caches.open(CACHE).then(c => c.addAll(SHELL)),
    caches.open(LIBS).then(c => Promise.all(LIB_SCRIPTS.map(u => c.match(u).then(hit => hit || fetch(u, { mode: "no-cors" }).then(r => c.put(u, r)).catch(() => {})))))
  ]).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== LIBS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// vlastní soubory: nejdřív síť (ať máš vždy novou verzi), bez sítě cache
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith(caches.open(LIBS).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(res => { if (res.ok || res.type === "opaque") c.put(e.request, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});
