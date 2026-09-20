// Minimal service worker — its only job is to make the app INSTALLABLE (Chrome/Edge require a registered SW
// with a fetch handler before they offer "Install"). We deliberately do NOT cache: this is a live,
// network-dependent app (auth + API), so an offline cache would risk serving stale pages/data. Every request
// just passes through to the network. Bump SW_VERSION to force an update on all clients.
const SW_VERSION = 'gndj-v1'

self.addEventListener('install', () => {
  // Activate the new SW immediately instead of waiting for all tabs to close.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Take control of open pages right away.
  event.waitUntil(self.clients.claim())
})

// A fetch handler is required for installability. Network passthrough (no caching).
self.addEventListener('fetch', () => { /* default network behaviour */ })
