import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface PassageDto {
  id: string
  schoolYear: string
  memberId: string
  memberName: string
  cardNumber: string | null
  dateOfBirth: string | null
  age: number | null
  currentUnitId: string
  currentUnitCode: string
  currentUnitName: string
  currentTeamName: string | null
  currentRoleName: string
  proposedUnitId: string
  proposedUnitCode: string
  proposedUnitName: string
  proposedTeamId: string | null
  proposedTeamName: string | null
  proposedRoleName: string
  finalUnitId: string | null
  finalUnitCode: string | null
  finalUnitName: string | null
  finalTeamId: string | null
  finalTeamName: string | null
  finalRoleName: string | null
  status: string
  cuNotes: string | null
  cgNotes: string | null
  createdAt: string
}

export interface PassageSummaryDto {
  schoolYear: string
  totalMembers: number
  pending: number
  approved: number
  rejected: number
  unitSummaries: { unitCode: string; unitName: string; total: number; pending: number; approved: number; rejected: number }[]
}

export interface PassageStatusDto {
  isOpen: boolean
  schoolYear: string
}

export function usePassagesByUnit(unitId: string, schoolYear: string) {
  return useQuery({
    queryKey: ['passages', 'unit', unitId, schoolYear],
    queryFn: () => apiClient.get<PassageDto[]>(`/passages/unit/${unitId}`, { params: { schoolYear } }).then(r => r.data),
    enabled: !!unitId && !!schoolYear,
  })
}

export function useAllPassages(schoolYear: string, status?: string, unitId?: string) {
  return useQuery({
    queryKey: ['passages', 'all', schoolYear, status, unitId],
    queryFn: () => apiClient.get<PassageDto[]>('/passages', { params: { schoolYear, status, unitId } }).then(r => r.data),
    enabled: !!schoolYear,
  })
}

export function usePassageSummary(schoolYear: string) {
  return useQuery({
    queryKey: ['passages', 'summary', schoolYear],
    queryFn: () => apiClient.get<PassageSummaryDto>(`/passages/summary`, { params: { schoolYear } }).then(r => r.data),
    enabled: !!schoolYear,
  })
}

export function usePassageStatus(schoolYear: string) {
  return useQuery({
    queryKey: ['passages', 'status', schoolYear],
    queryFn: () => apiClient.get<PassageStatusDto>(`/passages/status`, { params: { schoolYear } }).then(r => r.data),
  })
}

export function useProposePassage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { memberId: string; schoolYear: string; proposedUnitId: string; proposedTeamId?: string | null; proposedRoleId: string; cuNotes?: string | null }) =>
      apiClient.post('/passages', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passages'] }),
  })
}

export function useBulkProposePassage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { memberIds: string[]; schoolYear: string; proposedUnitId: string; proposedTeamId?: string | null; proposedRoleId: string; cuNotes?: string | null }) =>
      apiClient.post<{ count: number }>('/passages/bulk', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passages'] }),
  })
}

export function useReviewPassage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { id: string; status: string; finalUnitId?: string | null; finalTeamId?: string | null; finalRoleId?: string | null; cgNotes?: string | null }) =>
      apiClient.put(`/passages/${data.id}/review`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passages'] }),
  })
}

export function useBulkReviewPassage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { passageIds: string[]; status: string; cgNotes?: string | null }) =>
      apiClient.post<{ count: number }>('/passages/bulk-review', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passages'] }),
  })
}

export function useFinalizePassages() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { schoolYear: string; unitId?: string | null }) =>
      apiClient.post<{ count: number }>('/passages/finalize', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['passages'] })
      qc.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

export function useTogglePassage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { enabled: boolean; schoolYear: string }) =>
      apiClient.post('/passages/toggle', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passages'] }),
  })
}

export function useDeletePassage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/passages/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passages'] }),
  })
}
