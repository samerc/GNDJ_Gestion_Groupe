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
