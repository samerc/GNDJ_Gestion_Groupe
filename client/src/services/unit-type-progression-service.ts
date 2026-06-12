import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface UnitTypeProgressionDto {
  id: string
  associationId: string
  fromUnitTypeId: string
  fromUnitTypeName: string
  toUnitTypeId: string
  toUnitTypeName: string
  gender: string | null
  pathType: string
  displayOrder: number
  notes: string | null
  fromAgeMin: number | null
  fromAgeMax: number | null
  toAgeMin: number | null
  toAgeMax: number | null
}

export interface PassageSuggestionDto {
  suggestedUnitTypeId: string | null
  suggestedUnitTypeName: string | null
  reason: string | null
}

export function useUnitTypeProgressions(associationId: string) {
  return useQuery({
    queryKey: ['unit-type-progressions', associationId],
    queryFn: () => apiClient.get<UnitTypeProgressionDto[]>('/unit-type-progressions', { params: { associationId } }).then(r => r.data),
    enabled: !!associationId,
  })
}

export function usePassageSuggestion(memberId: string) {
  return useQuery({
    queryKey: ['passage-suggestion', memberId],
    queryFn: () => apiClient.get<PassageSuggestionDto>(`/unit-type-progressions/suggest/${memberId}`).then(r => r.data),
    enabled: !!memberId,
  })
}

export function useCreateUnitTypeProgression() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { associationId: string; fromUnitTypeId: string; toUnitTypeId: string; gender: string | null; pathType: string; displayOrder: number; notes: string | null }) =>
      apiClient.post('/unit-type-progressions', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unit-type-progressions'] }),
  })
}

export function useUpdateUnitTypeProgression() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; fromUnitTypeId: string; toUnitTypeId: string; gender: string | null; pathType: string; displayOrder: number; notes: string | null }) =>
      apiClient.put(`/unit-type-progressions/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unit-type-progressions'] }),
  })
}

export function useDeleteUnitTypeProgression() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/unit-type-progressions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unit-type-progressions'] }),
  })
}
