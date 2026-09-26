import { Navigate, Outlet } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'

// Route guard for pages a non-super-admin (e.g. Chef de Groupe) may access if they hold the permission.
// Super-admins always pass. Use this instead of AdminRoute for CG-reachable admin pages.
// permission = one permission, or a list (any of them is enough).
export function PermissionRoute({ permission }: { permission: string | string[] }) {
  const { user, hasPermission } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />
  const perms = Array.isArray(permission) ? permission : [permission]
  if (!user.isSuperAdmin && !perms.some((p) => hasPermission(p))) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
