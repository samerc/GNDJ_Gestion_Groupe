// ============================================================================
// Centralized auth-token storage for BOTH realms (member + applicant).
//
// "Rester connecté" (remember me), default ON:
//   • ON  → tokens in localStorage  → survive a browser/tab restart (persistent login, ~30 days).
//   • OFF → tokens in sessionStorage → cleared when the browser closes (shared-device mode).
//
// The choice itself is persisted in localStorage (a non-sensitive flag) so that later reads and the
// silent token refresh use the SAME backing store as the original login. Reads check sessionStorage
// first then localStorage; on write we clear BOTH stores first so a stale token can never shadow the
// fresh one. This is the single place tokens are read/written — api clients, the auth stores and the
// session-warning timer all go through it, so the localStorage/sessionStorage decision lives in one spot.
// ============================================================================

export type Realm = 'member' | 'applicant'

const KEYS: Record<Realm, { access: string; refresh: string; remember: string }> = {
  member: { access: 'accessToken', refresh: 'refreshToken', remember: 'rememberMe' },
  applicant: { access: 'applicantAccessToken', refresh: 'applicantRefreshToken', remember: 'applicantRememberMe' },
}

// Which store backs this realm right now — sessionStorage only when the user explicitly chose NOT to be
// remembered (flag === 'false'); everything else (incl. no flag yet) defaults to persistent localStorage.
function backing(realm: Realm): Storage {
  return localStorage.getItem(KEYS[realm].remember) === 'false' ? sessionStorage : localStorage
}

// Remember-me preference (default true when never set). Sent to the server on refresh so a rotated
// token keeps the long (remembered) vs short (session) expiry.
export function getRemember(realm: Realm): boolean {
  return localStorage.getItem(KEYS[realm].remember) !== 'false'
}

export function setRemember(realm: Realm, value: boolean): void {
  localStorage.setItem(KEYS[realm].remember, String(value))
}

export function getAccessToken(realm: Realm): string | null {
  return sessionStorage.getItem(KEYS[realm].access) ?? localStorage.getItem(KEYS[realm].access)
}

export function getRefreshToken(realm: Realm): string | null {
  return sessionStorage.getItem(KEYS[realm].refresh) ?? localStorage.getItem(KEYS[realm].refresh)
}

// Write a fresh token pair into the chosen backing store. Clears BOTH stores first so exactly one
// store ever holds tokens (keeps the read helpers unambiguous across a remember-me change).
export function setTokens(realm: Realm, accessToken: string, refreshToken: string): void {
  const k = KEYS[realm]
  for (const s of [localStorage, sessionStorage]) { s.removeItem(k.access); s.removeItem(k.refresh) }
  const store = backing(realm)
  store.setItem(k.access, accessToken)
  store.setItem(k.refresh, refreshToken)
}

export function clearTokens(realm: Realm): void {
  const k = KEYS[realm]
  for (const s of [localStorage, sessionStorage]) { s.removeItem(k.access); s.removeItem(k.refresh) }
}
