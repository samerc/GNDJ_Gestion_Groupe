// CG-side enrollment-request (demande) review resource: triage/filter, single + bulk decide, quotas,
// statistics, and "send responses" (converts approved demandes → members, emails applicants).
// Authenticated apiClient; keyed on ['demandes', ...].
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { ApplicantGuardian, ApplicantScoutRelation, DemandeInput } from '@/services/applicant-service'

export interface Sibling { id: string; firstName: string; lastName: string; status: string; responseSent: boolean }

export interface DemandeReview {
  id: string
  scoutYear: string
  serialNumber: string | null // human-facing reference (INS-YYYY-NNNN); null for an unsubmitted draft
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
  phoneCountryCode?: string | null // carried for the merge tool (kept null in the review table otherwise)
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
  parentsSituation: string | null // Unis / Séparés / Divorcés
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
  accountId?: string // set when arriving from the "Comptes d'inscription" page to view one account's demandes
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
    // Without a staleTime, every admin-page navigation re-mounts the sidebar and re-fetches this. Match it
    // just under the poll interval so navigation reads from cache but the badge still refreshes each minute.
    staleTime: 55_000,
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

// The shared household (address + situation + parents/tuteurs + proches scouts) as edited by the CG. Same shape
// the applicant wizard saves; editing it here affects every sibling demande on the account.
export interface AdminEditHousehold {
  contactName?: string | null
  addressCountry?: string | null
  addressCity?: string | null
  addressDetails?: string | null
  primaryContactEmail?: string | null
  parentsSituation?: string | null
  guardians: ApplicantGuardian[]
  scoutRelations: ApplicantScoutRelation[]
}

// PUT /demandes/{id} → CG edit of the full file (child + household), bypassing the submission deadline. Blocked
// server-side once a member was created. Invalidates ['demandes'] so the drawer/table refresh.
export function useAdminEditDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, child, household }: { id: string; child: DemandeInput; household: AdminEditHousehold }) =>
      apiClient.put(`/demandes/${id}`, { child, household }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['demandes'] }) },
  })
}

// DELETE /demandes/{id} → soft-delete a single demande (junk/spam/duplicate cleanup). Blocked server-side once
// a member was created. Invalidates ['demandes'].
export function useDeleteDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/demandes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['demandes'] }) },
  })
}

// PUT /demandes/{id}/unit → save the pre-selected unit WITHOUT deciding (staged); status stays as-is.
// Lets the CG lock in / change "unité d'affectation (si accepté)" and come back later. Invalidates ['demandes'].
export function useSetDemandeUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { id: string; decidedUnitId: string | null }) =>
      apiClient.put(`/demandes/${data.id}/unit`, { decidedUnitId: data.decidedUnitId }),
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

// One applicant (parent) account row for the CG "Comptes d'inscription" list.
export interface DemandeAccount {
  id: string
  email: string
  contactName: string | null
  emailVerified: boolean
  isActive: boolean
  demandeCount: number
  submittedCount: number
  createdAt: string
}

// GET /demandes/accounts → applicant accounts (incl. unverified ones with no demande, so a parent whose
// verification email failed is visible). Optional unverifiedOnly + notSubmittedOnly + search.
// notSubmittedOnly = accounts with no submitted demande (the "Relancer les non-soumis" audience).
export function useDemandeAccounts(unverifiedOnly: boolean, search: string, notSubmittedOnly = false) {
  return useQuery({
    queryKey: ['demandes', 'accounts', unverifiedOnly, search, notSubmittedOnly],
    queryFn: () => apiClient.get<DemandeAccount[]>('/demandes/accounts', { params: { unverifiedOnly, notSubmittedOnly, search: search || undefined } }).then((r) => r.data),
  })
}

// POST /demandes/accounts/{id}/verify-email → CG manually marks the account verified (safety net); invalidates the list.
export function useVerifyAccountEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/demandes/accounts/${id}/verify-email`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demandes', 'accounts'] }),
  })
}

// POST /demandes/accounts/{id}/reset-password → CG resets the parent's portal password; returns the temp
// password once (shown on screen for the CG to relay).
export interface ResetApplicantPasswordResult { email: string; temporaryPassword: string }
export function useResetAccountPassword() {
  return useMutation({
    mutationFn: (id: string) => apiClient.post<ResetApplicantPasswordResult>(`/demandes/accounts/${id}/reset-password`).then((r) => r.data),
  })
}

// DELETE /demandes/accounts/{id} → hard-delete the account and ALL its demandes/guardians/relations. Any
// member already created from a demande is kept. Returns {demandesDeleted}; invalidates the list.
export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<{ demandesDeleted: number }>(`/demandes/accounts/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demandes', 'accounts'] }),
  })
}

// ── Reminders (G) ───────────────────────────────────────────────────────────────────────────────────
// GET /demandes/unsubmitted-count?scoutYear → how many accounts have no submitted demande (reminder audience).
export function useUnsubmittedCount(scoutYear: string) {
  return useQuery({
    queryKey: ['demandes', 'unsubmitted-count', scoutYear],
    queryFn: () => apiClient.get<{ count: number }>('/demandes/unsubmitted-count', { params: { scoutYear } }).then((r) => r.data.count),
    enabled: !!scoutYear,
  })
}

// POST /demandes/send-submission-reminders → email the "please submit" reminder to those accounts.
export function useSendSubmissionReminders() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scoutYear: string) => apiClient.post<{ sent: number }>('/demandes/send-submission-reminders', { scoutYear }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demandes', 'unsubmitted-count'] }),
  })
}

// ── Archive browse (H) ──────────────────────────────────────────────────────────────────────────────
export interface DemandeArchive {
  id: string; scoutYear: string; firstName: string; lastName: string; dateOfBirth: string | null
  gender: string | null; classe: string | null; school: string | null
  accountEmail: string | null; contactName: string | null
  status: string; decidedUnitName: string | null; decisionNotes: string | null; responseSentAt: string | null
  createdMemberCardNumber: string | null; archivedAt: string
}
export interface DemandeArchiveList { items: DemandeArchive[]; total: number; scoutYears: string[] }

// GET /demandes/archives?search&scoutYear&page&pageSize → paged archive of past campaigns.
export function useDemandeArchives(search: string, scoutYear: string, page: number, pageSize = 50) {
  return useQuery({
    queryKey: ['demandes', 'archives', search, scoutYear, page, pageSize],
    queryFn: () => apiClient.get<DemandeArchiveList>('/demandes/archives', {
      params: { search: search || undefined, scoutYear: scoutYear || undefined, page, pageSize },
    }).then((r) => r.data),
  })
}

// ── Excel decisions round-trip (I) ──────────────────────────────────────────────────────────────────
export interface ImportDecisionsResult { applied: number; skipped: number; errors: string[] }

// GET /demandes/export-decisions?scoutYear → returns the .xlsx blob (Décision/Unité/Motif to fill).
export function useExportDecisions() {
  return useMutation({
    mutationFn: (scoutYear: string) =>
      apiClient.get('/demandes/export-decisions', { params: { scoutYear }, responseType: 'blob' })
        .then((r) => ({ blob: r.data as Blob, fileName: `Demandes_${scoutYear.replace(/\s/g, '')}.xlsx` })),
  })
}

// POST /demandes/import-decisions (multipart) → stage the decisions from a filled sheet; invalidates ['demandes'].
export function useImportDecisions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scoutYear, file }: { scoutYear: string; file: File }) => {
      const fd = new FormData()
      fd.append('scoutYear', scoutYear)
      fd.append('file', file)
      return apiClient.post<ImportDecisionsResult>('/demandes/import-decisions', fd).then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demandes'] }),
  })
}

// ── Duplicate demandes (merge) ──────────────────────────────────────────────────────────────────────
// A group of demandes that look like the same child submitted more than once.
export interface DuplicateDemandeGroup { demandes: DemandeReview[]; evidence: string }

// The field VALUES chosen to keep on the merged (keeper) demande + its account.
export interface DemandeMergeFields {
  firstName: string; lastName: string; dateOfBirth: string | null; gender: string | null; nationality: string | null
  school: string | null; classe: string | null; section: string | null; bloodType: string | null
  medicalNotes: string | null; allergies: string | null
  phoneCountryCode: string | null; phoneNumber: string | null; email: string | null; parentNotes: string | null
  hasPreviousDemande: boolean; previousDemandeYear: string | null
  addressCountry: string | null; addressCity: string | null; addressDetails: string | null
  parentsSituation: string | null
}

export interface MergeDemandesResult { losersMerged: number; accountsDeleted: number; emailsQueued: number }

// GET /demandes/duplicates?scoutYear → groups of duplicate demandes to merge; requires scoutYear.
export function useDuplicateDemandes(scoutYear: string) {
  return useQuery({
    queryKey: ['demandes', 'duplicates', scoutYear],
    queryFn: () => apiClient.get<DuplicateDemandeGroup[]>('/demandes/duplicates', { params: { scoutYear } }).then((r) => r.data),
    enabled: !!scoutYear,
  })
}

// POST /demandes/merge → merge losers onto the keeper (chosen fields + item-by-item parents/proches), delete the
// loser demande(s) + any now-empty account, optionally email. Invalidates ['demandes'].
export function useMergeDemandes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      keeperId: string; loserIds: string[]; fields: DemandeMergeFields
      keepGuardianIds: string[]; keepScoutRelationIds: string[]; sendEmail: boolean
    }) => apiClient.post<MergeDemandesResult>('/demandes/merge', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demandes'] }),
  })
}

// ── Rejection reasons (managed list) ────────────────────────────────────────────────────────────────
// Each reason has a short CODE the Maîtrise types in the Excel Décision column (or picks in the web decline
// dialog); the picked reason's TEXT is stored on the demande and emailed as {{reason}}. One may be default
// ("--" in Excel maps to it).
export interface RejectionReason { code: string; label: string; text: string; isDefault: boolean }

// ── Late-submission invites ─────────────────────────────────────────────────────────────────────────
// A CG-generated link that lets ONE family enroll after the deadline (without reopening for everyone). status =
// active | claimed | expired | revoked. The frontend builds the full link from the token.
export interface DemandeInvite {
  id: string; token: string; scoutYear: string; label: string | null; email: string | null
  expiresAt: string; status: string; claimedEmail: string | null; claimedAt: string | null; createdAt: string
}

export function useDemandeInvites() {
  return useQuery({
    queryKey: ['demandes', 'invites'],
    queryFn: () => apiClient.get<DemandeInvite[]>('/demandes/invites').then((r) => r.data),
  })
}

export function useCreateDemandeInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { label?: string; email?: string; validDays?: number }) =>
      apiClient.post<DemandeInvite>('/demandes/invites', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demandes', 'invites'] }),
  })
}

export function useRevokeDemandeInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/demandes/invites/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demandes', 'invites'] }),
  })
}

export function useRejectionReasons() {
  return useQuery({
    queryKey: ['demandes', 'rejection-reasons'],
    queryFn: () => apiClient.get<RejectionReason[]>('/demandes/rejection-reasons').then((r) => r.data),
  })
}

export function useUpdateRejectionReasons() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reasons: RejectionReason[]) => apiClient.put('/demandes/rejection-reasons', { reasons }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demandes', 'rejection-reasons'] }),
  })
}
