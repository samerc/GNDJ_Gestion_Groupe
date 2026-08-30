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
  docsComplete?: boolean | null // dossier compliance (active members only; null in the alumni view)
  cotisationOk?: boolean | null // current-year cotisation paid/exempt; null when not tracked
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
  professionDomain: string | null
  profession: string | null
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
  primaryContactEmail: string | null // designated recipient for member-facing mail (null = auto)
  guardianEmails: string[] // distinct guardian emails, available as contact-email options
  counts: MemberTabCounts // per-tab badge counts (folded in so the panel needs no extra count queries)
  absencesThisYear: number // count of absences on approved réunions this scout year (Réunions feature)
  hasDelegatedAccess: boolean // an access delegation ("accès délégué") is active on this member
  delegatedGroupAccess: boolean // the delegation is the full "Chef de Groupe entrant" hand-off
  showProfession: boolean // offer the "En activité / Profession" option (false = youth in Meute/Ronde/Compagnie/Troupe → Classe/Section only)
  isSuperAdmin: boolean // the linked account is a super-admin — populated only for a super-admin viewer (else false)
}

// Tab badge counts returned with the member detail (famille / unités / documents / cotisations / progression).
export interface MemberTabCounts {
  famille: number
  unites: number
  documents: number
  cotisations: number
  progression: number
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
  professionDomain?: string | null
  profession?: string | null
  section?: string | null
  medicalNotes?: string | null
  allergies?: string | null
  notes?: string | null
  // Optional parents captured on manual creation → create Père/Mère guardians (ignored on update).
  fatherName?: string | null
  motherName?: string | null
  motherMaidenName?: string | null
  // Optional unit placement on manual creation → an active assignment (no team, default function). Ignored on update.
  unitId?: string | null
}

// Paginated member list. alumni=true switches to former-members (identity only); default is active.
// maitrise=true restricts to leadership (maîtrise) role holders across the caller's units.
export function useMembers(params: { search?: string; unitId?: string; teamId?: string; noUnit?: boolean; alumni?: boolean; maitrise?: boolean; sortBy?: string; sortDir?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['members', params],
    queryFn: () => apiClient.get<PaginatedResult<MemberListDto>>('/members', { params }).then(r => r.data),
  })
}

// Units that have members in the current view (active by default, or former members when alumni=true), for the
// members-page filter dropdown — so empty units are hidden. Re-fetched when the Actifs/Anciens toggle flips.
export interface MemberUnitOption { id: string; name: string; code: string; count: number }
export function useMemberUnitOptions(alumni: boolean) {
  return useQuery({
    queryKey: ['members', 'unit-options', alumni],
    queryFn: () => apiClient.get<MemberUnitOption[]>('/members/unit-options', { params: { alumni } }).then(r => r.data),
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
    // Creating a member (optionally placed in a unit) shifts the dashboard counts too.
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }) },
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }) },
  })
}

// ── Corbeille (trash): soft-deleted members, restorable until they are permanently purged ──
export interface DeletedMember {
  id: string
  firstName: string
  lastName: string
  cardNumber: string | null
  deletedAt: string
  purgeAt: string   // when the background job will permanently delete this member
}

export function useDeletedMembers() {
  return useQuery({
    queryKey: ['members', 'deleted'],
    queryFn: () => apiClient.get<DeletedMember[]>('/members/deleted').then(r => r.data),
  })
}

// Restore (undo the deletion + re-enable the login). Invalidates both the active lists and the trash.
export function useRestoreMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/members/${id}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })
}

// Permanently purge now (skips the wait). Irreversible.
export function usePurgeMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/members/${id}/purge`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })
}

// ── "Envoyer les accès" — launch activation-email rollout (username + set-password link) ──
export interface AccessCandidate {
  memberId: string
  memberName: string
  username: string | null
  hasAccount: boolean
  hasEmail: boolean
  contactEmail: string | null
  lastLoginAt: string | null
}

export interface SendAccessResult {
  sent: number
  noEmail: number
  noAccount: number
  noAccess: number
  skipped: number
  details: { memberId: string; memberName: string; status: string; email: string | null }[]
}

// The active members of a unit + their login/email/last-login status, so the CG can pick who to send to.
export function useAccessCandidates(unitId: string | undefined) {
  return useQuery({
    queryKey: ['members', 'access-candidates', unitId],
    queryFn: () => apiClient.get<AccessCandidate[]>('/members/access-candidates', { params: { unitId } }).then(r => r.data),
    enabled: !!unitId,
  })
}

// Send activation emails to a whole unit or to an explicit member list (single-member resend).
export function useSendAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { unitId?: string; memberIds?: string[]; onlyNeverLoggedIn?: boolean }) =>
      apiClient.post<SendAccessResult>('/members/send-access', body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', 'access-candidates'] }),
  })
}

// CG/leader resets a member's password → returns a fresh temp password + the address it was emailed to
// (sentToEmail is null when the member has no email on file — creds are then shown on screen only).
export function useResetMemberPassword() {
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ username: string; temporaryPassword: string; sentToEmail: string | null }>(`/members/${id}/reset-password`).then(r => r.data),
  })
}

// ── Access delegation ("accès délégué") ──
// Grant a specific member extra access (the full Chef de Groupe toolset, or granular areas like Camp BP) with
// no visible role. CG (roles.manage_group) / super-admin only. Takes effect on the member's next login/refresh.
export interface DelegationArea { key: string; label: string; level: string } // level: aucun | lecture | complet
export interface MemberDelegation { hasDelegation: boolean; fullCg: boolean; areas: DelegationArea[] }
// Overview row for the Accès maîtrise page: one member holding a delegation. areas = "Label (niveau)" strings
// (empty for a full-CG grant — fullCg conveys it). unitCode = their current unit (null if none).
export interface MemberDelegationSummary { memberId: string; name: string; unitCode: string | null; fullCg: boolean; areas: string[] }

// GET the member's current delegation (per-area levels + full-CG flag), for the dialog.
export function useMemberDelegation(memberId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['members', memberId, 'delegation'],
    queryFn: () => apiClient.get<MemberDelegation>(`/members/${memberId}/delegation`).then(r => r.data),
    enabled,
  })
}

// GET all members who currently hold a delegation (tracking overview on the Accès maîtrise page).
export function useMemberDelegations() {
  return useQuery({
    queryKey: ['members', 'delegations'],
    queryFn: () => apiClient.get<MemberDelegationSummary[]>('/members/delegations').then(r => r.data),
  })
}

// PUT the delegation: fullCg = full Chef de Groupe hand-off, else areaLevels = granular per-area (empty clears).
export function useSetMemberDelegation(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { fullCg: boolean; areaLevels?: Record<string, string> }) =>
      apiClient.put(`/members/${memberId}/delegation`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', memberId] })
      qc.invalidateQueries({ queryKey: ['members', memberId, 'delegation'] })
      qc.invalidateQueries({ queryKey: ['members', 'delegations'] }) // refresh the Accès maîtrise overview
    },
  })
}

// Set (or clear with null) the member's primary contact email — the recipient for member-facing mail.
export function useSetPrimaryContactEmail(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (email: string | null) => apiClient.put(`/members/${memberId}/primary-email`, { email }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', memberId] }),
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

// Removes the member's photo; invalidates detail + list (both show the avatar/thumbnail).
export function useDeletePhoto(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.delete(`/members/${memberId}/photo`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', memberId] })
      qc.invalidateQueries({ queryKey: ['members'] })
    },
  })
}
