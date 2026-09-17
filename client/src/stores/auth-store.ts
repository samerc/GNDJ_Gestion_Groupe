import { create } from 'zustand'
import axios from 'axios'
import apiClient from '@/lib/api-client'
import { API_BASE_URL } from '@/lib/constants'
import { queryClient } from '@/lib/query-client'
import { getAccessToken, getRefreshToken, setTokens, clearTokens, setRemember, getRemember } from '@/lib/token-storage'
import { savePooledAccount, getPooledAccount, removePooledAccount, clearPool } from '@/lib/account-pool'
import type { AuthResponse, LoginRequest, MeResponse, RegisterRequest, UnitAccess } from '@/types/auth'
import type { SettingDto } from '@/services/settings-service'

// One-shot bootstrap payload: profile + shell settings + sidebar badge counts. Collapses ~5 first-paint XHRs
// (/auth/me + 2 settings + 2 counts) into one; loadUser primes the query cache from it so the individual hooks
// read from cache instead of re-fetching.
interface BootstrapResponse {
  me: MeResponse
  roleColors: SettingDto | null
  scoutYear: SettingDto | null
  pendingDemandes: number
  pendingChangeRequests: number
}

interface AuthState {
  user: MeResponse | null
  isAuthenticated: boolean
  isLoading: boolean
  // rememberMe (default true): true → tokens persist in localStorage for ~30 days; false → sessionStorage
  // (cleared on browser close) for a shared device. Also sent to the server to pick the refresh-token window.
  login: (data: LoginRequest, rememberMe?: boolean) => Promise<void>
  register: (data: RegisterRequest) => Promise<void>
  applyTokens: (accessToken: string, refreshToken: string) => void
  logout: () => Promise<void>
  loadUser: () => Promise<void>
  // Account switching (siblings): switchToAccount mints a fresh session from a POOLED refresh token (instant,
  // no password) — throws 'NO_SESSION' if the account isn't pooled yet (the caller then prompts for its
  // password and calls addAndSwitchAccount, a login that keeps the current account in the pool to switch back).
  switchToAccount: (memberId: string) => Promise<void>
  addAndSwitchAccount: (username: string, password: string) => Promise<void>
  hasPermission: (permission: string) => boolean
  canAccessUnit: (unitId: string) => boolean
}

// Auth state for the member/chef/admin realm. Tokens live in local/sessionStorage per the "Rester
// connecté" choice (see lib/token-storage; read by api-client's interceptors); this store holds the
// decoded `user` (MeResponse) and the client-side authz helpers. isAuthenticated is seeded optimistically
// from a present token, then confirmed by loadUser.
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: !!getAccessToken('member'),
  isLoading: false,

  login: async (data: LoginRequest, rememberMe = true) => {
    // Record the choice BEFORE storing tokens so setTokens writes to the right backing store, and pass
    // it to the server so it issues a long (remembered) vs short (session) refresh token.
    setRemember('member', rememberMe)
    const { data: response } = await apiClient.post<AuthResponse>('/auth/login', { ...data, rememberMe })
    setTokens('member', response.accessToken, response.refreshToken)
    // Drop any cached data from a previous session so one account never sees another's data (defense-in-depth
    // alongside the logout clear — covers a direct account switch without an intervening logout).
    queryClient.clear()
    set({ isAuthenticated: true })
    await get().loadUser()
  },

  register: async (data: RegisterRequest) => {
    setRemember('member', true)
    const { data: response } = await apiClient.post<AuthResponse>('/auth/register', data)
    setTokens('member', response.accessToken, response.refreshToken)
    queryClient.clear()
    set({ isAuthenticated: true })
    await get().loadUser()
  },

  // Persist a freshly-rotated token pair (e.g. after "sign out other devices") so this device keeps its
  // session while the previous refresh token — held by other devices — is now dead.
  applyTokens: (accessToken: string, refreshToken: string) => {
    setTokens('member', accessToken, refreshToken)
    set({ isAuthenticated: true })
  },

  logout: async () => {
    try {
      await apiClient.post('/auth/logout')
    } catch {
      // Ignore errors on logout
    }
    clearTokens('member')
    // Leaving = drop every remembered family account on this device (shared-device safe; a parent who wants to
    // keep siblings switches instead of logging out).
    clearPool()
    // Wipe the TanStack Query cache so the NEXT user in this tab never sees the previous user's data (SPA
    // login/logout doesn't reload the page, so the cache would otherwise persist across accounts).
    queryClient.clear()
    set({ user: null, isAuthenticated: false })
  },

  // Instant switch to a sibling already in the token pool: mint a fresh session from its stored refresh token.
  // The current account is snapshotted into the pool first (with its freshest token) so switching back works.
  switchToAccount: async (memberId: string) => {
    const cur = get().user
    const curToken = getRefreshToken('member')
    if (cur && curToken) savePooledAccount({ memberId: cur.memberId, name: `${cur.firstName} ${cur.lastName}`, username: cur.email, refreshToken: curToken })

    const target = getPooledAccount(memberId)
    if (!target?.refreshToken) throw new Error('NO_SESSION') // not remembered yet → caller prompts for the password

    try {
      // Bare axios (not apiClient) so the current account's interceptor can't hijack this cross-account refresh.
      const { data } = await axios.post<AuthResponse>(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken: target.refreshToken, rememberMe: getRemember('member') },
        { headers: { 'Content-Type': 'application/json' } },
      )
      setTokens('member', data.accessToken, data.refreshToken)
      savePooledAccount({ ...target, refreshToken: data.refreshToken })
      queryClient.clear()
      set({ isAuthenticated: true })
      await get().loadUser()
    } catch (e) {
      // Stored token is stale/expired (e.g. the sibling logged in elsewhere) → forget it and ask for the password.
      if (axios.isAxiosError(e) && (e.response?.status === 401 || e.response?.status === 403)) {
        removePooledAccount(memberId)
        throw new Error('NO_SESSION', { cause: e })
      }
      throw e
    }
  },

  // First switch to a sibling on this device: a normal login for that account. The CURRENT account is pooled
  // first so it stays switchable; the new account is then the active session and gets pooled too (loadUser
  // fills its display name).
  addAndSwitchAccount: async (username: string, password: string) => {
    const cur = get().user
    const curToken = getRefreshToken('member')
    if (cur && curToken) savePooledAccount({ memberId: cur.memberId, name: `${cur.firstName} ${cur.lastName}`, username: cur.email, refreshToken: curToken })

    const rememberMe = getRemember('member')
    const { data } = await apiClient.post<AuthResponse>('/auth/login', { email: username, password, rememberMe })
    setTokens('member', data.accessToken, data.refreshToken)
    savePooledAccount({ memberId: data.memberId, name: username, username, refreshToken: data.refreshToken })
    queryClient.clear()
    set({ isAuthenticated: true })
    await get().loadUser()
  },

  // Fetch /auth/bootstrap to hydrate the user (perms + unit access) AND prime the shell's config/count queries
  // in one round-trip; clears the session if the token is bad. (/auth/me still exists for API integrations.)
  loadUser: async () => {
    set({ isLoading: true })
    try {
      const { data } = await apiClient.get<BootstrapResponse>('/auth/bootstrap')
      set({ user: data.me, isAuthenticated: true, isLoading: false })
      // Keep the active account in the switch pool with its freshest refresh token + real display name, so
      // switching away (and back) works and the switcher can label it.
      const rt = getRefreshToken('member')
      if (rt) savePooledAccount({ memberId: data.me.memberId, name: `${data.me.firstName} ${data.me.lastName}`, username: data.me.email, refreshToken: rt })
      // Prime the query cache so the header/sidebar/dashboard hooks read from cache instead of each firing
      // their own XHR on first paint. Keys must match the consuming hooks exactly. staleTime on those hooks
      // then prevents an immediate refetch; explicit invalidation on write keeps them correct afterward.
      if (data.roleColors) queryClient.setQueryData(['settings', 'ui.role_colors'], data.roleColors)
      if (data.scoutYear) queryClient.setQueryData(['settings', 'passage.scout_year'], data.scoutYear)
      queryClient.setQueryData(['demandes', 'pending-count'], data.pendingDemandes)
      queryClient.setQueryData(['change-requests', 'pending', 'count'], data.pendingChangeRequests)
    } catch (e) {
      set({ isLoading: false })
      // Only drop the session on a genuine auth rejection (401/403 — the api-client already tried to
      // refresh first). A network error / timeout (common on mobile) must NOT wipe the tokens: keep the
      // optimistically-authenticated state and let the queries retry, otherwise a flaky connection logs
      // the user out on every app resume despite "remember me".
      if (axios.isAxiosError(e) && (e.response?.status === 401 || e.response?.status === 403)) {
        set({ user: null, isAuthenticated: false })
        clearTokens('member')
      }
    }
  },

  // Client-side gate (UI only — server re-checks every request). Super admin passes everything.
  hasPermission: (permission: string) => {
    const { user } = get()
    if (!user) return false
    if (user.isSuperAdmin) return true
    return user.permissions.includes(permission)
  },

  // True if the user may act on this unit (super admin = all; others = their assigned unitAccess).
  canAccessUnit: (unitId: string) => {
    const { user } = get()
    if (!user) return false
    if (user.isSuperAdmin) return true
    return user.unitAccess.some((u: UnitAccess) => u.unitId === unitId)
  },
}))
