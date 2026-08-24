// Assignments resource: a member's placement (unit + team + function, start/end dates). Active = endDate null. Mutations invalidate ['assignments'] + ['members'] (+ ['units'] on create). Queries key on ['assignments'].
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
  unitTypeId: string
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
  isArchived: boolean
}

// Paginated assignments list (GET /assignments); filter by member/unit/team/isActive. Keyed ['assignments', params].
export function useAssignments(params: { memberId?: string; unitId?: string; teamId?: string; isActive?: boolean; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['assignments', params],
    queryFn: () => apiClient.get<PaginatedResult<AssignmentDto>>('/assignments', { params }).then(r => r.data),
  })
}

// Functional roles for the assignment "Fonction" picker (GET /functional-roles); optional unitTypeId. Keyed ['functionalRoles', unitTypeId ?? 'all'].
export function useFunctionalRoles(unitTypeId?: string) {
  return useQuery({
    queryKey: ['functionalRoles', unitTypeId ?? 'all'],
    queryFn: () => apiClient.get<FunctionalRoleDto[]>('/functional-roles', { params: unitTypeId ? { unitTypeId } : {} }).then(r => r.data),
  })
}

// POST /assignments; invalidates ['assignments'] + ['members'] + ['units'].
export function useCreateAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AssignmentFormData) => apiClient.post('/assignments', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assignments'] }); qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['units'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }) },
  })
}

// PUT /assignments/:id; invalidates ['assignments'] + ['members'].
export function useUpdateAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: AssignmentFormData & { id: string }) =>
      apiClient.put(`/assignments/${id}`, { id, ...data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assignments'] }); qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }) },
  })
}

// PUT /assignments/:id/correct-unit — CORRECTS a wrong placement: repoints the active assignment to the right
// unit in place (team reset, role kept/defaulted, start date kept) so the wrong unit leaves no trace. CG/super-admin.
export function useCorrectMemberUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, newUnitId }: { id: string; newUnitId: string }) =>
      apiClient.put(`/assignments/${id}/correct-unit`, { newUnitId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assignments'] }); qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['units'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }) },
  })
}

// PUT /assignments/:id/end — closes an assignment with an endDate (member leaves). Invalidates ['assignments'] + ['members'].
export function useEndAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, endDate }: { id: string; endDate: string }) =>
      apiClient.put(`/assignments/${id}/end`, { id, endDate }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assignments'] }); qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }) },
  })
}

// DELETE /assignments/:id; invalidates ['assignments'] + ['members'].
export function useDeleteAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/assignments/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assignments'] }); qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }) },
  })
}
