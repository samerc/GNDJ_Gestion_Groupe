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
}

export interface FunctionalRoleFormData {
  name: string
  code: string
  description?: string | null
  securityProfileId: string
  unitTypeId?: string | null
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
