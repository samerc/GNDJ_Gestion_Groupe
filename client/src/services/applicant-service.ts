import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import applicantApi from '@/lib/applicant-api-client'

export interface ApplicantConfig {
  isOpen: boolean
  scoutYear: string
  maxPerAccount: number
  notesMaxLength: number
  requireEmailVerification: boolean
  introText: string | null
  schools: string[]
}

export interface ApplicantGuardian {
  id?: string | null
  relationship: string
  firstName: string
  lastName: string
  profession?: string | null
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
  status: string
  decisionNotes?: string | null
  submittedAt?: string | null
  responseSentAt?: string | null
}

export interface ApplicantProfile {
  accountId: string
  email: string
  emailVerified: boolean
  contactName?: string | null
  addressCountry?: string | null
  addressCity?: string | null
  addressDetails?: string | null
  guardians: ApplicantGuardian[]
  scoutRelations: ApplicantScoutRelation[]
  demandes: Demande[]
}

export type DemandeInput = Omit<Demande, 'id' | 'scoutYear' | 'status' | 'decisionNotes' | 'submittedAt' | 'responseSentAt'>

export function useApplicantConfig() {
  return useQuery({
    queryKey: ['applicant', 'config'],
    queryFn: () => applicantApi.get<ApplicantConfig>('/applicant/config').then((r) => r.data),
  })
}

export function useApplicantProfile(enabled = true) {
  return useQuery({
    queryKey: ['applicant', 'profile'],
    queryFn: () => applicantApi.get<ApplicantProfile>('/applicant/profile').then((r) => r.data),
    enabled,
  })
}

export function useSaveHousehold() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      contactName?: string | null
      addressCountry?: string | null
      addressCity?: string | null
      addressDetails?: string | null
      guardians: ApplicantGuardian[]
      scoutRelations: ApplicantScoutRelation[]
    }) => applicantApi.put('/applicant/household', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applicant', 'profile'] }),
  })
}

export function useCreateDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: DemandeInput) => applicantApi.post<{ id: string }>('/applicant/demandes', { data }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applicant', 'profile'] }),
  })
}

export function useUpdateDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DemandeInput }) => applicantApi.put(`/applicant/demandes/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applicant', 'profile'] }),
  })
}

export function useSubmitDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => applicantApi.post(`/applicant/demandes/${id}/submit`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applicant', 'profile'] }),
  })
}

export function useDeleteDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => applicantApi.delete(`/applicant/demandes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applicant', 'profile'] }),
  })
}

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (token: string) => applicantApi.post('/applicant/verify-email', { token }),
  })
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () => applicantApi.post('/applicant/resend-verification'),
  })
}
