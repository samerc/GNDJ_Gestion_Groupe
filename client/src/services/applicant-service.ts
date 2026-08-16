// Applicant-portal resource (public enrollment realm). Uses applicantApi (applicant JWT, separate from the
// member/user auth) — NOT the authenticated apiClient. Keyed on ['applicant', ...]. Covers config, the applicant's
// own household + demandes (draft → submit), and email verification.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import applicantApi from '@/lib/applicant-api-client'

export interface ApplicantConfig {
  isOpen: boolean            // demande.enabled — portal accessible at all (login + view)
  submissionsOpen: boolean   // demande.submissions_open — inner window: can create/edit/submit (else view-only review phase)
  scoutYear: string
  maxPerAccount: number
  notesMaxLength: number
  requireEmailVerification: boolean
  introText: string | null
  schools: string[]
  classes: string[]
  cities: string[]
  units: string[]
  maxScoutRelations: number
  professionDomains: string[]
  terms: string | null  // terms & conditions the applicant must accept before submitting (empty = none)
  excludedClasse: string | null  // a grade that cannot enroll (default 6ème): hidden from the classe dropdown + rejected at submit (empty = none)
  submissionStart: string | null   // yyyy-MM-dd: portal opens on this date (empty = manual)
  submissionDeadline: string | null // yyyy-MM-dd: submissions close after this date (empty = manual)
  resultTextAccepted: string | null // editable result-page wording (accepted)
  resultTextDeclined: string | null // editable result-page wording (declined)
  activationLinkDays: number        // how long an accepted member's set-password link stays valid
}

export interface ApplicantGuardian {
  id?: string | null
  relationship: string
  firstName: string
  lastName: string
  profession?: string | null
  professionDomain?: string | null
  phoneCountryCode?: string | null
  phoneNumber?: string | null
  email?: string | null
  isDeceased: boolean
  isPrimaryContact: boolean
  isEmergencyContact: boolean
}

export interface ApplicantScoutRelation {
  id?: string | null
  status: string // CurrentInGroup | AncienInGroup | OtherGroup
  relationship?: string | null
  relatedMemberId?: string | null
  firstName?: string | null
  lastName?: string | null
  lastUnit?: string | null
  lastFunction?: string | null
  otherGroupName?: string | null
  // CG review only: the real member the relation was auto-matched to (so the CG can confirm). Null elsewhere.
  relatedMemberName?: string | null
  relatedMemberUnit?: string | null
}

export interface Demande {
  id: string
  scoutYear: string
  firstName: string
  lastName: string
  dateOfBirth?: string | null
  gender?: string | null
  nationality?: string | null
  school?: string | null
  classe?: string | null
  section?: string | null
  bloodType?: string | null
  medicalNotes?: string | null
  allergies?: string | null
  phoneCountryCode?: string | null
  phoneNumber?: string | null
  email?: string | null
  parentNotes?: string | null
  hasPreviousDemande?: boolean
  previousDemandeYear?: string | null
  status: string
  decisionNotes?: string | null
  submittedAt?: string | null
  responseSentAt?: string | null
  // Result-page fields — only populated once the response is sent (never a staged decision):
  converted?: boolean          // accepted → a member account was created
  decidedUnitName?: string | null
  memberUsername?: string | null   // the created member's login username
  memberHasLoggedIn?: boolean       // they've already entered the member area → stop showing onboarding
}

export interface ApplicantProfile {
  accountId: string
  email: string
  emailVerified: boolean
  contactName?: string | null
  addressCountry?: string | null
  addressCity?: string | null
  addressDetails?: string | null
  primaryContactEmail?: string | null // household primary contact (one per family), chosen in the wizard
  guardians: ApplicantGuardian[]
  scoutRelations: ApplicantScoutRelation[]
  demandes: Demande[]
  termsAccepted: boolean // accepted on a separate post-login screen; the portal is gated until true
}

export type DemandeInput = Omit<Demande, 'id' | 'scoutYear' | 'status' | 'decisionNotes' | 'submittedAt' | 'responseSentAt'>

// GET /applicant/config → portal config (open flag, scout year, caps, school/class/city/unit/domain lists).
export function useApplicantConfig() {
  return useQuery({
    queryKey: ['applicant', 'config'],
    queryFn: () => applicantApi.get<ApplicantConfig>('/applicant/config').then((r) => r.data),
  })
}

// GET /applicant/profile → the logged-in applicant's account, household (guardians + scout relations) and demandes.
export function useApplicantProfile(enabled = true) {
  return useQuery({
    queryKey: ['applicant', 'profile'],
    queryFn: () => applicantApi.get<ApplicantProfile>('/applicant/profile').then((r) => r.data),
    enabled,
  })
}

// PUT /applicant/household → save shared household (address, guardians, scout relations); invalidates profile.
export function useSaveHousehold() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      contactName?: string | null
      addressCountry?: string | null
      addressCity?: string | null
      addressDetails?: string | null
      primaryContactEmail?: string | null
      guardians: ApplicantGuardian[]
      scoutRelations: ApplicantScoutRelation[]
    }) => applicantApi.put('/applicant/household', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applicant', 'profile'] }),
  })
}

// POST /applicant/demandes → create a child demande (draft); enforces max-per-account server-side. Invalidates profile.
export function useCreateDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: DemandeInput) => applicantApi.post<{ id: string }>('/applicant/demandes', { data }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applicant', 'profile'] }),
  })
}

// PUT /applicant/demandes/{id} → update a draft demande; invalidates profile.
export function useUpdateDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DemandeInput }) => applicantApi.put(`/applicant/demandes/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applicant', 'profile'] }),
  })
}

// POST /applicant/demandes/{id}/submit → submit a draft for CG review (may require verified email); invalidates profile.
export function useSubmitDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => applicantApi.post(`/applicant/demandes/${id}/submit`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applicant', 'profile'] }),
  })
}

// DELETE /applicant/demandes/{id} → remove a draft demande; invalidates profile.
export function useDeleteDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => applicantApi.delete(`/applicant/demandes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applicant', 'profile'] }),
  })
}

// ── "Retrouver mes informations" — prefill the household from an existing member, gated by an email code ──
export interface HouseholdLookupMember { id: string; name: string; unit: string | null; gender: string | null }
export interface HouseholdLookup {
  guardians: ApplicantGuardian[]
  addressCountry: string | null
  addressCity: string | null
  addressDetails: string | null
  members: HouseholdLookupMember[]
}

// POST /applicant/household-lookup/request → emails a one-time code (generic success, no enumeration).
export function useRequestHouseholdLookup() {
  return useMutation({ mutationFn: (email: string) => applicantApi.post('/applicant/household-lookup/request', { email }) })
}

// POST /applicant/household-lookup/verify → returns the family's household to prefill the wizard.
export function useVerifyHouseholdLookup() {
  return useMutation({
    mutationFn: (body: { email: string; code: string }) =>
      applicantApi.post<HouseholdLookup>('/applicant/household-lookup/verify', body).then((r) => r.data),
  })
}

// POST /applicant/accept-terms → record acceptance of the T&C; invalidates profile so the gate re-evaluates.
export function useAcceptTerms() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => applicantApi.post('/applicant/accept-terms'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applicant', 'profile'] }),
  })
}

// POST /applicant/forgot-password → email a reset link if the address has an account (generic success, no enumeration).
export function useApplicantForgotPassword() {
  return useMutation({
    mutationFn: (data: { email: string; website?: string }) => applicantApi.post('/applicant/forgot-password', data),
  })
}

// POST /applicant/reset-password → set a new password with the emailed token.
export function useApplicantResetPassword() {
  return useMutation({
    mutationFn: (data: { email: string; token: string; newPassword: string; website?: string }) =>
      applicantApi.post('/applicant/reset-password', data),
  })
}

// POST /applicant/verify-email → confirm the account via emailed token.
export function useVerifyEmail() {
  return useMutation({
    mutationFn: (token: string) => applicantApi.post('/applicant/verify-email', { token }),
  })
}

// POST /applicant/resend-verification → re-send the verification email to the logged-in applicant.
export function useResendVerification() {
  return useMutation({
    mutationFn: () => applicantApi.post('/applicant/resend-verification'),
  })
}

// POST /applicant/demandes/{id}/resend-activation → re-send the member account set-password (activation)
// email for an accepted demande (e.g. the acceptance email was lost or its link expired).
export function useResendMemberActivation() {
  return useMutation({
    mutationFn: (demandeId: string) => applicantApi.post(`/applicant/demandes/${demandeId}/resend-activation`),
  })
}
