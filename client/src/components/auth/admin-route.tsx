import { Navigate, Outlet } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'

export function AdminRoute() {
  const { user } = useAuthStore()

  if (!user?.isSuperAdmin) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
