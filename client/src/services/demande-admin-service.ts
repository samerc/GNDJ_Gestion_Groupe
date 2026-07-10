// CG-side enrollment-request (demande) review resource: triage/filter, single + bulk decide, quotas,
// statistics, and "send responses" (converts approved demandes → members, emails applicants).
// Authenticated apiClient; keyed on ['demandes', ...].
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { ApplicantGuardian, ApplicantScoutRelation } from '@/services/applicant-service'

export interface Sibling { id: string; firstName: string; lastName: string; status: string; responseSent: boolean }

export interface DemandeReview {
  id: string
  scoutYear: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  age: number | null
  gender: string | null
  nationality: string | null
  school: string | null
  classe: string | null
  section: string | null
  bloodType: string | null
  medicalNotes: string | null
  allergies: string | null
  phoneNumber: string | null
  email: string | null
  parentNotes: string | null
  hasPreviousDemande?: boolean
  previousDemandeYear?: string | null
  status: string
  decidedUnitId: string | null
  decidedUnitName: string | null
  decisionNotes: string | null
  submittedAt: string | null
  responseSentAt: string | null
  createdMemberId: string | null
  accountId: string
  accountEmail: string
  contactName: string | null
  addressCountry: string | null
  addressCity: string | null
  addressDetails: string | null
  guardians: ApplicantGuardian[]
  scoutRelations: ApplicantScoutRelation[]
  siblings: Sibling[]
}

export interface UnitOccupancy {
  unitId: string
  unitCode: string
  unitName: string
  associationName: string
  unitTypeId: string
  gender: string | null
  ageMin: number | null
  ageMax: number | null
  currentActive: number
  projected: number
  quota: number | null
  accepted: number
}

export interface DemandeFilters {
  status?: string
  gender?: string
  classe?: string
  school?: string
  ageMin?: number
  ageMax?: number
  unitId?: string
}

export interface CountItem { label: string; count: number }

export interface DemandeStatistics {
  scoutYear: string
  total: number
  pending: number
  approved: number
  declined: number
  responsesSent: number
  decided: number
  drafts: number
  byGender: CountItem[]
  byAgeGroup: CountItem[]
  byClasse: CountItem[]
  bySchool: CountItem[]
  siblingGroups: number
  siblingDemandes: number
  withScoutRelations: number
  incompleteDossiers: number
}

// GET /demandes?scoutYear&...filters → full review rows for the CG triage table; requires scoutYear (else disabled).
export function useDemandesForReview(scoutYear: string, filters: DemandeFilters) {
  return useQuery({
    queryKey: ['demandes', 'review', scoutYear, filters],
    queryFn: () => apiClient.get<DemandeReview[]>('/demandes', { params: { scoutYear, ...filters } }).then((r) => r.data),
    enabled: !!scoutYear,
  })
}

// GET /demandes/pending-count → sidebar badge count; polls every 60s. Gated by `enabled`.
export function usePendingDemandeCount(enabled: boolean) {
  return useQuery({
    queryKey: ['demandes', 'pending-count'],
    queryFn: () => apiClient.get<{ count: number }>('/demandes/pending-count').then((r) => r.data.count),
    enabled,
    refetchInterval: 60000,
  })
}

// GET /demandes/statistics?scoutYear → CG stats dashboard (pipeline, demographics, families); requires scoutYear.
export function useDemandeStatistics(scoutYear: string) {
  return useQuery({
    queryKey: ['demandes', 'statistics', scoutYear],
    queryFn: () => apiClient.get<DemandeStatistics>('/demandes/statistics', { params: { scoutYear } }).then((r) => r.data),
    enabled: !!scoutYear,
  })
}

// GET /demandes/occupancy?scoutYear → per-unit capacity (current/projected/quota/accepted); requires scoutYear.
export function useUnitOccupancy(scoutYear: string) {
  return useQuery({
    queryKey: ['demandes', 'occupancy', scoutYear],
    queryFn: () => apiClient.get<UnitOccupancy[]>('/demandes/occupancy', { params: { scoutYear } }).then((r) => r.data),
    enabled: !!scoutYear,
  })
}

// PUT /demandes/{id}/decide → accept (with unit) or decline (with motif) one demande; invalidates ['demandes'].
// Decision stays hidden from the applicant until "send responses". Approve needs decidedUnitId.
export function useDecideDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { id: string; status: string; decidedUnitId?: string | null; decisionNotes?: string | null }) =>
      apiClient.put(`/demandes/${data.id}/decide`, { status: data.status, decidedUnitId: data.decidedUnitId, decisionNotes: data.decisionNotes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['demandes'] }) },
  })
}

// POST /demandes/bulk-decide → decide many at once (per-item unit), skips already-sent. Returns {processed, skipped}; invalidates ['demandes'].
export function useBulkDecideDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { status: string; decisionNotes?: string | null; items: { id: string; decidedUnitId?: string | null }[] }) =>
      apiClient.post<{ processed: number; skipped: number }>('/demandes/bulk-decide', data).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['demandes'] }) },
  })
}

// PUT /demandes/quota → set a unit's intake quota for the year; invalidates the occupancy cache.
export function useSetIntakeQuota() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { unitId: string; scoutYear: string; quota: number }) => apiClient.put('/demandes/quota', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demandes', 'occupancy'] }),
  })
}

// POST /demandes/send-responses → advisory-locked, idempotent batch: approved demandes → real members + emails
// applicants; blocked if any submitted demande is undecided. Returns {approved, declined}; invalidates demandes + members.
export function useSendResponses() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scoutYear: string) => apiClient.post<{ approved: number; declined: number }>('/demandes/send-responses', { scoutYear }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['demandes'] }); qc.invalidateQueries({ queryKey: ['members'] }) },
  })
}

// POST /demandes/close-campaign → archives every demande + outcome, HARD-deletes all applicant data, and
// disables inscriptions. Irreversible. Returns {archived, accountsDeleted}; invalidates demandes.
export function useCloseCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scoutYear: string) => apiClient.post<{ archived: number; accountsDeleted: number }>('/demandes/close-campaign', { scoutYear }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['demandes'] }); qc.invalidateQueries({ queryKey: ['settings'] }) },
  })
}

export interface DemandeCampaignStatus { enabled: boolean; submissionsOpen: boolean; scoutYear: string }

// GET /demandes/campaign-status → portal open? submission window open? scout year (drives the CG toggle).
export function useCampaignStatus() {
  return useQuery({
    queryKey: ['demandes', 'campaign-status'],
    queryFn: () => apiClient.get<DemandeCampaignStatus>('/demandes/campaign-status').then((r) => r.data),
  })
}

// POST /demandes/submissions → open/close the submission window (inner period). Closing starts the review phase.
export function useSetSubmissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (open: boolean) => apiClient.post('/demandes/submissions', { open }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['demandes', 'campaign-status'] }); qc.invalidateQueries({ queryKey: ['settings'] }) },
  })
}
