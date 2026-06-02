import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { PaginatedResult } from '@/types/api'

export interface AssignmentDto {
  id: string
  memberId: string
  memberFirstName: string
  memberLastName: string
  unitId: string
  unitName: string
  teamId: string | null
  teamName: string | null
  functionalRoleId: string
  functionalRoleName: string
  startDate: string
  endDate: string | null
  notes: string | null
  isActive: boolean
}

export interface AssignmentFormData {
  memberId: string
  unitId: string
  teamId?: string | null
  functionalRoleId: string
  startDate: string
  endDate?: string | null
  notes?: string | null
}

export interface FunctionalRoleDto {
  id: string
  name: string
  code: string
  description: string | null
}

export function useAssignments(params: { memberId?: string; unitId?: string; teamId?: string; isActive?: boolean; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['assignments', params],
    queryFn: () => apiClient.get<PaginatedResult<AssignmentDto>>('/assignments', { params }).then(r => r.data),
  })
}

export function useFunctionalRoles() {
  return useQuery({
    queryKey: ['functionalRoles'],
    queryFn: () => apiClient.get<FunctionalRoleDto[]>('/functional-roles').then(r => r.data),
  })
}

export function useCreateAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AssignmentFormData) => apiClient.post('/assignments', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assignments'] }); qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['units'] }) },
  })
}

export function useUpdateAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: AssignmentFormData & { id: string }) =>
      apiClient.put(`/assignments/${id}`, { id, ...data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assignments'] }); qc.invalidateQueries({ queryKey: ['members'] }) },
  })
}

export function useEndAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, endDate }: { id: string; endDate: string }) =>
      apiClient.put(`/assignments/${id}/end`, { id, endDate }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assignments'] }); qc.invalidateQueries({ queryKey: ['members'] }) },
  })
}

export function useDeleteAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/assignments/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assignments'] }); qc.invalidateQueries({ queryKey: ['members'] }) },
  })
}
