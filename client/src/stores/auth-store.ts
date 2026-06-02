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

  hasPermission: (permission: string) => {
    const { user } = get()
    if (!user) return false
    if (user.isSuperAdmin) return true
    return user.permissions.includes(permission)
  },

  canAccessUnit: (unitId: string) => {
    const { user } = get()
    if (!user) return false
    if (user.isSuperAdmin) return true
    return user.unitAccess.some((u: UnitAccess) => u.unitId === unitId)
  },
}))
