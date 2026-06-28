import { create } from 'zustand'
import applicantApi, { APPLICANT_ACCESS_KEY, APPLICANT_REFRESH_KEY } from '@/lib/applicant-api-client'

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
  login: (email: string, password: string, website?: string) => Promise<void>
  register: (email: string, password: string, contactName?: string, website?: string) => Promise<void>
  logout: () => void
  setEmailVerified: (v: boolean) => void
}

// Save applicant tokens under the portal-specific keys (read by applicant-api-client).
function persist(data: ApplicantAuthResponse) {
  localStorage.setItem(APPLICANT_ACCESS_KEY, data.accessToken)
  localStorage.setItem(APPLICANT_REFRESH_KEY, data.refreshToken)
}

// Auth state for the public enrollment portal — fully isolated from the member auth store (own tokens,
// own /applicant endpoints, no permissions/units; `website` is the honeypot field).
export const useApplicantStore = create<ApplicantState>((set) => ({
  isAuthenticated: !!localStorage.getItem(APPLICANT_ACCESS_KEY),
  email: null,
  emailVerified: false,

  login: async (email, password, website) => {
    const { data } = await applicantApi.post<ApplicantAuthResponse>('/applicant/login', { email, password, website })
    persist(data)
    set({ isAuthenticated: true, email: data.email, emailVerified: data.emailVerified })
  },

  register: async (email, password, contactName, website) => {
    const { data } = await applicantApi.post<ApplicantAuthResponse>('/applicant/register', { email, password, contactName, website })
    persist(data)
    set({ isAuthenticated: true, email: data.email, emailVerified: data.emailVerified })
  },

  logout: () => {
    localStorage.removeItem(APPLICANT_ACCESS_KEY)
    localStorage.removeItem(APPLICANT_REFRESH_KEY)
    set({ isAuthenticated: false, email: null, emailVerified: false })
  },

  setEmailVerified: (v) => set({ emailVerified: v }),
}))
