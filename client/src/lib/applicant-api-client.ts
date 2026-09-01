import axios from 'axios'
import { API_BASE_URL } from './constants'
import { getAccessToken, getRefreshToken, setTokens, clearTokens, getRemember } from './token-storage'

// Isolated axios client for the public applicant portal. Uses its own token storage so it never
// interferes with the member/admin session.
const applicantApi = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Kept for back-compat with any importers; the actual storage keys/backing live in token-storage.
export const APPLICANT_ACCESS_KEY = 'applicantAccessToken'
export const APPLICANT_REFRESH_KEY = 'applicantRefreshToken'

// Single-flight refresh guard (same pattern as api-client) — refreshes via /applicant/refresh and
// redirects to /inscription/login (not /login) on failure.
let isRefreshing = false
let queue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = []
function flush(error: unknown, token: string | null) {
  queue.forEach(({ resolve, reject }) => (error ? reject(error) : resolve(token!)))
  queue = []
}

applicantApi.interceptors.request.use((config) => {
  const token = getAccessToken('applicant')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

applicantApi.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config
    // A 401 from the auth endpoints THEMSELVES (login/register/refresh) means bad credentials or a
    // not-yet-authenticated user — surface it to the page (inline error) instead of treating it as an
    // expired session and hard-redirecting, which reloads the page and wipes the error before it's read.
    const isAuthEndpoint = /\/applicant\/(login|register|refresh)/.test(original?.url ?? '')
    if (error.response?.status !== 401 || original._retry || isAuthEndpoint) return Promise.reject(error)

    const refreshToken = getRefreshToken('applicant')
    if (!refreshToken) {
      clearTokens('applicant')
      window.location.href = '/inscription/login'
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => queue.push({ resolve, reject })).then((token) => {
        original.headers.Authorization = `Bearer ${token}`
        return applicantApi(original)
      })
    }

    isRefreshing = true
    original._retry = true
    try {
      const { data } = await axios.post(`${API_BASE_URL}/applicant/refresh`, { refreshToken, rememberMe: getRemember('applicant') }, { headers: { 'Content-Type': 'application/json' } })
      setTokens('applicant', data.accessToken, data.refreshToken)
      flush(null, data.accessToken)
      original.headers.Authorization = `Bearer ${data.accessToken}`
      return applicantApi(original)
    } catch (e) {
      flush(e, null)
      // Only end the session on a genuine server rejection (401/403). A network/timeout/5xx on a mobile
      // connection must NOT log the parent out mid-enrolment — keep the tokens and let the next request
      // retry. A rotated token (site open twice) → replay the original request with the fresh one.
      const status = axios.isAxiosError(e) ? e.response?.status : undefined
      if (status === 401 || status === 403) {
        const rotated = getRefreshToken('applicant')
        const fresh = getAccessToken('applicant')
        if (rotated && rotated !== refreshToken && fresh) {
          original.headers.Authorization = `Bearer ${fresh}`
          return applicantApi(original)
        }
        clearTokens('applicant')
        window.location.href = '/inscription/login'
      }
      return Promise.reject(e)
    } finally {
      isRefreshing = false
    }
  }
)

export default applicantApi
