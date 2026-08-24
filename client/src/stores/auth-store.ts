import { create } from 'zustand'
import apiClient from '@/lib/api-client'
import { queryClient } from '@/lib/query-client'
import type { AuthResponse, LoginRequest, MeResponse, RegisterRequest, UnitAccess } from '@/types/auth'

interface AuthState {
  user: MeResponse | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (data: LoginRequest) => Promise<void>
  register: (data: RegisterRequest) => Promise<void>
  applyTokens: (accessToken: string, refreshToken: string) => void
  logout: () => Promise<void>
  loadUser: () => Promise<void>
  hasPermission: (permission: string) => boolean
  canAccessUnit: (unitId: string) => boolean
}

// Auth state for the member/chef/admin realm. Tokens live in localStorage (read by api-client's
// interceptors); this store holds the decoded `user` (MeResponse) and exposes the client-side authz
// helpers. isAuthenticated is seeded optimistically from a present token, then confirmed by loadUser.
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('accessToken'),
  isLoading: false,

  login: async (data: LoginRequest) => {
    const { data: response } = await apiClient.post<AuthResponse>('/auth/login', data)
    localStorage.setItem('accessToken', response.accessToken)
    localStorage.setItem('refreshToken', response.refreshToken)
    // Drop any cached data from a previous session so one account never sees another's data (defense-in-depth
    // alongside the logout clear — covers a direct account switch without an intervening logout).
    queryClient.clear()
    set({ isAuthenticated: true })
    await get().loadUser()
  },

  register: async (data: RegisterRequest) => {
    const { data: response } = await apiClient.post<AuthResponse>('/auth/register', data)
    localStorage.setItem('accessToken', response.accessToken)
    localStorage.setItem('refreshToken', response.refreshToken)
    queryClient.clear()
    set({ isAuthenticated: true })
    await get().loadUser()
  },

  // Persist a freshly-rotated token pair (e.g. after "sign out other devices") so this device keeps its
  // session while the previous refresh token — held by other devices — is now dead.
  applyTokens: (accessToken: string, refreshToken: string) => {
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
    set({ isAuthenticated: true })
  },

  logout: async () => {
    try {
      await apiClient.post('/auth/logout')
    } catch {
      // Ignore errors on logout
    }
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    // Wipe the TanStack Query cache so the NEXT user in this tab never sees the previous user's data (SPA
    // login/logout doesn't reload the page, so the cache would otherwise persist across accounts).
    queryClient.clear()
    set({ user: null, isAuthenticated: false })
  },

  // Fetch /auth/me to hydrate the user (perms + unit access); clears the session if the token is bad.
  loadUser: async () => {
    set({ isLoading: true })
    try {
      const { data } = await apiClient.get<MeResponse>('/auth/me')
      set({ user: data, isAuthenticated: true, isLoading: false })
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false })
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
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
