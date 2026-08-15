// "Organiser mon unité" board — one query returns the whole board (teams + fonctions + members), and the
// placement mutation moves ONE member (team + fonction) by editing their active assignment in place.
// Keyed on ['organization', unitId]. Uses the authenticated apiClient (member/CU realm).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface OrgTeam {
  id: string
  name: string
  isMaitrise: boolean
  displayOrder: number
}

export interface OrgRole {
  id: string
  name: string
  rank: number
  isMaitrise: boolean
  isDefault: boolean
}

export interface OrgMember {
  memberId: string
  firstName: string
  lastName: string
  photoPath: string | null
  gender: string | null
  dateOfBirth: string | null
  assignmentId: string
  teamId: string | null
  functionalRoleId: string
  functionalRoleName: string
  roleRank: number
}

export interface UnitOrganization {
  unitId: string
  unitName: string
  unitTypeId: string
  unitTypeName: string
  teams: OrgTeam[]
  roles: OrgRole[]
  members: OrgMember[]
}

// GET /organization/unit/{unitId} → the whole board for a unit.
export function useUnitOrganization(unitId: string) {
  return useQuery({
    queryKey: ['organization', unitId],
    queryFn: () => apiClient.get<UnitOrganization>(`/organization/unit/${unitId}`).then((r) => r.data),
    enabled: !!unitId,
  })
}

// PUT /organization/placement/{assignmentId} → move a member (team + fonction), edited in place.
// Optimistic: updates the cached board immediately, rolls back on error, then re-syncs.
export function useSetPlacement(unitId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ assignmentId, teamId, functionalRoleId }: { assignmentId: string; teamId: string | null; functionalRoleId: string }) =>
      apiClient.put(`/organization/placement/${assignmentId}`, { teamId, functionalRoleId }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['organization', unitId] })
      const prev = qc.getQueryData<UnitOrganization>(['organization', unitId])
      if (prev) {
        const role = prev.roles.find((r) => r.id === vars.functionalRoleId)
        qc.setQueryData<UnitOrganization>(['organization', unitId], {
          ...prev,
          members: prev.members.map((m) =>
            m.assignmentId === vars.assignmentId
              ? {
                  ...m,
                  teamId: vars.teamId,
                  functionalRoleId: vars.functionalRoleId,
                  functionalRoleName: role?.name ?? m.functionalRoleName,
                  roleRank: role?.rank ?? m.roleRank,
                }
              : m,
          ),
        })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['organization', unitId], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['organization', unitId] }),
  })
}
