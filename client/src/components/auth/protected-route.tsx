import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'

export function ProtectedRoute() {
  const { isAuthenticated, user, isLoading, loadUser } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated && !user && !isLoading) {
      loadUser()
    }
  }, [isAuthenticated, user, isLoading, loadUser])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Chargement...</div>
      </div>
    )
  }

  return <Outlet />
}
