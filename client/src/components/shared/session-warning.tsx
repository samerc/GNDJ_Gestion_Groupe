import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import apiClient from '@/lib/api-client'
import { Button } from '@/components/ui/button'

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

export function SessionWarning() {
  const { isAuthenticated, logout } = useAuthStore()
  const [showWarning, setShowWarning] = useState(false)
  const [minutesLeft, setMinutesLeft] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const lastActivityRef = useRef(Date.now())

  // Track user activity
  useEffect(() => {
    if (!isAuthenticated) return
    const update = () => { lastActivityRef.current = Date.now() }
    window.addEventListener('click', update, true)
    window.addEventListener('keydown', update, true)
    return () => {
      window.removeEventListener('click', update, true)
      window.removeEventListener('keydown', update, true)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return

    const check = async () => {
      const expiry = getTokenExpiry()
      if (!expiry) return
      const remaining = expiry - Date.now()

      if (remaining <= 0) {
        logout()
        return
      }

      // If user was active in the last 2 minutes and token expires in < 3 min, auto-refresh
      const userActiveRecently = (Date.now() - lastActivityRef.current) < 2 * 60 * 1000
      if (remaining <= 3 * 60 * 1000 && userActiveRecently) {
        const ok = await refreshSession()
        if (ok) {
          setShowWarning(false)
          return
        }
      }

      if (remaining <= 5 * 60 * 1000) {
        setShowWarning(true)
        setMinutesLeft(Math.ceil(remaining / 60000))
      } else {
        setShowWarning(false)
      }
    }

    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [isAuthenticated, logout])

  const handleExtend = useCallback(async () => {
    setRefreshing(true)
    const ok = await refreshSession()
    setRefreshing(false)
    if (ok) {
      setShowWarning(false)
    } else {
      logout()
    }
  }, [logout])

  if (!showWarning) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-lg border bg-amber-50 px-4 py-3 shadow-lg max-w-sm">
      <p className="text-sm font-medium text-amber-800">
        Votre session expire dans {minutesLeft} minute{minutesLeft > 1 ? 's' : ''}
      </p>
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-amber-600">
          Cliquez pour prolonger votre session.
        </p>
        <Button size="sm" variant="outline" className="ml-3 text-xs h-7 border-amber-300 text-amber-800 hover:bg-amber-100" onClick={handleExtend} disabled={refreshing}>
          {refreshing ? 'Prolongement...' : 'Prolonger'}
        </Button>
      </div>
    </div>
  )
}
