// Functional roles + security profiles + per-function group access. Roles map a member's function to a security profile; archive-instead-of-delete when used. Queries key on ['functionalRoles'], ['securityProfiles'], ['groupFunctionAccess'].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface FunctionalRoleDto {
  id: string
  name: string
  code: string
  description: string | null
  securityProfileId: string
  securityProfileName: string
  unitTypeId: string | null
  unitTypeName: string | null
  unitTypeColor: string | null
  rank: number
  assignmentCount: number
  usedByMembers: boolean
  isArchived: boolean
  isDefaultForNewMembers: boolean
  isMaitrise: boolean
  isTeamLeader: boolean
}

export interface FunctionalRoleFormData {
  name: string
  code: string
  description?: string | null
  securityProfileId: string
  unitTypeId?: string | null
  isMaitrise?: boolean
  isTeamLeader?: boolean
}

export interface ProfileMemberDto {
  memberId: string
  firstName: string
  lastName: string
  unitCode: string | null
  functionName: string | null
  rank: number
  isAccountFlag: boolean
}

export interface FunctionMemberDto {
  memberId: string
  firstName: string
  lastName: string
  unitCode: string | null
  active: boolean
}

// Members holding a function (GET /functional-roles/:id/members); for the delete-confirm popup. Gated by enabled + roleId. Keyed ['functionalRoleMembers', roleId].
export function useFunctionalRoleMembers(roleId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['functionalRoleMembers', roleId],
    queryFn: () => apiClient.get<FunctionMemberDto[]>(`/functional-roles/${roleId}/members`).then(r => r.data),
    enabled: enabled && !!roleId,
  })
}

export interface GroupAreaDto { key: string; label: string; level: string }
export interface GroupFunctionAccessDto {
  functionalRoleId: string
  name: string
  code: string
  editable: boolean
  areas: GroupAreaDto[]
}

// Per-group-function area access levels (GET /functional-roles/group-access); CG "Accès maîtrise" editor. Keyed ['groupFunctionAccess'].
export function useGroupFunctionAccess() {
  return useQuery({
    queryKey: ['groupFunctionAccess'],
    queryFn: () => apiClient.get<GroupFunctionAccessDto[]>('/functional-roles/group-access').then(r => r.data),
  })
}

// POST /functional-roles/:id/group-access — set per-area levels (lazy-forks the function's profile). Invalidates ['groupFunctionAccess'].
export function useSetGroupFunctionAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ functionalRoleId, areaLevels }: { functionalRoleId: string; areaLevels: Record<string, string> }) =>
      apiClient.post(`/functional-roles/${functionalRoleId}/group-access`, { functionalRoleId, areaLevels }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groupFunctionAccess'] }),
  })
}

// Members carrying a security profile (GET /security-profiles/:id/members); super-admin profile lists flagged accounts. Keyed ['securityProfileMembers', profileId].
export function useSecurityProfileMembers(profileId: string | undefined) {
  return useQuery({
    queryKey: ['securityProfileMembers', profileId],
    queryFn: () => apiClient.get<ProfileMemberDto[]>(`/security-profiles/${profileId}/members`).then(r => r.data),
    enabled: !!profileId,
  })
}

export interface SecurityProfileDto {
  id: string
  name: string
  code: string
  isSystem: boolean
}

// Functional roles list (GET /functional-roles); optional unitTypeId filter. Keyed ['functionalRoles', unitTypeId].
export function useFunctionalRoles(unitTypeId?: string) {
  return useQuery({
    queryKey: ['functionalRoles', unitTypeId],
    queryFn: () => apiClient.get<FunctionalRoleDto[]>('/functional-roles', { params: unitTypeId ? { unitTypeId } : {} }).then(r => r.data),
  })
}

// Security profiles list (GET /security-profiles); for the role's profile picker. Keyed ['securityProfiles'].
export function useSecurityProfiles() {
  return useQuery({
    queryKey: ['securityProfiles'],
    queryFn: () => apiClient.get<SecurityProfileDto[]>('/security-profiles').then(r => r.data),
  })
}

// POST /functional-roles (auto-ranks to senior end). Invalidates ['functionalRoles'].
export function useCreateFunctionalRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: FunctionalRoleFormData) => apiClient.post('/functional-roles', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['functionalRoles'] }),
  })
}

// PUT /functional-roles/:id. Invalidates ['functionalRoles'].
export function useUpdateFunctionalRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: FunctionalRoleFormData & { id: string }) =>
      apiClient.put(`/functional-roles/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['functionalRoles'] }),
  })
}

// DELETE /functional-roles/:id (archive-if-used). Invalidates ['functionalRoles'].
export function useDeleteFunctionalRole() {
  const qc = useQueryClient()
  return useMutation({
    // Returns { archived: true } when the function was archived (used by members) rather than deleted.
    mutationFn: (id: string) => apiClient.delete<{ archived: boolean }>(`/functional-roles/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['functionalRoles'] }),
  })
}

// POST /functional-roles/:id/unarchive — restores an archived function. Invalidates ['functionalRoles'].
export function useUnarchiveFunctionalRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/functional-roles/${id}/unarchive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['functionalRoles'] }),
  })
}

// PUT /functional-roles/reorder — drag-to-rank (top = most senior, highest rank). Invalidates ['functionalRoles'].
export function useReorderFunctionalRoles() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) => apiClient.put('/functional-roles/reorder', { orderedIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['functionalRoles'] }),
  })
}

// POST /functional-roles/:id/set-default — marks the auto-assigned role for new members (clears others in the unit type). Invalidates ['functionalRoles'].
export function useSetDefaultFunctionalRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/functional-roles/${id}/set-default`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['functionalRoles'] }),
  })
}

// ── Super-admin grant/revoke (super-admin only; the flag is not a permission/role) ──
export interface SuperAdminDto { memberId: string; name: string; email: string | null; unitCode: string | null }

// GET /members/super-admins → the flagged accounts. Keyed ['super-admins'].
export function useSuperAdmins(enabled = true) {
  return useQuery({
    queryKey: ['super-admins'],
    queryFn: () => apiClient.get<SuperAdminDto[]>('/members/super-admins').then(r => r.data),
    enabled,
  })
}

// PUT /members/:id/super-admin { grant } → grant/revoke super-admin. Invalidates the list + the member detail.
export function useSetSuperAdmin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ memberId, grant }: { memberId: string; grant: boolean }) =>
      apiClient.put(`/members/${memberId}/super-admin`, { grant }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admins'] })
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['securityProfileMembers'] })
    },
  })
}

// POST /security-profiles/merge { sourceId, targetId } → merge a duplicate profile into another (repoints its
// fonctions, deletes the source). Returns { rolesRepointed }. Invalidates profiles + functional roles.
export function useMergeSecurityProfiles() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: string; targetId: string }) =>
      apiClient.post<{ rolesRepointed: number }>('/security-profiles/merge', { sourceId, targetId }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security-profiles'] })
      qc.invalidateQueries({ queryKey: ['securityProfiles'] })
      qc.invalidateQueries({ queryKey: ['functionalRoles'] })
    },
  })
}
