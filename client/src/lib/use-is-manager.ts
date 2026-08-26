import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { useSetting } from '@/services/settings-service'

// Managers = super-admin / Chef de Groupe (maitrise.manage) / any group-level role (ACG). They get the full
// admin nav. Used by the app layout to choose the horizontal top menubar (managers) vs the left sidebar.
export function useIsManager() {
  const { hasPermission, user } = useAuthStore()
  return !!user?.isSuperAdmin || hasPermission(PERMISSIONS.MAITRISE_MANAGE) || !!user?.unitAccess?.some((u) => u.isGroupLevel)
}

// A regular member = a youth/parent, NOT a chef of any kind: not a super-admin and holding no leadership role
// (isLeader = a members.edit role → CU/ACU) or group-level role (CG/ACG). Chefs get the printed guide; regular
// members get the in-app welcome tour + the "Revoir le tutoriel" menu entry. (A chef d'équipe has no isLeader
// role, so they count as a member here.)
export function useIsRegularMember() {
  const user = useAuthStore((s) => s.user)
  return !!user && !user.isSuperAdmin && !(user.unitAccess ?? []).some((u) => u.isLeader || u.isGroupLevel)
}

// Role-based chrome colour: the header (and the CU/member left sidebar + the mobile drawer) are tinted by the
// signed-in user's category, so you can tell at a glance who you are. Colours are configurable in Settings →
// Apparence (the `ui.role_colors` setting, one hex per role) and applied INLINE (not a Tailwind class) so any
// hex works. The nav item/text styles use white overlays, so any dark colour reads cleanly. Falls back to the
// defaults below until the setting loads (and if it's missing/unparseable).
export type RoleKey = 'superadmin' | 'cg' | 'cu' | 'member'
export type RoleTheme = { key: RoleKey; label: string; color: string }

export const ROLE_LABELS: Record<RoleKey, string> = {
  member: 'Membre',
  cu: "Chef d'unité",
  cg: 'Chef de Groupe',
  superadmin: 'Super administrateur',
}
export const DEFAULT_ROLE_COLORS: Record<RoleKey, string> = {
  member: '#065f46', // emerald-800
  cu: '#3730a3', // indigo-800
  cg: '#0f766e', // teal-700
  superadmin: '#0f172a', // slate-900
}

// Parse the ui.role_colors JSON setting into a full colour map (merged over the defaults).
export function useRoleColors(): Record<RoleKey, string> {
  const { data } = useSetting('ui.role_colors')
  let parsed: Partial<Record<RoleKey, string>> = {}
  if (data?.value) {
    try { parsed = JSON.parse(data.value) } catch { parsed = {} }
  }
  return { ...DEFAULT_ROLE_COLORS, ...parsed }
}

export function useRoleTheme(): RoleTheme {
  const { hasPermission, user } = useAuthStore()
  const colors = useRoleColors()
  const key: RoleKey = user?.isSuperAdmin ? 'superadmin'
    : (hasPermission(PERMISSIONS.MAITRISE_MANAGE) || !!user?.unitAccess?.some((u) => u.isGroupLevel)) ? 'cg'
    : hasPermission(PERMISSIONS.MEMBERS_EDIT) ? 'cu'
    : 'member'
  return { key, label: ROLE_LABELS[key], color: colors[key] }
}
