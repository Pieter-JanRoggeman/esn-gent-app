// ESN Gent Events — service worker (v2: offline tickets)
//
// Strategy:
// - Same-origin files: network-first, cache fallback (always fresh, works offline).
// - CDN dependencies (Firebase SDK, QR libraries, fonts): cache-first with
//   background refresh — these are what let the installed app BOOT offline.
// - Firestore data itself is handled by Firestore's persistent local cache
//   (enabled in app.js), so previously-viewed tickets render offline too.

const CACHE = "esn-events-v90";

const CORE = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/config.js",
  "/calendar-config.js",
  "/logo.png",
  "/logo-white.png",
  "/esn-star.png",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/badge.png",
  "/jacob.png",
];

const CDN_PRECACHE = [
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js",
  "https://cdn.jsdelivr.net/npm/jsbarcode@3/dist/JsBarcode.all.min.js",
];

// Cross-origin hosts we cache at runtime (fonts resolve to changing URLs)
const CDN_HOSTS = [
  "www.gstatic.com",
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "firebasestorage.googleapis.com", // event/merch images — offline + instant repeat views
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(CORE);
      // CDN files individually, so one failure doesn't abort the install
      await Promise.all(
        CDN_PRECACHE.map((url) => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Same-origin: network-first so updates arrive, cache when offline.
  if (url.origin === self.location.origin) {
    // Clean-URL navigations (/event/x, /calendar, …) all serve the app
    // shell — cache it under ONE key so offline keeps working everywhere.
    if (request.mode === "navigate") {
      event.respondWith(
        fetch(request)
          .then((response) => {
            // Refresh the offline shell only from the canonical "/" —
            // /event/* responses carry event-specific og tags (eventPage fn).
            if (url.pathname === "/") {
              const copy = response.clone();
              caches.open(CACHE).then((c) => c.put("/index.html", copy));
            }
            return response;
          })
          .catch(() => caches.match("/index.html"))
      );
      return;
    }
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/index.html"))
        )
    );
    return;
  }

  // Allow-listed CDNs: cache-first (instant + offline), refresh in background.
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            caches.open(CACHE).then((c) => c.put(request, response.clone()));
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
  // Everything else (Firestore/Auth API traffic, Stripe, Maps…): untouched.
});

// ---- Push notifications (v0.81) ----
// The Cloud Functions send DATA-ONLY FCM messages ({title, body, link}),
// so this worker is the single place that renders them.
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { /* not JSON */ }
  const data = d.data || d; // FCM wraps our payload under .data
  const title = data.title || "ESN Gent";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      // Android status bar renders the badge as a monochrome silhouette —
      // it must be a transparent PNG (a full square shows as a white block).
      badge: "/badge.png",
      tag: data.category || undefined, // newer message replaces older of same type
      data: { link: data.link || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(link);
          return c.focus();
        }
      }
      return clients.openWindow(link);
    })
  );
});
