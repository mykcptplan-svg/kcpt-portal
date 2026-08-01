/* Lifecycle-only service worker. No fetch interception, no caching,
 * and installability comes from the web app manifest (Chrome/iOS). */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
