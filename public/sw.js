// Minimal service worker for PWA installability + push notifications.
// No caching — this is a live CRM. Always hit the network.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pure passthrough — always hit the network, never serve from a cache.
  event.respondWith(fetch(event.request));
});

// ── Push notification handler ─────────────────────────────────────────────────
// The server sends a push with JSON payload: { title, body, url }
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
