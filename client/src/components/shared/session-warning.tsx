import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import apiClient from '@/lib/api-client'
import { Button } from '@/components/ui/button'

const IDLE_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes idle → show warning / logout
const REFRESH_BUFFER_MS = 3 * 60 * 1000  // Auto-refresh when < 3 min remaining
const CHECK_INTERVAL_MS = 30 * 1000

// Decode the JWT `exp` (ms epoch) without verifying — just to time the refresh/warning locally.
function getTokenExpiry(): number | null {
  const token = localStorage.getItem('accessToken')
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp ? payload.exp * 1000 : null
  } catch { return null }
}

async function refreshSession(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return false
  try {
    const { data } = await apiClient.post('/auth/refresh', { refreshToken })
    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)
    return true
  } catch {
    return false
  }
}

// Mounted once in the app shell. Polls the JWT expiry every 30s: while the user is active it silently
// auto-refreshes the token before it lapses; once idle past IDLE_TIMEOUT it shows a countdown banner and
// logs out at expiry. Tracks activity via throttled global event listeners.
export function SessionWarning() {
  const { isAuthenticated, logout } = useAuthStore()
  const [showWarning, setShowWarning] = useState(false)
  const [minutesLeft, setMinutesLeft] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const lastActivityRef = useRef(Date.now())

  // Track user activity (throttled to once per 5s)
  useEffect(() => {
    if (!isAuthenticated) return
    let throttle: ReturnType<typeof setTimeout> | null = null
    const update = () => {
      if (throttle) return
      lastActivityRef.current = Date.now()
      throttle = setTimeout(() => { throttle = null }, 5000)
    }
    const events = ['click', 'keydown', 'scroll', 'mousemove', 'touchstart'] as const
    for (const e of events) window.addEventListener(e, update, { passive: true, capture: true })
    return () => {
      for (const e of events) window.removeEventListener(e, update, true)
      if (throttle) clearTimeout(throttle)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return

    const check = async () => {
      const expiry = getTokenExpiry()
      if (!expiry) return

      const remaining = expiry - Date.now()
      const idleTime = Date.now() - lastActivityRef.current
      const isUserActive = idleTime < IDLE_TIMEOUT_MS

      // Token expired
      if (remaining <= 0) {
        if (isUserActive) {
          const ok = await refreshSession()
          if (ok) { setShowWarning(false); return }
        }
        logout()
        return
      }

      // Token expiring soon + user active → auto-refresh silently
      if (remaining <= REFRESH_BUFFER_MS && isUserActive) {
        const ok = await refreshSession()
        if (ok) { setShowWarning(false); return }
      }

      // Token expiring soon + user idle → show warning
      if (remaining <= 5 * 60 * 1000 && !isUserActive) {
        setShowWarning(true)
        setMinutesLeft(Math.ceil(remaining / 60000))
      } else {
        setShowWarning(false)
      }
    }

    check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isAuthenticated, logout])

  const handleExtend = useCallback(async () => {
    setRefreshing(true)
    lastActivityRef.current = Date.now()
    const ok = await refreshSession()
    setRefreshing(false)
    if (ok) { setShowWarning(false) } else { logout() }
  }, [logout])

  if (!showWarning) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-lg border bg-amber-50 px-4 py-3 shadow-lg max-w-sm">
      <p className="text-sm font-medium text-amber-800">
        Session inactive — expire dans {minutesLeft} min
      </p>
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-amber-600">Cliquez pour prolonger.</p>
        <Button size="sm" variant="outline" className="ml-3 text-xs h-7 border-amber-300 text-amber-800 hover:bg-amber-100" onClick={handleExtend} disabled={refreshing}>
          {refreshing ? '...' : 'Prolonger'}
        </Button>
      </div>
    </div>
  )
}
