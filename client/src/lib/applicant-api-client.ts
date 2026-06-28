import axios from 'axios'
import { API_BASE_URL } from './constants'

// Isolated axios client for the public applicant portal. Uses its own token storage so it never
// interferes with the member/admin session.
const applicantApi = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Separate localStorage keys from the member realm so the two sessions coexist on one browser.
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
  const token = localStorage.getItem(APPLICANT_ACCESS_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

applicantApi.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config
    if (error.response?.status !== 401 || original._retry) return Promise.reject(error)

    const refreshToken = localStorage.getItem(APPLICANT_REFRESH_KEY)
    if (!refreshToken) {
      localStorage.removeItem(APPLICANT_ACCESS_KEY)
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
      const { data } = await axios.post(`${API_BASE_URL}/applicant/refresh`, { refreshToken }, { headers: { 'Content-Type': 'application/json' } })
      localStorage.setItem(APPLICANT_ACCESS_KEY, data.accessToken)
      localStorage.setItem(APPLICANT_REFRESH_KEY, data.refreshToken)
      flush(null, data.accessToken)
      original.headers.Authorization = `Bearer ${data.accessToken}`
      return applicantApi(original)
    } catch (e) {
      flush(e, null)
      localStorage.removeItem(APPLICANT_ACCESS_KEY)
      localStorage.removeItem(APPLICANT_REFRESH_KEY)
      window.location.href = '/inscription/login'
      return Promise.reject(e)
    } finally {
      isRefreshing = false
    }
  }
)

export default applicantApi
