import { getAccessToken } from './token-storage'

// Reports a client-side error to the backend (which alerts the super-admin) and returns the reference the
// user can quote. Best-effort: never throws. Uses a bare fetch (not the axios client) so its own failure —
// or a 401 — can't trigger the client's refresh/redirect interceptors. Throttled by message signature so a
// repeating crash doesn't hammer the endpoint (the backend also dedupes before emailing).
const recentlyReported = new Map<string, number>()
const THROTTLE_MS = 30_000

export interface ClientErrorInput {
  message: string
  detail?: string
  url?: string
}

export async function reportClientError(input: ClientErrorInput): Promise<string | null> {
  try {
    const token = getAccessToken('member')
    if (!token) return null // the report endpoint is auth-only; skip for signed-out sessions

    const sig = (input.message || '').slice(0, 120)
    const now = Date.now()
    const last = recentlyReported.get(sig)
    if (last && now - last < THROTTLE_MS) return null
    recentlyReported.set(sig, now)

    const res = await fetch('/api/v1/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        message: (input.message || '(sans message)').slice(0, 500),
        detail: (input.detail || '').slice(0, 4000),
        url: input.url ?? location.href,
      }),
    })
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    return (data?.errorId as string) ?? null
  } catch {
    return null
  }
}

// True for errors we deliberately DON'T alert the admin about from the global handlers: already-handled API
// errors (they surface friendly messages in the UI via parseApiError) and benign browser noise.
export function isBenignError(reason: unknown): boolean {
  if (!reason) return true
  const r = reason as { isAxiosError?: boolean; config?: unknown; response?: unknown; message?: string }
  if (r.isAxiosError || r.config || r.response) return true // an axios/API error — handled in the UI layer
  const msg = String(r.message ?? reason)
  if (msg.includes('ResizeObserver')) return true // harmless layout-loop warning browsers emit
  return false
}
