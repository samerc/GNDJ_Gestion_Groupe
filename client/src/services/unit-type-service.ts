// Unit-types resource: a branch category (Meute, Troupe, ...) with age range, color, public description. List/CRUD. Queries key on ['unitTypes'].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { PaginatedResult } from '@/types/api'

export interface UnitTypeDto {
  id: string
  name: string
  code: string
  description: string | null
  numberOfYears: number | null
  ageMin: number | null
  ageMax: number | null
  color: string | null
  unitCount: number
  createdAt: string
  publicDescription: string | null
}

export interface UnitTypeFormData {
  name: string
  code: string
  description?: string | null
  numberOfYears?: number | null
  ageMin?: number | null
  ageMax?: number | null
  color?: string | null
  publicDescription?: string | null
}

// Paginated unit-types list (GET /unit-types); optional search. Keyed ['unitTypes', params].
export function useUnitTypes(params: { search?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['unitTypes', params],
    queryFn: () => apiClient.get<PaginatedResult<UnitTypeDto>>('/unit-types', { params }).then(r => r.data),
  })
}

// POST /unit-types → returns { id } so the caller can navigate to the new record; invalidates ['unitTypes'].
export function useCreateUnitType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UnitTypeFormData) => apiClient.post<{ id: string }>('/unit-types', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unitTypes'] }),
  })
}

// PUT /unit-types/:id; invalidates ['unitTypes'].
export function useUpdateUnitType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: UnitTypeFormData & { id: string }) =>
      apiClient.put(`/unit-types/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unitTypes'] }),
  })
}

// DELETE /unit-types/:id; invalidates ['unitTypes'].
export function useDeleteUnitType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/unit-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unitTypes'] }),
  })
}
