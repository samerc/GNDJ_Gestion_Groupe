// "Pas de connexion" banner: shown at the top of the app while the device is offline (the page is already loaded,
// so nothing reloads — but saving or loading data will fail until the connection is back). Disappears on its own
// when the browser reports the connection back. The offline PAGE for a fresh load lives in public/sw.js.
import { useSyncExternalStore } from 'react'
import { WifiOff } from 'lucide-react'

function subscribe(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb) }
}
const getOnline = () => navigator.onLine

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, getOnline, () => true)
  if (online) return null
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-sm font-medium text-amber-950">
      <WifiOff className="h-4 w-4" />
      Pas de connexion — les modifications ne peuvent pas être enregistrées pour l'instant.
    </div>
  )
}
