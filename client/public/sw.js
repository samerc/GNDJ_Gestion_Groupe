// Minimal service worker: makes the app INSTALLABLE (Chrome/Edge require a registered SW with a fetch handler),
// shows an "offline" page when a page can't be loaded, and handles Web Push. We deliberately do NOT cache: this
// is a live, network-dependent app (auth + API), so an offline cache would risk serving stale pages/data.
// Bump SW_VERSION to force an update on all clients.
const SW_VERSION = 'gndj-v2'

self.addEventListener('install', () => {
  // Activate the new SW immediately instead of waiting for all tabs to close.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Take control of open pages right away.
  event.waitUntil(self.clients.claim())
})

// Shown instead of the browser's error page when a PAGE can't be loaded (no connection). Self-contained (no
// network needed): retries on its own as soon as the connection is back, or with the button.
const OFFLINE_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Pas de connexion — GNDJ Scout</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f6f7fb;color:#1c2b4a}
  @media (prefers-color-scheme:dark){body{background:#0f172a;color:#e2e8f0}.card{background:#1e293b!important}}
  .card{max-width:360px;text-align:center;background:#fff;border-radius:16px;padding:32px 24px;
    box-shadow:0 4px 24px rgba(0,0,0,.08)}
  h1{font-size:20px;margin:16px 0 8px}p{margin:0 0 20px;line-height:1.5;opacity:.75}
  button{background:#1c2b4a;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:15px;cursor:pointer}
</style></head><body><div class="card">
<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
 stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/>
<path d="M2 8.82a15 15 0 0 1 4.17-2.65"/><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"/>
<path d="M16.85 11.25a10 10 0 0 1 2.22 1.68"/><path d="M5 13a10 10 0 0 1 5.24-2.76"/><path d="m2 2 20 20"/></svg>
<h1>Pas de connexion</h1>
<p>Vérifiez votre connexion internet. La page se rechargera automatiquement dès que la connexion revient.</p>
<button onclick="location.reload()">Réessayer</button></div>
<script>addEventListener('online',function(){location.reload()})</script></body></html>`

// Pages (navigations) go to the network; if that fails, answer with the offline page. Everything else (API,
// assets) passes straight through — the app shows its own errors / "Pas de connexion" banner for those.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(() =>
    new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })))
})

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
