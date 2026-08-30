import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// Reusable rule-based member groups (Grande Maîtrise, Chefs d'unité, "Haute Patrouille", …). A group = a scope
// (whole group / unit type / one unit) + membership rules (union of includes, minus excludes). Managed by a group
// manager (CG/ACG/super-admin). Membership is computed live server-side. Queries key on ['member-groups'].

// Scope + criterion vocabularies (mirror the backend MemberGroupScopes / MemberGroupCriteria).
export const GROUP_SCOPES = ['Group', 'UnitType', 'Unit'] as const
export const GROUP_SCOPE_LABELS: Record<string, string> = { Group: 'Tout le groupe', UnitType: 'Une branche', Unit: 'Une unité' }
// Criteria and whether each needs a value (target).
export const GROUP_CRITERIA = [
  { key: 'all', label: 'Tout le monde', needsValue: false },
  { key: 'maitrise', label: 'Maîtrise (chefs)', needsValue: false },
  { key: 'youth', label: 'Jeunes', needsValue: false },
  { key: 'team-leader', label: "Chefs d'équipe", needsValue: false },
  { key: 'profile', label: 'Profil (fonction type)', needsValue: true },
  { key: 'role', label: 'Fonction précise', needsValue: true },
  { key: 'unit', label: 'Unité', needsValue: true },
  { key: 'unit-type', label: 'Branche', needsValue: true },
  { key: 'member', label: 'Membre précis', needsValue: true },
] as const
export const CRITERION_LABELS: Record<string, string> = Object.fromEntries(GROUP_CRITERIA.map(c => [c.key, c.label]))

export interface MemberGroupRuleDto { include: boolean; criterion: string; value: string | null; valueLabel?: string | null }
export interface MemberGroupDto {
  id: string
  name: string
  scopeType: string
  unitTypeId: string | null
  unitTypeName: string | null
  unitId: string | null
  unitName: string | null
  perUnit: boolean         // branch scope only: true = one list per unit (split), false = one combined list
  isVisible: boolean       // shown in the réunion scope picker
  showInUnitList: boolean  // offered as a filter in the CU/CG unit roster (never public/members)
  isSystem: boolean
  memberCount: number
  rules: MemberGroupRuleDto[]
}

export function useMemberGroups() {
  return useQuery({
    queryKey: ['member-groups'],
    queryFn: () => apiClient.get<MemberGroupDto[]>('/member-groups').then(r => r.data),
    staleTime: 60_000, // the list rarely changes; avoids a refetch flash when a dialog opens over it
  })
}

// The members currently resolved by a group's rules (name + unit/team/role). Disabled until an id is given
// (only fetched when the "Voir les membres" dialog opens).
export interface MemberGroupMemberDto {
  memberId: string; firstName: string; lastName: string
  unitId: string; unitName: string | null; teamName: string | null; roleName: string
  email: string | null; phone: string | null  // reachable contact (member then parent) — for mailing / export
}
export function useMemberGroupMembers(id: string | undefined) {
  return useQuery({
    queryKey: ['member-groups', id, 'members'],
    queryFn: () => apiClient.get<MemberGroupMemberDto[]>(`/member-groups/${id}/members`).then(r => r.data),
    enabled: !!id,
    staleTime: 30_000, // avoid a refetch flash while the dialog is open
  })
}

// POST /member-groups/{id}/send-message → email the group's members (a template OR free text). Optional unitId
// narrows a per-unit group to one unit. Returns a queued/no-contact report (delivery is via the durable outbox).
export interface SendGroupMessageResult { recipients: number; noContact: number; noContactNames: string[] }
export function useSendGroupMessage() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; unitId?: string | null; templateCode?: string | null; subject?: string | null; bodyHtml?: string | null }) =>
      apiClient.post<SendGroupMessageResult>(`/member-groups/${id}/send-message`, { groupId: id, ...body }).then(r => r.data),
  })
}

type GroupPayload = { name: string; scopeType: string; unitTypeId: string | null; unitId: string | null; perUnit: boolean; isVisible: boolean; showInUnitList: boolean; rules: MemberGroupRuleDto[] }

export function useCreateMemberGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: GroupPayload) => apiClient.post<{ id: string }>('/member-groups', data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['member-groups'] }); qc.invalidateQueries({ queryKey: ['meetings'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }) },
  })
}

export function useUpdateMemberGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: GroupPayload & { id: string }) => apiClient.put(`/member-groups/${id}`, { id, ...data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['member-groups'] }); qc.invalidateQueries({ queryKey: ['meetings'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }) },
  })
}

export function useDeleteMemberGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/member-groups/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['member-groups'] }); qc.invalidateQueries({ queryKey: ['meetings'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }) },
  })
}
