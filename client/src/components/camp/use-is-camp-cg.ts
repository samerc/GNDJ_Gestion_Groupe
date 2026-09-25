import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'

// Chef-de-Groupe-only camp actions (create / archive / delete a camp, name the Commission BP). Mirrors the
// backend CampCg.IsCg: super-admin or roles.manage_group — camp.manage alone isn't enough, because Commission BP
// members hold it while their camp is active.
export function useIsCampCg() {
  const { user, hasPermission } = useAuthStore()
  return !!user?.isSuperAdmin || hasPermission(PERMISSIONS.ROLES_MANAGE_GROUP)
}
