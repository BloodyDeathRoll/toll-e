// Minimal service worker, hand-written on purpose: Chrome only fires
// `beforeinstallprompt` when a worker with a fetch handler is registered, and
// that installability is all we need here. It deliberately does NOT cache app
// shell or API responses — toll-e shows money and live quotes, and a stale
// portfolio value served from a cache would be worse than an offline message.

const VERSION = 'toll-e-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop anything an earlier version of this worker may have cached.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Pass-through: required for installability, intentionally not a cache layer.
self.addEventListener('fetch', () => {});
