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
}

export interface FunctionalRoleFormData {
  name: string
  code: string
  description?: string | null
  securityProfileId: string
  unitTypeId?: string | null
  rank?: number
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
    mutationFn: (id: string) => apiClient.delete(`/functional-roles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['functionalRoles'] }),
  })
}
