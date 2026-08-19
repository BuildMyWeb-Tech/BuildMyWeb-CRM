// Minimal service worker — exists ONLY to satisfy the browser
// installability requirement for "Add to Home Screen" (Chrome/
// Android specifically checks for a registered service worker with
// a fetch handler before offering the install prompt).
//
// Deliberately does NOT cache anything. This is a live CRM —
// contacts, deals, tasks, messages all change constantly. A service
// worker that caches responses would risk showing stale data after
// reconnecting, which is worse than no offline support at all.
// If real offline support is ever wanted, that's a separate,
// deliberate feature — not a side effect of enabling "Install app".

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