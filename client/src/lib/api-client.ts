import axios from 'axios'
import { API_BASE_URL } from './constants'
import type { AuthResponse } from '@/types/auth'
import { getAccessToken, getRefreshToken, setTokens, clearTokens, getRemember } from './token-storage'

// Authenticated axios client for the member/chef/admin realm. Request interceptor attaches the JWT;
// response interceptor transparently refreshes on 401 and retries the original request once.
// (Applicant portal + public site use their own clients so the realms never cross.)
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Single-flight refresh guard: while one refresh is in progress, other 401s queue here instead of
// each firing their own /auth/refresh.
let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

// Resolve/reject all requests that queued while the refresh was in flight.
function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(token!)
  })
  failedQueue = []
}

// Attach the stored access token to every outgoing request.
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken('member')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // A 401 from the auth endpoints THEMSELVES (login/register/refresh) is bad credentials / not-yet-
    // authenticated, not an expired session — surface it to the page instead of hard-redirecting (which
    // reloads the page and wipes the inline error before it can be read).
    const isAuthEndpoint = /\/auth\/(login|register|refresh)/.test(originalRequest?.url ?? '')

    // Only intercept 401s, and never retry a request we already retried (avoids refresh loops).
    if (error.response?.status !== 401 || originalRequest._retry || isAuthEndpoint) {
      return Promise.reject(error)
    }

    // No refresh token → session is unrecoverable: clear storage and bounce to login.
    const refreshToken = getRefreshToken('member')
    if (!refreshToken) {
      clearTokens('member')
      window.location.href = '/login'
      return Promise.reject(error)
    }

    // A refresh is already running: park this request until it resolves, then replay with the new token.
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`
        return apiClient(originalRequest)
      })
    }

    isRefreshing = true
    originalRequest._retry = true

    try {
      // Use a bare axios (not apiClient) so this refresh call can't itself be intercepted/retried.
      const { data } = await axios.post<AuthResponse>(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken, rememberMe: getRemember('member') },
        { headers: { 'Content-Type': 'application/json' } }
      )

      setTokens('member', data.accessToken, data.refreshToken)

      processQueue(null, data.accessToken)
      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
      return apiClient(originalRequest)
    } catch (refreshError) {
      // Refresh failed (expired/revoked): reject the queue and force re-login.
      processQueue(refreshError, null)
      clearTokens('member')
      window.location.href = '/login'
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

export default apiClient
