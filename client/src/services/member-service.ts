// Members resource: list/detail CRUD, contact sub-resources (phones/emails/addresses), photo upload,
// and password reset. All calls are unit-scoped server-side; queries key on ['members', ...].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { PaginatedResult } from '@/types/api'

export interface MemberListDto {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  gender: string | null
  cardNumber: string | null
  externalCardNumber: string | null
  primaryEmail: string | null
  primaryPhone: string | null
  photoPath: string | null
  unitName: string | null
  teamName: string | null
  roleName: string | null
  roleRank: number | null
  fatherName: string | null
}

export interface MemberDetailDto {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  gender: string | null
  cardNumber: string | null
  externalCardNumber: string | null
  bloodType: string | null
  nationality: string | null
  school: string | null
  classe: string | null
  section: string | null
  medicalNotes: string | null
  allergies: string | null
  notes: string | null
  photoPath: string | null
  phones: MemberPhoneDto[]
  emails: MemberEmailDto[]
  addresses: MemberAddressDto[]
  createdAt: string
  updatedAt: string
  username: string | null // login of the linked user account (null if no account)
}

export interface MemberPhoneDto { id: string; countryCode: string; number: string; type: string; isPrimary: boolean; isEmergency: boolean }
export interface MemberEmailDto { id: string; address: string; type: string; isPrimary: boolean; isEmergency: boolean }
export interface MemberAddressDto { id: string; type: string; country: string; city: string; details: string | null; isPrimary: boolean }

export interface MemberFormData {
  firstName: string
  lastName: string
  dateOfBirth?: string | null
  gender?: string | null
  cardNumber?: string | null
  externalCardNumber?: string | null
  bloodType?: string | null
  nationality?: string | null
  school?: string | null
  classe?: string | null
  section?: string | null
  medicalNotes?: string | null
  allergies?: string | null
  notes?: string | null
}

// Paginated member list. alumni=true switches to former-members (identity only); default is active.
export function useMembers(params: { search?: string; unitId?: string; teamId?: string; noUnit?: boolean; alumni?: boolean; sortBy?: string; sortDir?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['members', params],
    queryFn: () => apiClient.get<PaginatedResult<MemberListDto>>('/members', { params }).then(r => r.data),
  })
}

// Single member detail (skipped until an id is provided).
export function useMember(id: string) {
  return useQuery({
    queryKey: ['members', id],
    queryFn: () => apiClient.get<MemberDetailDto>(`/members/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

// Create a member; server auto-provisions a user account and returns its temp login credentials.
export function useCreateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: MemberFormData) => apiClient.post<{ memberId: string; username: string; temporaryPassword: string }>('/members', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })
}

export function useUpdateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: MemberFormData & { id: string }) =>
      apiClient.put(`/members/${id}`, { id, ...data }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['members', variables.id] })
    },
  })
}

export function useDeleteMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/members/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })
}

// CG/leader resets a member's password → returns a fresh temp password (no cache to invalidate).
export function useResetMemberPassword() {
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ username: string; temporaryPassword: string }>(`/members/${id}/reset-password`).then(r => r.data),
  })
}

// Contact mutations — phones/emails/addresses are sub-resources; all invalidate the member detail.
export function useAddPhone(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { countryCode: string; number: string; type: string; isPrimary: boolean; isEmergency: boolean }) =>
      apiClient.post(`/members/${memberId}/phones`, { memberId, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', memberId] }),
  })
}

export function useDeletePhone(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (phoneId: string) => apiClient.delete(`/members/phones/${phoneId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', memberId] }),
  })
}

export function useAddEmail(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { address: string; type: string; isPrimary: boolean; isEmergency: boolean }) =>
      apiClient.post(`/members/${memberId}/emails`, { memberId, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', memberId] }),
  })
}

export function useDeleteEmail(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (emailId: string) => apiClient.delete(`/members/emails/${emailId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', memberId] }),
  })
}

export function useAddAddress(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { type: string; country: string; city: string; details?: string | null; isPrimary: boolean }) =>
      apiClient.post(`/members/${memberId}/addresses`, { memberId, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', memberId] }),
  })
}

export function useDeleteAddress(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (addressId: string) => apiClient.delete(`/members/addresses/${addressId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', memberId] }),
  })
}

export function useUpdatePhone(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { id: string; countryCode: string; number: string; type: string; isPrimary: boolean; isEmergency: boolean }) =>
      apiClient.put(`/members/phones/${data.id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', memberId] }),
  })
}

export function useUpdateEmail(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { id: string; address: string; type: string; isPrimary: boolean; isEmergency: boolean }) =>
      apiClient.put(`/members/emails/${data.id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', memberId] }),
  })
}

export function useUpdateAddress(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { id: string; type: string; country: string; city: string; details?: string | null; isPrimary: boolean }) =>
      apiClient.put(`/members/addresses/${data.id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', memberId] }),
  })
}

// Multipart photo upload; invalidates both detail and list (list shows the thumbnail).
export function useUploadPhoto(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiClient.post<{ photoPath: string }>(`/members/${memberId}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', memberId] })
      qc.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

// Authenticated photo endpoint URL (served with the JWT; MemberPhoto fetches it as a blob).
export function getMemberPhotoUrl(memberId: string): string {
  return `/api/v1/members/${memberId}/photo`
}
