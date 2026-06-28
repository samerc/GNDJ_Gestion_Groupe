import { create } from 'zustand'
import apiClient from '@/lib/api-client'
import type { AuthResponse, LoginRequest, MeResponse, RegisterRequest, UnitAccess } from '@/types/auth'

interface AuthState {
  user: MeResponse | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (data: LoginRequest) => Promise<void>
  register: (data: RegisterRequest) => Promise<void>
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
    set({ isAuthenticated: true })
    await get().loadUser()
  },

  register: async (data: RegisterRequest) => {
    const { data: response } = await apiClient.post<AuthResponse>('/auth/register', data)
    localStorage.setItem('accessToken', response.accessToken)
    localStorage.setItem('refreshToken', response.refreshToken)
    set({ isAuthenticated: true })
    await get().loadUser()
  },

  logout: async () => {
    try {
      await apiClient.post('/auth/logout')
    } catch {
      // Ignore errors on logout
    }
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
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
