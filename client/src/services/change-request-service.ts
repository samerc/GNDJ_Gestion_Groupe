// Member-proposed changes needing approval (progression + fonctions). Members propose for their own record
// and list their own requests; CU/CG list pending requests and review (approve/reject). Backed by
// /change-requests/*. Keyed on ['change-requests', ...].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface ChangeRequestDto {
  id: string
  memberId: string
  memberName: string
  kind: 'Progression' | 'Assignment'
  summary: string
  status: 'Pending' | 'Approved' | 'Rejected'
  decisionNotes: string | null
  createdAt: string
  reviewedAt: string | null
}

// ── Member: propose ──────────────────────────────────────────────────────────
export function useProposeProgression() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { unitId: string; scoutStageId: string; badgeId?: string | null; date: string; location?: string | null; notes?: string | null }) =>
      apiClient.post('/change-requests/progression', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['change-requests', 'mine'] }),
  })
}
export function useProposeAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { unitId: string; teamId?: string | null; functionalRoleId: string; startDate: string }) =>
      apiClient.post('/change-requests/assignment', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['change-requests', 'mine'] }),
  })
}

export interface ProposableUnit { id: string; name: string; unitTypeId: string }
// All active units a member may target when proposing a fonction (not unit-scoped, unlike useUnits).
export function useProposableUnits(enabled = true) {
  return useQuery({
    queryKey: ['change-requests', 'units'],
    queryFn: () => apiClient.get<ProposableUnit[]>('/change-requests/units').then(r => r.data),
    enabled,
  })
}

// The caller's own change requests (all statuses).
export function useMyChangeRequests(enabled = true) {
  return useQuery({
    queryKey: ['change-requests', 'mine'],
    queryFn: () => apiClient.get<ChangeRequestDto[]>('/change-requests/mine').then(r => r.data),
    enabled,
  })
}

// Member dismisses/withdraws one of their OWN requests (clears a rejected notice or a pending proposal).
export function useDismissChangeRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/change-requests/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['change-requests', 'mine'] }),
  })
}

// ── CU/CG: review ────────────────────────────────────────────────────────────
export function usePendingChangeRequests(enabled = true) {
  return useQuery({
    queryKey: ['change-requests', 'pending'],
    queryFn: () => apiClient.get<ChangeRequestDto[]>('/change-requests/pending').then(r => r.data),
    enabled,
  })
}

// Pending count for the sidebar badge.
export function usePendingChangeRequestsCount(enabled = true) {
  return useQuery({
    queryKey: ['change-requests', 'pending', 'count'],
    queryFn: () => apiClient.get<{ count: number }>('/change-requests/pending/count').then(r => r.data.count),
    enabled,
  })
}

// Approve (apply) or reject (discard) a request.
export function useReviewChangeRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, approve, decisionNotes }: { id: string; approve: boolean; decisionNotes?: string | null }) =>
      apiClient.post(`/change-requests/${id}/review`, { id, approve, decisionNotes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['change-requests'] })
      // Approving creates a real progression/assignment → refresh those views + the member tab counts,
      // list and dashboard (roster/overview) that reflect the new record.
      qc.invalidateQueries({ queryKey: ['progressions'] })
      qc.invalidateQueries({ queryKey: ['assignments'] })
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
