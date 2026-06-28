import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'

// Auth gate for the whole app shell. Redirects to /login when no token; while authenticated but the
// user object hasn't been hydrated yet, lazily loads it and shows a spinner before rendering children.
export function ProtectedRoute() {
  const { isAuthenticated, user, isLoading, loadUser } = useAuthStore()

  // Token present but user not yet fetched (e.g. after a hard refresh) → load it once.
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
