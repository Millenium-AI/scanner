/* CardScan service worker — offline app shell + installability.
 *
 * Strategy:
 *  • Navigations (HTML): network-first, fall back to cached "/" shell offline.
 *    This keeps a single-page-app working when launched from the home screen
 *    with no connection, while still picking up new deploys when online.
 *  • Static assets (_expo bundles, icons, fonts): cache-first.
 *  • Anything that isn't a GET, or that targets the identify backend, is passed
 *    straight through to the network and never cached (camera uploads, etc.).
 */

const CACHE_NAME = "cardscan-v2";
const SHELL_ASSETS = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET. Camera uploads (POST to /identify-card) bypass the SW.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept cross-origin requests (e.g. the identify backend / CDNs).
  if (url.origin !== self.location.origin) return;

  // Never touch the API.
  if (url.pathname.includes("/identify-card") || url.pathname.startsWith("/api/")) {
    return;
  }

  // Navigations → network-first with offline shell fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", clone)).catch(() => {});
          return response;
        })
        .catch(() => caches.match("/").then((c) => c ?? caches.match("/index.html")))
    );
    return;
  }

  // Static assets → cache-first, then populate cache.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return response;
        })
    )
  );
});
