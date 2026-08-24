import { create } from 'zustand'
import applicantApi, { APPLICANT_ACCESS_KEY, APPLICANT_REFRESH_KEY } from '@/lib/applicant-api-client'
import { queryClient } from '@/lib/query-client'

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
  register: (email: string, password: string, contactName?: string, website?: string, acceptedTerms?: boolean) => Promise<void>
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
    queryClient.clear() // drop any prior session's cache (shared query client with the member realm)
    set({ isAuthenticated: true, email: data.email, emailVerified: data.emailVerified })
  },

  register: async (email, password, contactName, website, acceptedTerms) => {
    const { data } = await applicantApi.post<ApplicantAuthResponse>('/applicant/register', { email, password, contactName, website, acceptedTerms })
    persist(data)
    queryClient.clear()
    set({ isAuthenticated: true, email: data.email, emailVerified: data.emailVerified })
  },

  logout: () => {
    localStorage.removeItem(APPLICANT_ACCESS_KEY)
    localStorage.removeItem(APPLICANT_REFRESH_KEY)
    queryClient.clear() // wipe cache so the next account in this tab sees none of the previous one's data
    set({ isAuthenticated: false, email: null, emailVerified: false })
  },

  setEmailVerified: (v) => set({ emailVerified: v }),
}))
