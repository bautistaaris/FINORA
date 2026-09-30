/* FINORA — Service Worker (PWA)
 *
 * === Política de cache ===
 *
 * IMPORTANTE: FINORA contiene datos financieros sensibles.
 * Esta política es DELIBERADAMENTE conservadora:
 *
 * ✅ Cachear (sólo assets públicos estáticos):
 *    - JS / CSS bundles de Next.js
 *    - Fonts (Google Fonts)
 *    - Imágenes / iconos del manifest
 *    - El manifest.json
 *
 * ❌ NO cachear NUNCA:
 *    - HTML (páginas autenticadas)
 *    - Respuestas de /api/* (datos financieros)
 *    - Cualquier respuesta autenticada
 *
 * Modo offline:
 *    - El SW sirve un fallback estático (/offline page estática)
 *    - NO se persisten snapshots financieros
 */
const CACHE_VERSION = "finora-static-v1";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const PRECACHE_URLS = [
  "/manifest.json",
  "/offline",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch(() => undefined),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

/**
 * Decide si una URL es "asset estático cacheable".
 * Es whitelist-based: si no está acá, NO se cachea.
 */
function isStaticAsset(url) {
  const p = url.pathname;
  // JS/CSS bundles
  if (p.startsWith("/_next/static/")) return true;
  // PWA assets
  if (p === "/manifest.json") return true;
  if (p.startsWith("/icons/")) return true;
  if (p === "/favicon.ico" || p === "/favicon.png" || p === "/favicon-16.png") return true;
  // Fonts (Google)
  if (url.host.includes("fonts.googleapis.com")) return true;
  if (url.host.includes("fonts.gstatic.com")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo GET
  if (req.method !== "GET") {
    // POST/PUT/DELETE: pasar directo, NO cachear
    event.respondWith(fetch(req).catch(() => new Response("Offline", { status: 503 })));
    return;
  }

  // === REGLAS CRÍTICAS: nunca cachear autenticado ===

  // 1. APIs: bypass total
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(req).catch(() => new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })));
    return;
  }

  // 2. HTML/navegaciones: NUNCA cachear (datos autenticados)
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req).catch(async () => {
        // Solo si realmente estamos offline y NO autenticados → mostrar /offline
        // Si autenticado y offline: mostrar fallback minimalista
        const offline = await caches.match("/offline");
        return offline ?? new Response("Offline", { status: 503 });
      }),
    );
    return;
  }

  // 3. Assets estáticos: cache-first (whitelist)
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
          }
          return res;
        }).catch(() => new Response("Offline", { status: 503 }));
      }),
    );
    return;
  }

  // 4. Todo lo demás: network-only (incluido: cualquier GET no listado arriba)
  event.respondWith(fetch(req).catch(() => new Response("Offline", { status: 503 })));
});

// Mensaje opcional desde la app para forzar update
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});