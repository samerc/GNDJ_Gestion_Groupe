import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface MemberCotisationDto {
  id: string
  memberId: string
  schoolYear: string
  amountPaid: number
  currency: string
  paymentDate: string
  paymentMethod: string
  receiptNumber: string
  notes: string | null
  createdAt: string
}

export interface CotisationFormData {
  memberId: string
  schoolYear: string
  amountPaid: number
  currency: string
  paymentDate: string
  paymentMethod: string
  notes?: string | null
}

export interface UnpaidCotisationDto {
  memberId: string
  memberName: string
  unitName: string
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
    mutationFn: ({ id, ...data }: { id: string; amountPaid: number; currency: string; paymentDate: string; paymentMethod: string; notes?: string | null }) =>
      apiClient.put(`/cotisations/${id}`, { id, ...data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotisations', memberId] })
      qc.invalidateQueries({ queryKey: ['documents', 'matrix'] })
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

export function useUnpaidCotisations(schoolYear: string) {
  return useQuery({
    queryKey: ['cotisations', 'unpaid', schoolYear],
    queryFn: () => apiClient.get<UnpaidCotisationDto[]>('/cotisations/unpaid', { params: { schoolYear } }).then(r => r.data),
    enabled: !!schoolYear,
  })
}

export function downloadReceipt(id: string) {
  return apiClient.get(`/cotisations/${id}/receipt`, { responseType: 'blob' })
}
