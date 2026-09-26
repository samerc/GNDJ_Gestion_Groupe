import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'

// Camp admin = the Chef de Groupe or an Assistant Chef de Groupe (camp.manage) or a super-admin: creates / archives /
// deletes camps and chooses the Commission BP. Mirrors the backend CampAccess.IsAdmin. Commission members never hold
// camp.manage (they get camp.commission) — what they can do inside a camp comes from camp.myAccess.
export function useIsCampCg() {
  const { user, hasPermission } = useAuthStore()
  return !!user?.isSuperAdmin || hasPermission(PERMISSIONS.CAMP_MANAGE)
}
