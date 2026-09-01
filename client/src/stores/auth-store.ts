import { create } from 'zustand'
import axios from 'axios'
import apiClient from '@/lib/api-client'
import { queryClient } from '@/lib/query-client'
import { getAccessToken, setTokens, clearTokens, setRemember } from '@/lib/token-storage'
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
    // Wipe the TanStack Query cache so the NEXT user in this tab never sees the previous user's data (SPA
    // login/logout doesn't reload the page, so the cache would otherwise persist across accounts).
    queryClient.clear()
    set({ user: null, isAuthenticated: false })
  },

  // Fetch /auth/bootstrap to hydrate the user (perms + unit access) AND prime the shell's config/count queries
  // in one round-trip; clears the session if the token is bad. (/auth/me still exists for API integrations.)
  loadUser: async () => {
    set({ isLoading: true })
    try {
      const { data } = await apiClient.get<BootstrapResponse>('/auth/bootstrap')
      set({ user: data.me, isAuthenticated: true, isLoading: false })
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
