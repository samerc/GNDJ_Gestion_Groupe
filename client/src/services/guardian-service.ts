import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface GuardianPhoneDto { id: string; countryCode: string; number: string; type: string; isPrimary: boolean }
export interface GuardianEmailDto { id: string; address: string; type: string; isPrimary: boolean }
export interface GuardianDto { id: string; firstName: string; lastName: string; profession: string | null; isDeceased: boolean; notes: string | null; phones: GuardianPhoneDto[]; emails: GuardianEmailDto[] }
export interface GuardianLinkDto { linkId: string; guardianId: string; relationshipType: string; isPrimaryContact: boolean; isEmergencyContact: boolean; guardian: GuardianDto }
export interface GuardianSearchDto { id: string; firstName: string; lastName: string; profession: string | null }

export function useMemberGuardians(memberId: string) {
  return useQuery({
    queryKey: ['guardians', memberId],
    queryFn: () => apiClient.get<GuardianLinkDto[]>(`/guardians/members/${memberId}/guardians`).then(r => r.data),
    enabled: !!memberId,
  })
}

export function useSearchGuardians(search: string) {
  return useQuery({
    queryKey: ['guardians-search', search],
    queryFn: () => apiClient.get<GuardianSearchDto[]>('/guardians/search', { params: { q: search } }).then(r => r.data),
    enabled: search.length >= 2,
  })
}

export function useCreateGuardian(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { firstName: string; lastName: string; profession?: string | null; isDeceased: boolean; relationshipType: string; isPrimaryContact: boolean; isEmergencyContact: boolean; notes?: string | null }) =>
      apiClient.post(`/guardians/members/${memberId}/guardians`, { memberId, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}

export function useLinkGuardian(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { guardianId: string; relationshipType: string; isPrimaryContact: boolean; isEmergencyContact: boolean }) =>
      apiClient.post(`/guardians/members/${memberId}/guardians/link`, { memberId, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}

export function useUpdateGuardian(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; firstName: string; lastName: string; profession?: string | null; isDeceased: boolean; notes?: string | null }) =>
      apiClient.put(`/guardians/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}

export function useUpdateGuardianLink(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ linkId, ...data }: { linkId: string; relationshipType: string; isPrimaryContact: boolean; isEmergencyContact: boolean }) =>
      apiClient.put(`/guardians/guardian-links/${linkId}`, { linkId, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}

export function useUnlinkGuardian(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (linkId: string) => apiClient.delete(`/guardians/guardian-links/${linkId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}

export function useAddGuardianPhone(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ guardianId, ...data }: { guardianId: string; countryCode: string; number: string; type: string; isPrimary: boolean }) =>
      apiClient.post(`/guardians/${guardianId}/phones`, { guardianId, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}

export function useAddGuardianEmail(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ guardianId, ...data }: { guardianId: string; address: string; type: string; isPrimary: boolean }) =>
      apiClient.post(`/guardians/${guardianId}/emails`, { guardianId, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}

export function useDeleteGuardianPhone(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (phoneId: string) => apiClient.delete(`/guardians/phones/${phoneId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}

export function useDeleteGuardianEmail(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (emailId: string) => apiClient.delete(`/guardians/emails/${emailId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}
