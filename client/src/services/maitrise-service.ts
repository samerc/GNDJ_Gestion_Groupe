import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

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

export function useMaitrises() {
  return useQuery({
    queryKey: ['maitrises'],
    queryFn: () => apiClient.get<MaitriseUnitDto[]>('/maitrises').then(r => r.data),
  })
}

export function useRemoveFromMaitrise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assignmentId: string) => apiClient.post('/maitrises/remove', { assignmentId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maitrises'] }),
  })
}

export function useTransferMaitrise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { assignmentId: string; newUnitId: string; newFunctionalRoleId: string; keepOld: boolean }) =>
      apiClient.post('/maitrises/transfer', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maitrises'] }),
  })
}
