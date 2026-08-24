// Fratries (sibling groups): auto-suggested families, approve-with-reconcile / reject, manual link/unlink, and a
// per-member "Frères et sœurs" read. Management endpoints require maitrise.manage (CG/super-admin) server-side;
// the per-member read is gated by member access so it can also power a member's own fiche. Keyed on ['siblings'].
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface SiblingCandidateMember {
  memberId: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  photoPath: string | null
  unitName: string | null
  siblingGroupId: string | null
}

export interface SiblingSuggestion {
  members: SiblingCandidateMember[]
  evidence: string[]
  confidence: string // "Élevée" | "Moyenne"
}

export interface SiblingGroup {
  groupId: string
  members: SiblingCandidateMember[]
}

export interface MemberSibling {
  memberId: string
  firstName: string
  lastName: string
  photoPath: string | null
  unitName: string | null
  dateOfBirth: string | null
}

export interface SiblingGuardian {
  guardianId: string
  firstName: string
  lastName: string
  role: string // pere | mere | autre
  phones: string[]
  emails: string[]
  linkedMemberIds: string[]
}

export interface SiblingAddress {
  addressId: string
  memberId: string
  country: string
  city: string
  details: string | null
  isPrimary: boolean
}

export interface SiblingReconcileMember {
  memberId: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  unitName: string | null
  siblingGroupId: string | null
}

export interface SiblingReconcileData {
  members: SiblingReconcileMember[]
  fathers: SiblingGuardian[]
  mothers: SiblingGuardian[]
  otherGuardians: SiblingGuardian[]
  addresses: SiblingAddress[]
}

// GET /siblings/suggestions → candidate families (matching engine), CG-only.
export function useSiblingSuggestions() {
  return useQuery({
    queryKey: ['siblings', 'suggestions'],
    queryFn: () => apiClient.get<SiblingSuggestion[]>('/siblings/suggestions').then((r) => r.data),
  })
}

// GET /siblings/groups → confirmed fratries, optional name search, CG-only.
export function useSiblingGroups(search: string) {
  return useQuery({
    queryKey: ['siblings', 'groups', search],
    queryFn: () => apiClient.get<SiblingGroup[]>('/siblings/groups', { params: { search: search || undefined } }).then((r) => r.data),
  })
}

// GET /siblings/member/{id} → a member's confirmed siblings (fiche). Gated by member access.
export function useMemberSiblings(memberId: string | undefined) {
  return useQuery({
    queryKey: ['siblings', 'member', memberId],
    queryFn: () => apiClient.get<MemberSibling[]>(`/siblings/member/${memberId}`).then((r) => r.data),
    enabled: !!memberId,
  })
}

// POST /siblings/reconcile-data → the family's parents (by role) + addresses for the reconcile dialog.
export function useReconcileData() {
  return useMutation({
    mutationFn: (memberIds: string[]) =>
      apiClient.post<SiblingReconcileData>('/siblings/reconcile-data', { memberIds }).then((r) => r.data),
  })
}

function useSiblingInvalidate() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['siblings'] })
    qc.invalidateQueries({ queryKey: ['members'] })
    qc.invalidateQueries({ queryKey: ['member'] })
  }
}

// POST /siblings/approve → create/merge the group + reconcile parents/address/contacts.
export function useApproveSiblingGroup() {
  const invalidate = useSiblingInvalidate()
  return useMutation({
    mutationFn: (data: { memberIds: string[]; fatherGuardianId: string | null; motherGuardianId: string | null; addressId: string | null }) =>
      apiClient.post<{ groupId: string }>('/siblings/approve', data).then((r) => r.data),
    onSuccess: invalidate,
  })
}

// POST /siblings/reject → tombstone the suggested pairs so they're not re-suggested.
export function useRejectSiblingSuggestion() {
  const invalidate = useSiblingInvalidate()
  return useMutation({
    mutationFn: (memberIds: string[]) => apiClient.post('/siblings/reject', { memberIds }).then((r) => r.data),
    onSuccess: invalidate,
  })
}

// POST /siblings/link → manually link two members as siblings.
export function useLinkSiblings() {
  const invalidate = useSiblingInvalidate()
  return useMutation({
    mutationFn: (data: { memberId: string; targetMemberId: string }) =>
      apiClient.post<{ groupId: string }>('/siblings/link', data).then((r) => r.data),
    onSuccess: invalidate,
  })
}

// POST /siblings/unlink → remove a member from its fratrie.
export function useUnlinkSibling() {
  const invalidate = useSiblingInvalidate()
  return useMutation({
    mutationFn: (memberId: string) => apiClient.post('/siblings/unlink', { memberIds: [memberId] }).then((r) => r.data),
    onSuccess: invalidate,
  })
}
