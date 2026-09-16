// ============================================================================
// "Voir comme" (impersonation) — client-side token slot.
//
// The admin's REAL member tokens stay untouched in the 'member' realm (token-storage). The impersonation
// access token lives in a SEPARATE sessionStorage slot; while it's present, the api-client attaches THIS
// token instead of the admin's, so the whole SPA behaves as the target member. Clearing the slot restores
// the admin instantly (their tokens were never moved). sessionStorage (not localStorage) so a powerful
// impersonation session never outlives the browser tab.
//
// Leaf module: imported by the non-React api-client. Keeps zero heavy imports so there's no import cycle
// with the store (which imports both this and the api-client).
// ============================================================================

const K = { access: 'imp.access', memberId: 'imp.memberId', memberName: 'imp.memberName' }

export interface ImpersonationTarget { memberId: string; memberName: string }

export function getImpersonationToken(): string | null {
  try { return sessionStorage.getItem(K.access) } catch { return null }
}

export function getImpersonationTarget(): ImpersonationTarget | null {
  try {
    const memberId = sessionStorage.getItem(K.memberId)
    const memberName = sessionStorage.getItem(K.memberName)
    return memberId && memberName ? { memberId, memberName } : null
  } catch { return null }
}

export function isImpersonating(): boolean {
  return !!getImpersonationToken()
}

export function setImpersonation(token: string, memberId: string, memberName: string): void {
  try {
    sessionStorage.setItem(K.access, token)
    sessionStorage.setItem(K.memberId, memberId)
    sessionStorage.setItem(K.memberName, memberName)
  } catch { /* private mode / blocked storage — impersonation just won't persist across a reload */ }
}

export function clearImpersonation(): void {
  try { for (const key of Object.values(K)) sessionStorage.removeItem(key) } catch { /* ignore */ }
}

// The api-client (non-React) calls triggerImpersonationExpiry() when an impersonation request 401s — the
// 60-min token lapsed or was rejected. The store registers a handler that exits back to the admin with a toast.
let onExpiry: (() => void) | null = null
export function registerImpersonationExpiryHandler(cb: () => void): void { onExpiry = cb }
export function triggerImpersonationExpiry(): void { onExpiry?.() }

// ── New-tab handoff ──────────────────────────────────────────────────────────
// "Voir comme" opens in a NEW browser tab so the admin keeps their own session in the original tab. The
// impersonation token lives in per-tab sessionStorage, so it can't be shared directly. The admin tab mints the
// token then drops a SHORT-LIVED handoff in localStorage (the only cross-tab channel); the new tab consumes it
// once (removes it immediately) into its own sessionStorage slot. localStorage is used ONLY as a <60s courier —
// the token never persists there. Works regardless of the admin's "remember me" (the new tab needs no admin auth;
// the impersonation token alone makes it the member).
export const IMPERSONATION_HANDOFF_KEY = 'imp.handoff'
// The result the admin tab hands to the new tab: either the minted token, or the error to display.
export interface ImpersonationHandoff {
  ok: boolean
  error?: string
  accessToken?: string
  memberId?: string
  memberName?: string
}

export function writeImpersonationHandoff(d: ImpersonationHandoff): void {
  try { localStorage.setItem(IMPERSONATION_HANDOFF_KEY, JSON.stringify({ ...d, ts: Date.now() })) } catch { /* ignore */ }
}

export function consumeImpersonationHandoff(): ImpersonationHandoff | null {
  try {
    const raw = localStorage.getItem(IMPERSONATION_HANDOFF_KEY)
    if (!raw) return null
    localStorage.removeItem(IMPERSONATION_HANDOFF_KEY) // single-use — remove before using
    const d = JSON.parse(raw)
    if (Date.now() - (d?.ts ?? 0) > 120_000) return null // stale (> 2 min)
    if (d?.ok && (!d.accessToken || !d.memberId)) return null // malformed success
    return { ok: !!d?.ok, error: d?.error, accessToken: d?.accessToken, memberId: d?.memberId, memberName: d?.memberName }
  } catch { return null }
}
