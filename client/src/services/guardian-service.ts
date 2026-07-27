// Guardians resource: parents/tutors (shared across siblings) + their phones/emails + per-member links. Mutations invalidate ['guardians', memberId]. Guardian list keyed ['guardians', memberId].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface GuardianPhoneDto { id: string; countryCode: string; number: string; type: string; isPrimary: boolean }
export interface GuardianEmailDto { id: string; address: string; type: string; isPrimary: boolean }
export interface GuardianDto { id: string; firstName: string; lastName: string; profession: string | null; professionDomain: string | null; isDeceased: boolean; notes: string | null; phones: GuardianPhoneDto[]; emails: GuardianEmailDto[] }
export interface GuardianLinkDto { linkId: string; guardianId: string; relationshipType: string; isPrimaryContact: boolean; isEmergencyContact: boolean; guardian: GuardianDto }
export interface GuardianSearchDto { id: string; firstName: string; lastName: string; profession: string | null }

// A member's guardian links (GET /guardians/members/:id/guardians). Keyed ['guardians', memberId].
export function useMemberGuardians(memberId: string) {
  return useQuery({
    queryKey: ['guardians', memberId],
    queryFn: () => apiClient.get<GuardianLinkDto[]>(`/guardians/members/${memberId}/guardians`).then(r => r.data),
    enabled: !!memberId,
  })
}

// Guardian typeahead (GET /guardians/search?q=) for linking an existing guardian; fires at ≥2 chars. Keyed ['guardians-search', search].
export function useSearchGuardians(search: string) {
  return useQuery({
    queryKey: ['guardians-search', search],
    queryFn: () => apiClient.get<GuardianSearchDto[]>('/guardians/search', { params: { q: search } }).then(r => r.data),
    enabled: search.length >= 2,
  })
}

// POST /guardians/members/:id/guardians — create + link a new guardian. Invalidates ['guardians', memberId].
export function useCreateGuardian(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { firstName: string; lastName: string; profession?: string | null; professionDomain?: string | null; isDeceased: boolean; relationshipType: string; isPrimaryContact: boolean; isEmergencyContact: boolean; notes?: string | null }) =>
      apiClient.post(`/guardians/members/${memberId}/guardians`, { memberId, ...data }),
    // Also refresh the member's "Famille" tab-count badge (member.counts on ['members', memberId]).
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['guardians', memberId] }); qc.invalidateQueries({ queryKey: ['members', memberId] }) },
  })
}

// POST /guardians/members/:id/guardians/link — link an existing guardian (sibling sharing). Invalidates ['guardians', memberId].
export function useLinkGuardian(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { guardianId: string; relationshipType: string; isPrimaryContact: boolean; isEmergencyContact: boolean }) =>
      apiClient.post(`/guardians/members/${memberId}/guardians/link`, { memberId, ...data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['guardians', memberId] }); qc.invalidateQueries({ queryKey: ['members', memberId] }) },
  })
}

// PUT /guardians/:id — edit the shared guardian record (name/profession/etc.). Invalidates ['guardians', memberId].
export function useUpdateGuardian(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; firstName: string; lastName: string; profession?: string | null; professionDomain?: string | null; isDeceased: boolean; notes?: string | null }) =>
      apiClient.put(`/guardians/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}

// PUT /guardians/guardian-links/:linkId — edit this member's link (relationship, primary/emergency flags). Invalidates ['guardians', memberId].
export function useUpdateGuardianLink(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ linkId, ...data }: { linkId: string; relationshipType: string; isPrimaryContact: boolean; isEmergencyContact: boolean }) =>
      apiClient.put(`/guardians/guardian-links/${linkId}`, { linkId, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}

// DELETE /guardians/guardian-links/:linkId — unlink (guardian record kept for other members). Invalidates ['guardians', memberId].
export function useUnlinkGuardian(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (linkId: string) => apiClient.delete(`/guardians/guardian-links/${linkId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['guardians', memberId] }); qc.invalidateQueries({ queryKey: ['members', memberId] }) },
  })
}

// POST /guardians/:guardianId/phones; memberId only scopes cache invalidation ['guardians', memberId].
export function useAddGuardianPhone(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ guardianId, ...data }: { guardianId: string; countryCode: string; number: string; type: string; isPrimary: boolean }) =>
      apiClient.post(`/guardians/${guardianId}/phones`, { guardianId, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}

// POST /guardians/:guardianId/emails; memberId only scopes cache invalidation ['guardians', memberId].
export function useAddGuardianEmail(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ guardianId, ...data }: { guardianId: string; address: string; type: string; isPrimary: boolean }) =>
      apiClient.post(`/guardians/${guardianId}/emails`, { guardianId, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}

// DELETE /guardians/phones/:phoneId; memberId only scopes cache invalidation ['guardians', memberId].
export function useDeleteGuardianPhone(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (phoneId: string) => apiClient.delete(`/guardians/phones/${phoneId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}

// DELETE /guardians/emails/:emailId; memberId only scopes cache invalidation ['guardians', memberId].
export function useDeleteGuardianEmail(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (emailId: string) => apiClient.delete(`/guardians/emails/${emailId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}

// ── SELF-SERVICE variants (Ma fiche → Famille) ────────────────────────────────
// Same call signatures as the leader hooks above, but hit /my-profile/* (auth-only, own-scoped server-side,
// no members.edit). No search / no link-existing (a member must not enumerate other families' guardians).
export function useCreateMyGuardian(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { firstName: string; lastName: string; profession?: string | null; professionDomain?: string | null; isDeceased: boolean; relationshipType: string; isPrimaryContact: boolean; isEmergencyContact: boolean; notes?: string | null }) =>
      apiClient.post('/my-profile/guardians', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}
export function useUpdateMyGuardian(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; firstName: string; lastName: string; profession?: string | null; professionDomain?: string | null; isDeceased: boolean; notes?: string | null }) =>
      apiClient.put(`/my-profile/guardians/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}
export function useUpdateMyGuardianLink(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ linkId, ...data }: { linkId: string; relationshipType: string; isPrimaryContact: boolean; isEmergencyContact: boolean }) =>
      apiClient.put(`/my-profile/guardian-links/${linkId}`, { linkId, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}
export function useUnlinkMyGuardian(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (linkId: string) => apiClient.delete(`/my-profile/guardian-links/${linkId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}
export function useAddMyGuardianPhone(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ guardianId, ...data }: { guardianId: string; countryCode: string; number: string; type: string; isPrimary: boolean }) =>
      apiClient.post(`/my-profile/guardians/${guardianId}/phones`, { guardianId, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}
export function useAddMyGuardianEmail(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ guardianId, ...data }: { guardianId: string; address: string; type: string; isPrimary: boolean }) =>
      apiClient.post(`/my-profile/guardians/${guardianId}/emails`, { guardianId, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}
export function useDeleteMyGuardianPhone(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (phoneId: string) => apiClient.delete(`/my-profile/guardian-phones/${phoneId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}
export function useDeleteMyGuardianEmail(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (emailId: string) => apiClient.delete(`/my-profile/guardian-emails/${emailId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardians', memberId] }),
  })
}
