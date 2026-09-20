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

// Web Push: show the notification the server sent (payload = {title, body, url, type}). Even when the app is
// closed, the browser wakes this SW to run this handler.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = { title: event.data && event.data.text() } }
  const title = data.title || 'GNDJ Scout'
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
    tag: data.type || undefined, // same-tag notifications replace each other instead of stacking
    renotify: !!data.type,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Tapping a notification focuses an open tab (navigating it to the link) or opens a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clientsArr) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client && url) { try { await client.navigate(url) } catch (e) { /* cross-origin guard */ } }
        return
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url)
  })())
})
