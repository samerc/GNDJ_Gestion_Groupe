// Member self-service ("Ma fiche") — edits of the caller's OWN record that need NO members.edit permission
// and NO approval. Backed by /my-profile/* (auth-only; the server resolves the caller's own member id and
// only lets a member change permitted fields). Keep in sync with the approval-gated flows (progression /
// fonctions) which live elsewhere.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { openBlob } from '@/lib/download'

// The member-editable profile + medical fields (locked identity fields are intentionally absent).
export interface MyProfileUpdate {
  nationality?: string | null
  school?: string | null
  classe?: string | null
  section?: string | null
  bloodType?: string | null
  allergies?: string | null
  medicalNotes?: string | null
}

// PUT /my-profile/profile → update own editable profile + medical fields; refreshes Ma fiche.
export function useUpdateMyProfile(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: MyProfileUpdate) => apiClient.put('/my-profile/profile', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', memberId] })
      qc.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

// ── Coordonnées: own phones / emails / addresses (self-service, no approval) ──
// Call signatures mirror the leader-facing member-service hooks so "Ma fiche" can swap to them directly.
const invalidateMe = (qc: ReturnType<typeof useQueryClient>, memberId: string) =>
  qc.invalidateQueries({ queryKey: ['members', memberId] })

interface MyPhoneInput { countryCode: string; number: string; type: string; isPrimary: boolean; isEmergency: boolean }
interface MyEmailInput { address: string; type: string; isPrimary: boolean; isEmergency: boolean }
interface MyAddressInput { type: string; country: string; city: string; details?: string | null; isPrimary: boolean }

export function useAddMyPhone(memberId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (data: MyPhoneInput) => apiClient.post('/my-profile/phones', data), onSuccess: () => invalidateMe(qc, memberId) })
}
export function useUpdateMyPhone(memberId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, ...data }: MyPhoneInput & { id: string }) => apiClient.put(`/my-profile/phones/${id}`, { id, ...data }), onSuccess: () => invalidateMe(qc, memberId) })
}
export function useDeleteMyPhone(memberId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => apiClient.delete(`/my-profile/phones/${id}`), onSuccess: () => invalidateMe(qc, memberId) })
}

export function useAddMyEmail(memberId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (data: MyEmailInput) => apiClient.post('/my-profile/emails', data), onSuccess: () => invalidateMe(qc, memberId) })
}
export function useUpdateMyEmail(memberId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, ...data }: MyEmailInput & { id: string }) => apiClient.put(`/my-profile/emails/${id}`, { id, ...data }), onSuccess: () => invalidateMe(qc, memberId) })
}
export function useDeleteMyEmail(memberId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => apiClient.delete(`/my-profile/emails/${id}`), onSuccess: () => invalidateMe(qc, memberId) })
}

export function useAddMyAddress(memberId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (data: MyAddressInput) => apiClient.post('/my-profile/addresses', data), onSuccess: () => invalidateMe(qc, memberId) })
}
export function useUpdateMyAddress(memberId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, ...data }: MyAddressInput & { id: string }) => apiClient.put(`/my-profile/addresses/${id}`, { id, ...data }), onSuccess: () => invalidateMe(qc, memberId) })
}
export function useDeleteMyAddress(memberId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => apiClient.delete(`/my-profile/addresses/${id}`), onSuccess: () => invalidateMe(qc, memberId) })
}

// ── Trombinoscope (member views their unit's photo grid per year) ──
// `available` = a leader has SAVED (frozen) the trombinoscope for that unit+year. Only saved ones can be
// viewed (we never regenerate with today's photos), so a year with available=false is shown disabled.
export interface MyTrombinoscopeYear { scoutYear: string; unitId: string; unitName: string; available: boolean }

// GET /my-profile/trombinoscopes → the (year, unit) pairs the member can view.
export function useMyTrombinoscopes() {
  return useQuery({
    queryKey: ['my-trombinoscopes'],
    queryFn: () => apiClient.get<MyTrombinoscopeYear[]>('/my-profile/trombinoscopes').then(r => r.data),
  })
}

// GET /my-profile/trombinoscope?unitId&scoutYear → open the generated PDF in a new tab.
export async function viewMyTrombinoscope(unitId: string, scoutYear: string) {
  const res = await apiClient.get('/my-profile/trombinoscope', { params: { unitId, scoutYear }, responseType: 'blob' })
  openBlob(res.data, 'application/pdf')
}
