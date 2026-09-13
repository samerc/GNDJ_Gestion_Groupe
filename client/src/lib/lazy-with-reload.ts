import { lazy, type ComponentType } from 'react'

// A dynamic-import failure whose message matches these = a stale-deploy chunk error: after a redeploy Vite emits
// new content-hashed chunk filenames, so a browser still running the OLD index.html requests a chunk that now
// 404s. It is NOT a real bug — a full reload fetches the fresh index.html (new chunk names) and fixes it.
export function isChunkLoadError(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e)
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Importing a module script failed')
  )
}

// Only reload if we haven't just reloaded — a genuine failure (offline, real 500 on the chunk) must not loop.
const RELOAD_KEY = 'chunk-reload-at'
const RELOAD_GUARD_MS = 10_000

// Drop-in replacement for React.lazy that self-heals a stale-deploy chunk error by reloading the page once to
// pick up the fresh index.html. App.tsx imports it aliased as `lazy`, so every route uses it transparently.
export function lazyWithReload<T extends ComponentType<Record<string, never>>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory()
    } catch (e) {
      if (isChunkLoadError(e)) {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
        if (Date.now() - last > RELOAD_GUARD_MS) {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
          window.location.reload()
          // Never resolve — keep the Suspense fallback showing until the reload swaps the page out.
          return await new Promise<{ default: T }>(() => {})
        }
      }
      throw e
    }
  })
}
