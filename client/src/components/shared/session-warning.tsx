import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'

function getTokenExpiry(): number | null {
  const token = localStorage.getItem('accessToken')
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp ? payload.exp * 1000 : null
  } catch { return null }
}

export function SessionWarning() {
  const { isAuthenticated, logout } = useAuthStore()
  const [showWarning, setShowWarning] = useState(false)
  const [minutesLeft, setMinutesLeft] = useState(0)

  useEffect(() => {
    if (!isAuthenticated) return

    const check = () => {
      const expiry = getTokenExpiry()
      if (!expiry) return
      const remaining = expiry - Date.now()
      const mins = Math.ceil(remaining / 60000)

      if (remaining <= 0) {
        logout()
        return
      }

      if (remaining <= 5 * 60 * 1000) {
        setShowWarning(true)
        setMinutesLeft(mins)
      } else {
        setShowWarning(false)
      }
    }

    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [isAuthenticated, logout])

  if (!showWarning) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-lg border bg-amber-50 px-4 py-3 shadow-lg max-w-sm">
      <p className="text-sm font-medium text-amber-800">
        Votre session expire dans {minutesLeft} minute{minutesLeft > 1 ? 's' : ''}
      </p>
      <p className="text-xs text-amber-600 mt-1">
        Veuillez sauvegarder votre travail. Vous serez déconnecté automatiquement.
      </p>
    </div>
  )
}
