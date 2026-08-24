import { useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'

// Units the current user personally LEADS as a CU/ACU (their role grants members.edit → `isLeader`), deduped,
// EXCLUDING the group-Maîtrise assignment (`isGroupLevel` — a group role grants all-units access but isn't a
// "unit I run"). Used by the unit-scoped leader screens (Passage, Session photo, …) so a CU/ACU who leads
// several units can switch between them. An ACU-in-X + CU-in-Y sees BOTH — chef vs assistant makes no
// difference to which units appear (that would be a permission decision on the role, not a nav one).
export function useLeaderUnits() {
  const user = useAuthStore((s) => s.user)
  return useMemo(() => {
    const byId = new Map<string, { unitId: string; unitName: string }>()
    for (const u of user?.unitAccess ?? []) {
      if (u.isLeader && !u.isGroupLevel && !byId.has(u.unitId)) {
        byId.set(u.unitId, { unitId: u.unitId, unitName: u.unitName })
      }
    }
    return [...byId.values()]
  }, [user])
}
