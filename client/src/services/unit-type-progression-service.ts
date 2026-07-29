// Parcours scouts: group-wide branch-to-branch progression paths (gender-keyed) that drive passage suggestions. List/CRUD + suggest. Queries key on ['unit-type-progressions'].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface UnitTypeProgressionDto {
  id: string
  associationId: string | null
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

// Progression paths list (GET /unit-type-progressions). Keyed ['unit-type-progressions', associationId ?? 'all'].
// Group-wide paths (no association split). Pass an associationId only for legacy/filtered views.
export function useUnitTypeProgressions(associationId?: string) {
  return useQuery({
    queryKey: ['unit-type-progressions', associationId ?? 'all'],
    queryFn: () => apiClient.get<UnitTypeProgressionDto[]>('/unit-type-progressions', { params: associationId ? { associationId } : {} }).then(r => r.data),
  })
}

// POST /unit-type-progressions; invalidates ['unit-type-progressions'].
export function useCreateUnitTypeProgression() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { associationId?: string | null; fromUnitTypeId: string; toUnitTypeId: string; gender: string | null; pathType: string; displayOrder: number; notes: string | null }) =>
      apiClient.post('/unit-type-progressions', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unit-type-progressions'] }),
  })
}

// PUT /unit-type-progressions/:id; invalidates ['unit-type-progressions'].
export function useUpdateUnitTypeProgression() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; fromUnitTypeId: string; toUnitTypeId: string; gender: string | null; pathType: string; displayOrder: number; notes: string | null }) =>
      apiClient.put(`/unit-type-progressions/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unit-type-progressions'] }),
  })
}

// DELETE /unit-type-progressions/:id; invalidates ['unit-type-progressions'].
export function useDeleteUnitTypeProgression() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/unit-type-progressions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unit-type-progressions'] }),
  })
}
