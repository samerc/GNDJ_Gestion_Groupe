// ============================================================================
// Persistent "who has signed in on this device" list — powers the Google-style « Choisir un compte »
// screen on /login.
//
// SEPARATE from the account POOL (lib/account-pool), which holds live refresh tokens for instant
// sibling-switching and is CLEARED on logout. This store keeps only the IDENTITY (name + username) and
// SURVIVES logout, so a returning member/parent picks their account from a list instead of retyping the
// synthetic prenom.nom@scouts.gndj username. Choosing an account still uses the pooled token if it's
// still live (instant) else falls back to the password / email-code (re-auth) — so a plain identity here
// grants NO access on its own.
//
// Backing store mirrors the token rule (see token-storage): localStorage when "Rester connecté" is on,
// else sessionStorage — so on a shared device (remember off) the list is per-browser-session and clears
// on close. The user can also remove an account explicitly from the chooser.
// ============================================================================

export interface DeviceAccount {
  memberId: string
  name: string
  username: string
  lastUsed: number
}

const KEY = 'gndj.deviceAccounts'

// sessionStorage only when the user explicitly opted OUT of "remember me"; else persistent localStorage.
function backing(): Storage {
  return localStorage.getItem('rememberMe') === 'false' ? sessionStorage : localStorage
}

function read(): Record<string, DeviceAccount> {
  const raw = sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY)
  if (!raw) return {}
  try { return JSON.parse(raw) as Record<string, DeviceAccount> } catch { return {} }
}

// Write clears BOTH stores first so exactly one store ever holds the list (unambiguous after a remember-me flip).
function write(map: Record<string, DeviceAccount>): void {
  for (const s of [localStorage, sessionStorage]) s.removeItem(KEY)
  backing().setItem(KEY, JSON.stringify(map))
}

// Most-recently-used first.
export function getDeviceAccounts(): DeviceAccount[] {
  return Object.values(read()).sort((a, b) => b.lastUsed - a.lastUsed)
}

// Upsert on every successful login (any method). Bumps lastUsed so the chooser orders by recency.
export function rememberDeviceAccount(a: { memberId: string; name: string; username: string }): void {
  if (!a.memberId) return
  const map = read()
  map[a.memberId] = { memberId: a.memberId, name: a.name, username: a.username, lastUsed: Date.now() }
  write(map)
}

export function removeDeviceAccount(memberId: string): void {
  const map = read()
  delete map[memberId]
  write(map)
}
