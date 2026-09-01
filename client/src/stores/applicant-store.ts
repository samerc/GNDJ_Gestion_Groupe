import { create } from 'zustand'
import applicantApi from '@/lib/applicant-api-client'
import { queryClient } from '@/lib/query-client'
import { getAccessToken, setTokens, clearTokens, setRemember } from '@/lib/token-storage'

interface ApplicantAuthResponse {
  accountId: string
  email: string
  emailVerified: boolean
  accessToken: string
  refreshToken: string
  expiresAt: string
}

interface ApplicantState {
  isAuthenticated: boolean
  email: string | null
  emailVerified: boolean
  // rememberMe (default true): true → localStorage (persist ~30 days); false → sessionStorage (cleared on close).
  login: (email: string, password: string, website?: string, rememberMe?: boolean) => Promise<void>
  register: (email: string, password: string, contactName?: string, website?: string, acceptedTerms?: boolean) => Promise<void>
  logout: () => void
  setEmailVerified: (v: boolean) => void
}

// Auth state for the public enrollment portal — fully isolated from the member auth store (own tokens,
// own /applicant endpoints, no permissions/units; `website` is the honeypot field).
export const useApplicantStore = create<ApplicantState>((set) => ({
  isAuthenticated: !!getAccessToken('applicant'),
  email: null,
  emailVerified: false,

  login: async (email, password, website, rememberMe = true) => {
    setRemember('applicant', rememberMe)
    const { data } = await applicantApi.post<ApplicantAuthResponse>('/applicant/login', { email, password, website, rememberMe })
    setTokens('applicant', data.accessToken, data.refreshToken)
    queryClient.clear() // drop any prior session's cache (shared query client with the member realm)
    set({ isAuthenticated: true, email: data.email, emailVerified: data.emailVerified })
  },

  register: async (email, password, contactName, website, acceptedTerms) => {
    setRemember('applicant', true)
    const { data } = await applicantApi.post<ApplicantAuthResponse>('/applicant/register', { email, password, contactName, website, acceptedTerms })
    setTokens('applicant', data.accessToken, data.refreshToken)
    queryClient.clear()
    set({ isAuthenticated: true, email: data.email, emailVerified: data.emailVerified })
  },

  logout: () => {
    clearTokens('applicant')
    queryClient.clear() // wipe cache so the next account in this tab sees none of the previous one's data
    set({ isAuthenticated: false, email: null, emailVerified: false })
  },

  setEmailVerified: (v) => set({ emailVerified: v }),
}))
