// Cotisations resource: per-member yearly dues (multi-currency payment lines), exempt flag, receipt PDF,
// and CG summary/unpaid views. Mutations also invalidate the docs matrix (shares the cotisation cell).
// Queries key on ['cotisations', ...].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface CotisationPaymentDto {
  id: string
  amount: number
  currency: string
  paymentMethod: string
}

// Status is computed server-side (proportion-per-currency against the configured full price):
// 'Paid' (fully covered) / 'Partial' (paid, short of full) / 'Unpaid' / 'Exempt'. percentPaid + remainingReference
// (in referenceCurrency) express how much is left. fullPricingConfigured = a full price is set (else any payment = Paid).
export type CotisationStatus = 'Paid' | 'Partial' | 'Unpaid' | 'Exempt'
export interface MemberCotisationDto {
  id: string
  memberId: string
  scoutYear: string
  paymentDate: string
  receiptNumber: string
  notes: string | null
  willNotPay: boolean
  payments: CotisationPaymentDto[]
  createdAt: string
  status: CotisationStatus
  percentPaid: number
  remainingReference: number
  equivalentReference: number
  referenceCurrency: string
  fullPricingConfigured: boolean
}

export interface PaymentLineInput {
  amount: number
  currency: string
  paymentMethod: string
}

export interface CotisationFormData {
  memberId: string
  scoutYear: string
  paymentDate: string
  notes?: string | null
  payments: PaymentLineInput[]
}

// "À relancer" row = a member who paid NOTHING (status 'Unpaid') or only PART of the fee (status 'Partial').
// For a partial payer: paidTotals = what they've paid so far (per currency), percentPaid + remainingReference
// (in referenceCurrency) = how much is left.
export interface UnpaidCotisationDto {
  memberId: string
  memberName: string
  unitId: string
  unitName: string
  contactEmail: string | null
  contactPhone: string | null
  parentName: string | null
  status: CotisationStatus
  percentPaid: number
  remainingReference: number
  referenceCurrency: string
  paidTotals: CurrencyTotalDto[]
}

// A member marked exempt ("ne paiera pas") for the year — shown in the CG dashboard's per-unit "Exemptés"
// list with the reason (if one was noted when the exemption was set).
export interface ExemptCotisationDto {
  memberId: string
  memberName: string
  unitId: string
  unitName: string
  reason: string | null
}

export interface CurrencyTotalDto {
  currency: string
  total: number
  count: number
}

// A member who PAID for the year — shown in the CG dashboard's per-unit "Ont payé" list with amounts +
// a receipt download (cotisationId → GET /cotisations/{id}/receipt).
export interface PaidCotisationDto {
  memberId: string
  memberName: string
  unitId: string
  unitName: string
  cotisationId: string
  receiptNumber: string
  paymentDate: string
  totals: CurrencyTotalDto[]
  status: CotisationStatus
  percentPaid: number
  equivalentReference: number
  referenceCurrency: string
}

export interface UnitCotisationSummaryDto {
  unitName: string
  unitCode: string
  totalMembers: number
  paidMembers: number
  partialMembers: number
  exemptMembers: number
  totals: CurrencyTotalDto[]
  equivalentTotal: number
}

// membersWithPayment = FULLY paid; membersPartial = paid but short. equivalentTotal = all payments converted
// into referenceCurrency (the "≈ $X collected" figure). fullPricingConfigured = a full price is set.
export interface CotisationSummaryDto {
  totalActiveMembers: number
  membersWithPayment: number
  membersPartial: number
  membersWithoutPayment: number
  membersExempt: number
  totalsByCurrency: CurrencyTotalDto[]
  equivalentTotal: number
  referenceCurrency: string
  fullPricingConfigured: boolean
  byUnit: UnitCotisationSummaryDto[]
}

// GET /cotisations/member/{id} — one member's cotisations (all years). Keyed ['cotisations', memberId].
export function useMemberCotisations(memberId: string) {
  return useQuery({
    queryKey: ['cotisations', memberId],
    queryFn: () => apiClient.get<MemberCotisationDto[]>(`/cotisations/member/${memberId}`).then(r => r.data),
    enabled: !!memberId,
  })
}

// POST /cotisations — one record per member+year with payment lines; returns it (receipt# auto-gen).
export function useCreateCotisation(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CotisationFormData) => apiClient.post('/cotisations', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotisations', memberId] })
      qc.invalidateQueries({ queryKey: ['documents', 'matrix'] })
      // Recording a payment flips the member list "cotisation OK" flag, tab counts, summary + dashboard.
      qc.invalidateQueries({ queryKey: ['cotisations', 'summary'] })
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// PUT /cotisations/{id} — edit date/notes/payment lines.
export function useUpdateCotisation(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; paymentDate: string; notes?: string | null; payments: PaymentLineInput[] }) =>
      apiClient.put(`/cotisations/${id}`, { id, ...data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotisations', memberId] })
      qc.invalidateQueries({ queryKey: ['documents', 'matrix'] })
      qc.invalidateQueries({ queryKey: ['cotisations', 'summary'] })
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// Mark/unmark a member as exempt ("ne paiera pas") for a scout year. Shared CU/CG flag. An optional
// reason is stored on the exemption and shown in the CG dashboard's exempt list.
export function useSetCotisationExempt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { memberId: string; scoutYear: string; willNotPay: boolean; reason?: string | null }) =>
      apiClient.put('/cotisations/exempt', data),
    onSuccess: (_r, data) => {
      qc.invalidateQueries({ queryKey: ['cotisations', data.memberId] })
      qc.invalidateQueries({ queryKey: ['documents', 'matrix'] })
      qc.invalidateQueries({ queryKey: ['cotisations', 'summary'] })
      qc.invalidateQueries({ queryKey: ['cotisations', 'exempt'] })
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// DELETE /cotisations/{id} — removes the cotisation and its receipt (soft-delete; receipts are generated
// on demand from the cotisation, so deleting it removes the receipt too).
export function useDeleteCotisation(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/cotisations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotisations', memberId] })
      qc.invalidateQueries({ queryKey: ['documents', 'matrix'] })
      qc.invalidateQueries({ queryKey: ['cotisations', 'summary'] })
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// GET /cotisations/summary — group totals + per-unit paid/exempt counts; requires scoutYear.
// Keyed ['cotisations','summary',scoutYear].
export function useCotisationSummary(scoutYear: string) {
  return useQuery({
    queryKey: ['cotisations', 'summary', scoutYear],
    queryFn: () => apiClient.get<CotisationSummaryDto>('/cotisations/summary', { params: { scoutYear } }).then(r => r.data),
    enabled: !!scoutYear,
  })
}

// GET /cotisations/unpaid — members with no payment (excludes exempt) for the year; requires scoutYear.
export function useUnpaidCotisations(scoutYear: string) {
  return useQuery({
    queryKey: ['cotisations', 'unpaid', scoutYear],
    queryFn: () => apiClient.get<UnpaidCotisationDto[]>('/cotisations/unpaid', { params: { scoutYear } }).then(r => r.data),
    enabled: !!scoutYear,
  })
}

// GET /cotisations/paid — members who paid (with amounts + receipt id) for the year; requires scoutYear.
export function usePaidCotisations(scoutYear: string) {
  return useQuery({
    queryKey: ['cotisations', 'paid', scoutYear],
    queryFn: () => apiClient.get<PaidCotisationDto[]>('/cotisations/paid', { params: { scoutYear } }).then(r => r.data),
    enabled: !!scoutYear,
  })
}

// GET /cotisations/exempt-list — members marked "ne paiera pas" (with reason) for the year; requires scoutYear.
export function useExemptCotisations(scoutYear: string) {
  return useQuery({
    queryKey: ['cotisations', 'exempt', scoutYear],
    queryFn: () => apiClient.get<ExemptCotisationDto[]>('/cotisations/exempt-list', { params: { scoutYear } }).then(r => r.data),
    enabled: !!scoutYear,
  })
}

// ── Association dues report (what the group owes each association) ─────────────────────────────────
// Per association: per-member amount × members (two counts: all vs paid). Maîtrise is a separate line at
// the maîtrise rate. Internal CG figure (maitrise.manage).
export interface AssociationDueRowDto {
  associationId: string
  associationName: string
  amountPerMember: number
  membersAll: number
  membersPaid: number
  totalAll: number
  totalPaid: number
}
export interface MaitriseDueRowDto {
  pays: boolean
  amountPerMember: number
  membersAll: number
  membersPaid: number
  totalAll: number
  totalPaid: number
}
export interface AssociationDuesDto {
  currency: string
  associations: AssociationDueRowDto[]
  maitrise: MaitriseDueRowDto
}

// GET /cotisations/association-dues — dues owed per association + maîtrise line for the year; requires scoutYear.
export function useAssociationDues(scoutYear: string) {
  return useQuery({
    queryKey: ['cotisations', 'association-dues', scoutYear],
    queryFn: () => apiClient.get<AssociationDuesDto>('/cotisations/association-dues', { params: { scoutYear } }).then(r => r.data),
    enabled: !!scoutYear,
  })
}

// GET /cotisations/{id}/receipt — receipt PDF as a blob (not a hook).
export function downloadReceipt(id: string) {
  return apiClient.get(`/cotisations/${id}/receipt`, { responseType: 'blob' })
}
