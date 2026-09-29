import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// Maîtrises resource: leadership rosters grouped by unit (CG-only). Queries key on ['maitrises'].

export interface MaitriseMemberDto {
  assignmentId: string
  memberId: string
  firstName: string
  lastName: string
  photoPath: string | null
  functionalRoleId: string
  functionName: string
  rank: number
}

export interface MaitriseUnitDto {
  unitId: string
  unitCode: string
  unitName: string
  unitTypeName: string | null
  unitTypeColor: string | null
  isGroupUnit: boolean
  members: MaitriseMemberDto[]
}

// GET /maitrises → leaders grouped by unit, members ordered by rank (group unit first).
export function useMaitrises() {
  return useQuery({
    queryKey: ['maitrises'],
    queryFn: () => apiClient.get<MaitriseUnitDto[]>('/maitrises').then(r => r.data),
  })
}

// POST /maitrises/remove → ends the leadership assignment; invalidates the list.
export function useRemoveFromMaitrise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assignmentId: string) => apiClient.post('/maitrises/remove', { assignmentId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maitrises'] }),
  })
}

// POST /maitrises/transfer → move a leader to another unit/function (keepOld keeps the original assignment open); invalidates the list.
export function useTransferMaitrise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { assignmentId: string; newUnitId: string; newFunctionalRoleId: string; keepOld: boolean }) =>
      apiClient.post('/maitrises/transfer', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maitrises'] }),
  })
}

// ── Next year's maîtrise plan (applied with "Publier le passage", on the passage date) ──
export interface MaitrisePlanMember {
  assignmentId: string
  memberId: string
  firstName: string
  lastName: string
  functionalRoleId: string
  functionName: string
  rank: number
  isHead: boolean
}

export interface MaitrisePlanUnit {
  unitId: string
  unitCode: string
  unitName: string
  unitTypeId: string
  unitTypeName: string | null
  unitTypeColor: string | null
  isGroupUnit: boolean
  current: MaitrisePlanMember[]
}

export interface MaitrisePlanLine {
  id: string
  kind: 'Start' | 'End'
  memberId: string
  firstName: string
  lastName: string
  unitId: string
  functionalRoleId: string
  functionName: string
  rank: number
  isHead: boolean
  assignmentId: string | null
  notes: string | null
  joinsFromYouth: boolean
  youthUnitCode: string | null
  applied: boolean
  causedByLineId: string | null // stop planned because someone else becomes chef d'unité (cancelled with that line)
}

export interface MaitrisePlan {
  scoutYear: string
  passageDate: string | null
  published: boolean
  units: MaitrisePlanUnit[]
  lines: MaitrisePlanLine[]
}

// GET /maitrises/plan → current leaders of every active unit + the year's planned changes.
export function useMaitrisePlan(enabled = true) {
  return useQuery({
    queryKey: ['maitrises', 'plan'],
    queryFn: () => apiClient.get<MaitrisePlan>('/maitrises/plan').then(r => r.data),
    enabled,
  })
}

// Every maîtrise mutation refreshes the plan, the plain list and the passage lines (a youth joining the
// maîtrise changes their passage line).
function usePlanMutation<T>(fn: (data: T) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maitrises'] })
      qc.invalidateQueries({ queryKey: ['passages'] })
      qc.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

export const usePlanMaitriseStart = () => usePlanMutation((d: { memberId: string; unitId: string; functionalRoleId: string; notes?: string }) =>
  apiClient.post('/maitrises/plan/start', d))
export const usePlanMaitriseEnd = () => usePlanMutation((d: { assignmentId: string; notes?: string }) =>
  apiClient.post('/maitrises/plan/end', d))
export const usePlanMaitriseChange = () => usePlanMutation((d: { assignmentId: string; newUnitId: string; newFunctionalRoleId: string; keepOld: boolean; notes?: string }) =>
  apiClient.post('/maitrises/plan/change', d))
export const useCancelMaitrisePlan = () => usePlanMutation((id: string) => apiClient.delete(`/maitrises/plan/${id}`))
export const useAddMaitriseNow = () => usePlanMutation((d: { memberId: string; unitId: string; functionalRoleId: string }) =>
  apiClient.post('/maitrises/add-now', d))
