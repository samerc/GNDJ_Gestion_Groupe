import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// Document-verification campaign: a group-wide, date-driven schedule that opens/closes member document upload
// automatically and runs the two verification steps (error emails → on-hold). Queries key on ['doc-campaign'].

export interface DocumentCampaignStatus {
  enabled: boolean
  phase: string // Inactive | Avant | Depot | Verification1 | Correction | Verification2 | Termine
  uploadOpen: boolean
  depositStart: string | null
  depositDeadline: string | null
  correctionStart: string | null
  correctionDeadline: string | null
  finalDeadline: string | null
  uploadReopensOn: string | null // when closed: the date it reopens
  uploadClosesOn: string | null // when open: the date it closes
  scoutYear: string | null
}

export interface UnitPending {
  unitId: string
  unitName: string
  pendingCount: number // documents awaiting the CU's review
  incompleteCount: number // members with a missing/rejected/expired doc
}

export interface DocumentCampaignAdmin {
  status: DocumentCampaignStatus
  pendingReviewCount: number
  incompleteCount: number
  onHoldCount: number
  verificationDone: boolean // no docs left pending group-wide
  errorsSent: boolean // the error-emails step already ran for this campaign
  holdApplied: boolean // the on-hold step already ran for this campaign
  units: UnitPending[]
}

export interface OnHoldMember {
  memberId: string
  name: string
  unitName: string | null
  onHoldAt: string | null
}

// French phase labels for the UI.
export const CAMPAIGN_PHASE_LABELS: Record<string, string> = {
  Inactive: 'Inactive',
  Avant: 'Avant ouverture',
  Depot: 'Dépôt',
  Verification1: 'Vérification 1',
  Correction: 'Correction',
  Verification2: 'Vérification 2',
  Termine: 'Terminée',
}

// GET /documents/campaign → status (auth-only) — drives the member/CU upload banners.
export function useDocumentCampaign() {
  return useQuery({
    queryKey: ['doc-campaign', 'status'],
    queryFn: () => apiClient.get<DocumentCampaignStatus>('/documents/campaign').then(r => r.data),
  })
}

// GET /documents/campaign/admin → the CG dashboard (status + per-unit + completion + step markers).
export function useDocumentCampaignAdmin(enabled = true) {
  return useQuery({
    queryKey: ['doc-campaign', 'admin'],
    queryFn: () => apiClient.get<DocumentCampaignAdmin>('/documents/campaign/admin').then(r => r.data),
    enabled,
  })
}

// PUT /documents/campaign → set the schedule (enabled + 5 dates + scout year). Invalidates ['doc-campaign'].
export function useUpdateDocumentCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { enabled: boolean; scoutYear: string; depositStart: string; depositDeadline: string; correctionStart: string; correctionDeadline: string; finalDeadline: string }) =>
      apiClient.put('/documents/campaign', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doc-campaign'] }),
  })
}

// POST /documents/campaign/send-errors → send the error emails now. Invalidates ['doc-campaign'].
export function useSendCampaignErrors() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post<{ sent: number; noEmail: number }>('/documents/campaign/send-errors').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doc-campaign'] }),
  })
}

// POST /documents/campaign/apply-hold → put incomplete dossiers on hold now. Invalidates ['doc-campaign'].
export function useApplyCampaignHold() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post<{ held: number; emailed: number; noEmail: number }>('/documents/campaign/apply-hold').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doc-campaign'] }),
  })
}

// GET /documents/on-hold → members currently on hold (for reactivation).
export function useOnHoldMembers(enabled = true) {
  return useQuery({
    queryKey: ['doc-campaign', 'on-hold'],
    queryFn: () => apiClient.get<OnHoldMember[]>('/documents/on-hold').then(r => r.data),
    enabled,
  })
}

// POST /documents/on-hold/{id}/reactivate → clear a member's on-hold flag. Invalidates ['doc-campaign'].
export function useReactivateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (memberId: string) => apiClient.post(`/documents/on-hold/${memberId}/reactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doc-campaign'] }),
  })
}
