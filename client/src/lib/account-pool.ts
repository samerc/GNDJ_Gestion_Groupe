// ============================================================================
// Multi-account session pool for the member realm — powers "switch between sibling accounts".
//
// Holds the refresh token of EACH member account the user has authenticated on this device (the active one
// plus any siblings they've added). Once an account is in the pool, switching to it is instant (mint a fresh
// session from its stored refresh token — no password); the FIRST switch to a sibling still requires that
// account's password (which produces the pooled session). Keyed by memberId.
//
// Stored in the SAME backing store as the member tokens (see token-storage): localStorage when "remembered",
// else sessionStorage — so on a shared device (remember-me off) the remembered accounts are per-browser-session
// and vanish on close. Cleared on logout (leave the whole family on this device).
// ============================================================================

export interface PooledAccount {
  memberId: string
  name: string
  username: string
  refreshToken: string
}

const KEY = 'gndj.accountPool'

// sessionStorage only when the user explicitly opted OUT of "remember me"; else persistent localStorage
// (mirrors token-storage's rule so the pool lives beside the tokens).
function backing(): Storage {
  return localStorage.getItem('rememberMe') === 'false' ? sessionStorage : localStorage
}

function read(): Record<string, PooledAccount> {
  const raw = sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY)
  if (!raw) return {}
  try { return JSON.parse(raw) as Record<string, PooledAccount> } catch { return {} }
}

// Write clears BOTH stores first so exactly one store ever holds the pool (unambiguous after a remember-me flip).
function write(map: Record<string, PooledAccount>): void {
  for (const s of [localStorage, sessionStorage]) s.removeItem(KEY)
  backing().setItem(KEY, JSON.stringify(map))
}

export function getPool(): PooledAccount[] {
  return Object.values(read())
}

export function getPooledAccount(memberId: string): PooledAccount | undefined {
  return read()[memberId]
}

export function savePooledAccount(a: PooledAccount): void {
  if (!a.memberId || !a.refreshToken) return
  const map = read()
  map[a.memberId] = a
  write(map)
}

export function removePooledAccount(memberId: string): void {
  const map = read()
  delete map[memberId]
  write(map)
}

export function clearPool(): void {
  for (const s of [localStorage, sessionStorage]) s.removeItem(KEY)
}
