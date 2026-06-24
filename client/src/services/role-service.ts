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
}

export interface FunctionalRoleFormData {
  name: string
  code: string
  description?: string | null
  securityProfileId: string
  unitTypeId?: string | null
  isMaitrise?: boolean
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

export function useGroupFunctionAccess() {
  return useQuery({
    queryKey: ['groupFunctionAccess'],
    queryFn: () => apiClient.get<GroupFunctionAccessDto[]>('/functional-roles/group-access').then(r => r.data),
  })
}

export function useSetGroupFunctionAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ functionalRoleId, areaLevels }: { functionalRoleId: string; areaLevels: Record<string, string> }) =>
      apiClient.post(`/functional-roles/${functionalRoleId}/group-access`, { functionalRoleId, areaLevels }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groupFunctionAccess'] }),
  })
}

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

export function useFunctionalRoles(unitTypeId?: string) {
  return useQuery({
    queryKey: ['functionalRoles', unitTypeId],
    queryFn: () => apiClient.get<FunctionalRoleDto[]>('/functional-roles', { params: unitTypeId ? { unitTypeId } : {} }).then(r => r.data),
  })
}

export function useSecurityProfiles() {
  return useQuery({
    queryKey: ['securityProfiles'],
    queryFn: () => apiClient.get<SecurityProfileDto[]>('/security-profiles').then(r => r.data),
  })
}

export function useCreateFunctionalRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: FunctionalRoleFormData) => apiClient.post('/functional-roles', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['functionalRoles'] }),
  })
}

export function useUpdateFunctionalRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: FunctionalRoleFormData & { id: string }) =>
      apiClient.put(`/functional-roles/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['functionalRoles'] }),
  })
}

export function useDeleteFunctionalRole() {
  const qc = useQueryClient()
  return useMutation({
    // Returns { archived: true } when the function was archived (used by members) rather than deleted.
    mutationFn: (id: string) => apiClient.delete<{ archived: boolean }>(`/functional-roles/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['functionalRoles'] }),
  })
}

export function useUnarchiveFunctionalRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/functional-roles/${id}/unarchive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['functionalRoles'] }),
  })
}

export function useReorderFunctionalRoles() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) => apiClient.put('/functional-roles/reorder', { orderedIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['functionalRoles'] }),
  })
}

export function useSetDefaultFunctionalRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/functional-roles/${id}/set-default`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['functionalRoles'] }),
  })
}
