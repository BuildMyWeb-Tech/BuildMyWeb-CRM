// PWA Service Worker — offline-first for key CRM pages, network-first for API/dynamic data

const CACHE_VERSION = "bmw-crm-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;

// Key pages to cache for offline access
const PRECACHE_ROUTES = [
  "/",
  "/client-leads",
  "/daily-tasks",
  "/notifications",
  "/broadcasts",
  "/contacts",
  "/offline",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(["/offline", "/icons/icon-192.png", "/icons/icon-512.png"]).catch(() => {})
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, cross-origin, API, auth, Supabase requests
  if (request.method !== "GET") return;
  if (!url.origin.includes(self.location.origin)) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
  if (url.hostname.includes("supabase") || url.hostname.includes("facebook")) return;

  // Network-first for _next (JS/CSS chunks) — fallback to cache on failure
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(request, clone)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // For key CRM pages: network-first, cache on success, serve cached version offline
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && PRECACHE_ROUTES.some((r) => url.pathname === r || url.pathname.startsWith(r + "/"))) {
          const clone = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          return caches.match("/offline").then((offlinePage) => offlinePage ?? new Response("Offline", { status: 503 }));
        });
      })
  );
});

// ── Push notification handler ─────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = { title: "BuildMyWeb CRM", body: "", url: "/" };
  try { payload = { ...payload, ...event.data.json() }; } catch { /* ignore */ }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url },
    })
  );
});

// ── Notification click handler ────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
