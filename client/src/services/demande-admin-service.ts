import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { ApplicantGuardian, ApplicantScoutRelation } from '@/services/applicant-service'

export interface Sibling { id: string; firstName: string; lastName: string; status: string; responseSent: boolean }

export interface DemandeReview {
  id: string
  scoutYear: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  age: number | null
  gender: string | null
  nationality: string | null
  school: string | null
  classe: string | null
  section: string | null
  bloodType: string | null
  medicalNotes: string | null
  allergies: string | null
  phoneNumber: string | null
  email: string | null
  parentNotes: string | null
  status: string
  decidedUnitId: string | null
  decidedUnitName: string | null
  decisionNotes: string | null
  submittedAt: string | null
  responseSentAt: string | null
  createdMemberId: string | null
  accountId: string
  accountEmail: string
  contactName: string | null
  addressCountry: string | null
  addressCity: string | null
  addressDetails: string | null
  guardians: ApplicantGuardian[]
  scoutRelations: ApplicantScoutRelation[]
  siblings: Sibling[]
}

export interface UnitOccupancy {
  unitId: string
  unitCode: string
  unitName: string
  associationName: string
  unitTypeId: string
  gender: string | null
  ageMin: number | null
  ageMax: number | null
  currentActive: number
  projected: number
  quota: number | null
  accepted: number
}

export interface DemandeFilters {
  status?: string
  gender?: string
  classe?: string
  school?: string
  ageMin?: number
  ageMax?: number
  unitId?: string
}

export interface CountItem { label: string; count: number }

export interface DemandeStatistics {
  scoutYear: string
  total: number
  pending: number
  approved: number
  declined: number
  responsesSent: number
  decided: number
  drafts: number
  byGender: CountItem[]
  byAgeGroup: CountItem[]
  byClasse: CountItem[]
  bySchool: CountItem[]
  siblingGroups: number
  siblingDemandes: number
  withScoutRelations: number
  incompleteDossiers: number
}

export function useDemandesForReview(scoutYear: string, filters: DemandeFilters) {
  return useQuery({
    queryKey: ['demandes', 'review', scoutYear, filters],
    queryFn: () => apiClient.get<DemandeReview[]>('/demandes', { params: { scoutYear, ...filters } }).then((r) => r.data),
    enabled: !!scoutYear,
  })
}

export function usePendingDemandeCount(enabled: boolean) {
  return useQuery({
    queryKey: ['demandes', 'pending-count'],
    queryFn: () => apiClient.get<{ count: number }>('/demandes/pending-count').then((r) => r.data.count),
    enabled,
    refetchInterval: 60000,
  })
}

export function useDemandeStatistics(scoutYear: string) {
  return useQuery({
    queryKey: ['demandes', 'statistics', scoutYear],
    queryFn: () => apiClient.get<DemandeStatistics>('/demandes/statistics', { params: { scoutYear } }).then((r) => r.data),
    enabled: !!scoutYear,
  })
}

export function useUnitOccupancy(scoutYear: string) {
  return useQuery({
    queryKey: ['demandes', 'occupancy', scoutYear],
    queryFn: () => apiClient.get<UnitOccupancy[]>('/demandes/occupancy', { params: { scoutYear } }).then((r) => r.data),
    enabled: !!scoutYear,
  })
}

export function useDecideDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { id: string; status: string; decidedUnitId?: string | null; decisionNotes?: string | null }) =>
      apiClient.put(`/demandes/${data.id}/decide`, { status: data.status, decidedUnitId: data.decidedUnitId, decisionNotes: data.decisionNotes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['demandes'] }) },
  })
}

export function useBulkDecideDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { status: string; decisionNotes?: string | null; items: { id: string; decidedUnitId?: string | null }[] }) =>
      apiClient.post<{ processed: number; skipped: number }>('/demandes/bulk-decide', data).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['demandes'] }) },
  })
}

export function useSetIntakeQuota() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { unitId: string; scoutYear: string; quota: number }) => apiClient.put('/demandes/quota', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demandes', 'occupancy'] }),
  })
}

export function useSendResponses() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scoutYear: string) => apiClient.post<{ approved: number; declined: number }>('/demandes/send-responses', { scoutYear }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['demandes'] }); qc.invalidateQueries({ queryKey: ['members'] }) },
  })
}
