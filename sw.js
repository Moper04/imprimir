// Service worker de "Imprimir en la Kyocera".
// 1) Recibe los archivos que llegan desde el menú Compartir de Android (share_target, POST a ./share)
//    y los deja en la caché "compartidos" para que la página los recoja.
// 2) Guarda la app para que abra aunque la señal sea mala.
const VERSION = "v2";
const APP = "app-" + VERSION;
const SHARED = "compartidos";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./vendor/pdf-lib.min.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== APP && k !== SHARED) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  if (e.request.method === "POST" && url.pathname.endsWith("/share")) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const files = form.getAll("files").filter(f => f && typeof f === "object" && f.size > 0);
      const cache = await caches.open(SHARED);
      for (const k of await cache.keys()) await cache.delete(k);
      let i = 0;
      for (const f of files) {
        await cache.put(new Request(`./compartido/${i++}`), new Response(f, {
          headers: { "content-type": f.type || "application/octet-stream", "x-name": encodeURIComponent(f.name || `archivo-${i}`) }
        }));
      }
      return Response.redirect(new URL(`./?compartido=${Date.now()}`, self.registration.scope).href, 303);
    })());
    return;
  }

  if (e.request.method !== "GET") return;

  // La API de Google y su inicio de sesión nunca se guardan.
  if (/googleapis\.com|accounts\.google\.com|gstatic\.com\/_\/|oauth2/.test(url.href)) return;

  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(APP).then(c => c.put("./index.html", copy)); return r; })
      .catch(() => caches.match("./index.html")));
    return;
  }

  // Librerías del CDN, fuentes e íconos: primero la caché.
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(APP).then(c => c.put(e.request, copy)); }
    return r;
  })));
});
