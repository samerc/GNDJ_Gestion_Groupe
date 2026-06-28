import { Navigate, Outlet } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'

// Route guard for super-admin-only pages (org structure, roles, system settings). Non-super-admins
// are bounced to the dashboard. For pages a Chef de Groupe may reach, use PermissionRoute instead.
export function AdminRoute() {
  const { user } = useAuthStore()

  if (!user?.isSuperAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
