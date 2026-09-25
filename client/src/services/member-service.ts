// Members resource: list/detail CRUD, contact sub-resources (phones/emails/addresses), photo upload,
// and password reset. All calls are unit-scoped server-side; queries key on ['members', ...].
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
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
  parentsSituation: string | null // parents' relationship status (Unis / Séparés / Divorcés)
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
  lastLoginAt: string | null // last sign-in of the linked account (null = never logged in / no account)
  contactReviewedAt: string | null // when the member confirmed their coordonnées via the popup (null = not yet)
  loginActive: boolean | null // login state: null = no account; true = active; false = disabled
  appInstalledAt: string | null // first detected running the installed PWA (null = installation non détectée)
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
  parentsSituation?: string | null // Unis / Séparés / Divorcés
  // Optional parents captured on manual creation → create Père/Mère guardians (ignored on update).
  fatherName?: string | null
  motherName?: string | null
  motherMaidenName?: string | null
  // Optional unit placement on manual creation → an active assignment (no team, default function). Ignored on update.
  unitId?: string | null
}

// Paginated member list. alumni=true switches to former-members (identity only); default is active.
// maitrise=true restricts to leadership (maîtrise) role holders across the caller's units.
export function useMembers(params: { search?: string; unitId?: string; teamId?: string; noUnit?: boolean; alumni?: boolean; all?: boolean; maitrise?: boolean; sortBy?: string; sortDir?: string; page?: number; pageSize?: number; letter?: string; appInstalled?: boolean }) {
  return useQuery({
    queryKey: ['members', params],
    queryFn: () => apiClient.get<PaginatedResult<MemberListDto>>('/members', { params }).then(r => r.data),
    // Busiest list in the app: keep the previous page visible while the next page/letter/filter loads (no
    // spinner flash on pagination) and hold results briefly so returning to /members doesn't re-hit the network.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

// Global parent search (Ctrl-K palette): find a parent by name / email / phone → see their children, so a
// leader can identify whose child a mother is before replying. Leaders only + scoped server-side. One row per
// (parent, child).
export interface ParentSearchResult {
  guardianId: string
  guardianName: string
  relationship: string
  memberId: string
  memberName: string
  unitName: string | null
}
export function useSearchParents(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ['parents', 'search', query],
    queryFn: () => apiClient.get<ParentSearchResult[]>('/guardians/search-parents', { params: { q: query } }).then(r => r.data),
    enabled: enabled && query.length >= 2,
  })
}

// Upcoming member birthdays (leaders only, unit-scoped server-side). Powers the dashboard widget.
export interface UpcomingBirthday {
  memberId: string
  firstName: string
  lastName: string
  unitName: string | null
  unitCode: string | null
  dateOfBirth: string
  nextBirthday: string
  turningAge: number
  daysUntil: number
}
export function useUpcomingBirthdays(days = 30, enabled = true) {
  return useQuery({
    queryKey: ['members', 'birthdays', days],
    queryFn: () => apiClient.get<UpcomingBirthday[]>('/members/birthdays', { params: { days } }).then(r => r.data),
    enabled,
    staleTime: 60 * 60 * 1000, // birthdays change slowly — refresh hourly
  })
}

// ── Bulk import (Excel/CSV) ──
export interface MemberImportRow {
  row: number; firstName: string; lastName: string; dateOfBirth: string | null
  gender: string | null; unitName: string | null; valid: boolean; errors: string[]
}
export interface MemberImportPreview { rows: MemberImportRow[]; validCount: number; errorCount: number; fileErrors: string[] }
export interface MemberImportResult { created: number; failed: number; errors: string[] }

// Dry-run: validate the uploaded file, return per-row results (no writes).
export function usePreviewMemberImport() {
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData(); fd.append('file', file)
      return apiClient.post<MemberImportPreview>('/members/import/preview', fd).then(r => r.data)
    },
  })
}
// Create the valid rows.
export function useCommitMemberImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData(); fd.append('file', file)
      return apiClient.post<MemberImportResult>('/members/import/commit', fd).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })
}

// Units that have members in the current view (active by default, or former members when alumni=true), for the
// members-page filter dropdown — so empty units are hidden. Re-fetched when the Actifs/Anciens toggle flips.
export interface MemberUnitOption { id: string; name: string; code: string; count: number }
export function useMemberUnitOptions(alumni: boolean, all = false) {
  return useQuery({
    queryKey: ['members', 'unit-options', alumni, all],
    queryFn: () => apiClient.get<MemberUnitOption[]>('/members/unit-options', { params: { alumni, all } }).then(r => r.data),
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

// ── "Envoyer l'accès" (member file → Actions) — username + set-password link to one member ──
export interface SendAccessResult {
  sent: number
  noEmail: number
  noAccount: number
  noAccess: number
  details: { memberId: string; memberName: string; status: string; email: string | null }[]
}

export function useSendAccess() {
  return useMutation({
    mutationFn: (body: { memberIds: string[] }) =>
      apiClient.post<SendAccessResult>('/members/send-access', body).then(r => r.data),
  })
}

// ── "Comptes manquants" — create logins for members who have none ──
export interface MissingLogin {
  memberId: string
  memberName: string
  unitName: string | null
  unitCode: string | null
  hasEmail: boolean
  contactEmail: string | null
}

// Single-create result: temporaryPassword is set only for a member with NO email (relay by hand); otherwise an
// activation link was emailed to sentToEmail.
export interface CreateLoginResult {
  username: string
  temporaryPassword: string | null
  sentToEmail: string | null
}

export interface MissingLoginCred {
  memberId: string
  memberName: string
  username: string
  temporaryPassword: string
}

// Bulk-create result: emailSent got an activation link; noEmailCreds are the accounts to relay by hand.
export interface CreateMissingLoginsResult {
  created: number
  emailSent: number
  alreadyHad: number
  noAccess: number
  noEmailCreds: MissingLoginCred[]
}

// Active members WITHOUT a login. unitId → that unit; omit unitId → all active missing group-wide (group-manager only).
export function useMissingLogins(unitId?: string, enabled = true) {
  return useQuery({
    queryKey: ['members', 'missing-logins', unitId ?? 'all'],
    queryFn: () => apiClient.get<MissingLogin[]>('/members/missing-logins', { params: { unitId } }).then(r => r.data),
    enabled,
  })
}

// Create a login for one member (email → activation link; no email → temp password returned to show on screen).
export function useCreateMemberLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (memberId: string) => apiClient.post<CreateLoginResult>(`/members/${memberId}/create-login`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', 'missing-logins'] })
    },
  })
}

// Bulk-create logins for a scope (unit / all active / an explicit member list).
export function useCreateMissingLogins() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { unitId?: string; memberIds?: string[]; allActive?: boolean }) =>
      apiClient.post<CreateMissingLoginsResult>('/members/create-logins', body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', 'missing-logins'] })
    },
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

// Enable/disable a member's login (without deleting the member). Refreshes the member detail so the panel
// header + Actions menu reflect the new state.
export function useSetMemberLoginActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiClient.put(`/members/${id}/login-active`, { active }).then(r => r.data),
    onSuccess: (_d, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['members', id] })
      queryClient.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

// Capture/confirm a leaving member's personal email + phone (passage "Quitte le groupe"), so the group can
// re-contact them next year. Adds them to the member's own contacts if missing + sets the primary contact email.
export function useSaveLeaverContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, email, phoneCountryCode, phone }: { id: string; email?: string | null; phoneCountryCode?: string | null; phone?: string | null }) =>
      apiClient.put(`/members/${id}/leaver-contact`, { email, phoneCountryCode, phone }).then(r => r.data),
    onSuccess: (_d, { id }) => queryClient.invalidateQueries({ queryKey: ['members', id] }),
  })
}

// ── Access delegation ("accès délégué") ──
// Grant a specific member extra access with no visible role: attach a PROFILE (e.g. "Chef de Groupe" → acts as
// CG, resolved live) and/or a granular per-area grant (e.g. Camp BP). CG (roles.manage_group) / super-admin only.
// Takes effect on the member's next login/refresh.
export interface DelegationArea { key: string; label: string; level: string } // level: aucun | lecture | complet
export interface MemberDelegation { hasDelegation: boolean; profileId: string | null; profileName: string | null; isLeader: boolean; areas: DelegationArea[] }
// Overview row for the Membres tab: one member holding a delegation. profileName = the attached profile (null if
// none); areas = "Label (niveau)" strings. unitCode = their current unit (null if none).
export interface MemberDelegationSummary { memberId: string; name: string; unitCode: string | null; profileName: string | null; areas: string[] }

// GET the member's current delegation (attached profile + per-area levels), for the dialog.
export function useMemberDelegation(memberId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['members', memberId, 'delegation'],
    queryFn: () => apiClient.get<MemberDelegation>(`/members/${memberId}/delegation`).then(r => r.data),
    enabled,
  })
}

// GET all members who currently hold a delegation (tracking overview on the Membres tab).
export function useMemberDelegations() {
  return useQuery({
    queryKey: ['members', 'delegations'],
    queryFn: () => apiClient.get<MemberDelegationSummary[]>('/members/delegations').then(r => r.data),
  })
}

// PUT the delegation: profileId = attach a profile (or null), areaLevels = granular per-area. Empty both = clear.
export function useSetMemberDelegation(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { profileId?: string | null; areaLevels?: Record<string, string> }) =>
      apiClient.put(`/members/${memberId}/delegation`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', memberId] })
      qc.invalidateQueries({ queryKey: ['members', memberId, 'delegation'] })
      qc.invalidateQueries({ queryKey: ['members', 'delegations'] }) // refresh the Accès maîtrise overview
    },
  })
}

// ── Effective access ("Voir les accès") — the resolved permissions with provenance (which fonction /
// delegation / super-admin grants each), grouped by domain. Read-only; mirrors the login token resolution. ──
export interface AccessSource { kind: string; label: string; detail: string | null; isGroupLevel: boolean }
export interface AccessPerm { key: string; label: string; sources: number[] } // sources = indexes into `sources` below
export interface AccessDomain { key: string; label: string; level: string; permissions: AccessPerm[] } // level: voir | gerer | complet
export interface MemberEffectiveAccess {
  isSuperAdmin: boolean
  allUnits: boolean
  unitLabels: string[]
  sources: AccessSource[]
  domains: AccessDomain[]
  maitriseManageBypass: boolean // holds maitrise.manage → master access to every member file (until decoupled)
}
export function useMemberEffectiveAccess(memberId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['members', memberId, 'effective-access'],
    queryFn: () => apiClient.get<MemberEffectiveAccess>(`/members/${memberId}/effective-access`).then(r => r.data),
    enabled: enabled && !!memberId,
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

// Change the member's login username (the identifier they sign in with). Invalidates the member list + detail
// so the header reflects the new identifier.
export function useUpdateMemberUsername(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (username: string) => apiClient.put(`/members/${memberId}/username`, { username }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', memberId] })
      qc.invalidateQueries({ queryKey: ['members'] })
    },
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
