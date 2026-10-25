/* Prezio · guardián del equipo sin internet (alcance: /equipo).
   - La página /equipo: primero internet; sin internet, la última guardada.
   - Archivos de la app (/_next/static, con nombre único por versión): guardados una vez.
   - Logo y QR (Supabase Storage): se muestran los guardados y se renuevan por detrás.
   Los precios no pasan por aquí: los guarda la app en el equipo (IndexedDB). */
const CACHE = "prezio-equipo-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("prezio-equipo-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// La página avisa qué archivos usa esta versión: se guardan y se borran los de versiones viejas.
self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.tipo !== "guardar" || !Array.isArray(d.urls)) return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const quiero = new Set(d.urls.map((u) => new URL(u, self.location.origin).href));
    for (const u of quiero) {
      if (!(await cache.match(u))) await cache.add(new Request(u, { cache: "reload" })).catch(() => {});
    }
    for (const r of await cache.keys()) {
      if (r.url.includes("/_next/static/") && !quiero.has(r.url)) await cache.delete(r);
    }
  })());
});

function esImagenMarca(url) { return /\/storage\/v1\/object\/public\/marcas\//.test(url.pathname); }

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate" && url.origin === self.location.origin && url.pathname.startsWith("/equipo")) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const r = await fetch(req);
        if (r.ok) await cache.put("/equipo", r.clone());
        return r;
      } catch {
        return (await cache.match("/equipo")) || Response.error();
      }
    })());
    return;
  }

  const propio = url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/iconos/") || url.pathname === "/manifest.webmanifest");
  if (propio) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const guardado = await cache.match(req);
      if (guardado) return guardado;
      const r = await fetch(req);
      if (r.ok) await cache.put(req, r.clone());
      return r;
    })());
    return;
  }

  if (esImagenMarca(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const guardado = await cache.match(req);
      const nuevo = fetch(req).then(async (r) => {
        if (r.ok || r.type === "opaque") await cache.put(req, r.clone());
        return r;
      }).catch(() => null);
      return guardado || (await nuevo) || Response.error();
    })());
  }
});
