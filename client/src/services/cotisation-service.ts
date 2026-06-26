import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface CotisationPaymentDto {
  id: string
  amount: number
  currency: string
  paymentMethod: string
}

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

export interface UnpaidCotisationDto {
  memberId: string
  memberName: string
  unitName: string
}

export interface CurrencyTotalDto {
  currency: string
  total: number
  count: number
}

export interface UnitCotisationSummaryDto {
  unitName: string
  totalMembers: number
  paidMembers: number
  exemptMembers: number
  totals: CurrencyTotalDto[]
}

export interface CotisationSummaryDto {
  totalActiveMembers: number
  membersWithPayment: number
  membersWithoutPayment: number
  membersExempt: number
  totalsByCurrency: CurrencyTotalDto[]
  byUnit: UnitCotisationSummaryDto[]
}

export function useMemberCotisations(memberId: string) {
  return useQuery({
    queryKey: ['cotisations', memberId],
    queryFn: () => apiClient.get<MemberCotisationDto[]>(`/cotisations/member/${memberId}`).then(r => r.data),
    enabled: !!memberId,
  })
}

export function useCreateCotisation(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CotisationFormData) => apiClient.post('/cotisations', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotisations', memberId] })
      qc.invalidateQueries({ queryKey: ['documents', 'matrix'] })
    },
  })
}

export function useUpdateCotisation(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; paymentDate: string; notes?: string | null; payments: PaymentLineInput[] }) =>
      apiClient.put(`/cotisations/${id}`, { id, ...data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotisations', memberId] })
      qc.invalidateQueries({ queryKey: ['documents', 'matrix'] })
    },
  })
}

// Mark/unmark a member as exempt ("ne paiera pas") for a scout year. Shared CU/CG flag.
export function useSetCotisationExempt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { memberId: string; scoutYear: string; willNotPay: boolean }) =>
      apiClient.put('/cotisations/exempt', data),
    onSuccess: (_r, data) => {
      qc.invalidateQueries({ queryKey: ['cotisations', data.memberId] })
      qc.invalidateQueries({ queryKey: ['documents', 'matrix'] })
      qc.invalidateQueries({ queryKey: ['cotisations', 'summary'] })
    },
  })
}

export function useDeleteCotisation(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/cotisations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotisations', memberId] })
      qc.invalidateQueries({ queryKey: ['documents', 'matrix'] })
    },
  })
}

export function useCotisationSummary(scoutYear: string) {
  return useQuery({
    queryKey: ['cotisations', 'summary', scoutYear],
    queryFn: () => apiClient.get<CotisationSummaryDto>('/cotisations/summary', { params: { scoutYear } }).then(r => r.data),
    enabled: !!scoutYear,
  })
}

export function useUnpaidCotisations(scoutYear: string) {
  return useQuery({
    queryKey: ['cotisations', 'unpaid', scoutYear],
    queryFn: () => apiClient.get<UnpaidCotisationDto[]>('/cotisations/unpaid', { params: { scoutYear } }).then(r => r.data),
    enabled: !!scoutYear,
  })
}

export function downloadReceipt(id: string) {
  return apiClient.get(`/cotisations/${id}/receipt`, { responseType: 'blob' })
}
