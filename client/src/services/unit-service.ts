// Units resource: a scout unit (belongs to a unit-type, optionally an association). List/CRUD + public-site fields. Queries key on ['units'].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { PaginatedResult } from '@/types/api'

export interface UnitDto {
  id: string
  name: string
  code: string
  description: string | null
  isActive: boolean
  associationId: string | null
  associationName: string | null
  unitTypeId: string
  unitTypeName: string
  unitTypeCode: string
  teamCount: number
  memberCount: number
  slug: string | null
  isPublished: boolean
  foundedDate: string | null
}

export interface UnitFormData {
  name: string
  code: string
  description?: string | null
  associationId: string | null
  unitTypeId: string
  isActive?: boolean
  slug?: string | null
  isPublished?: boolean
  foundedDate?: string | null
}

// Paginated units list (GET /units); filter by association/unitType/isActive + search. Keyed ['units', params].
// `enabled` gates the fetch (e.g. only load the full list for a manager who needs the all-units picker).
export function useUnits(params: { search?: string; associationId?: string; unitTypeId?: string; isActive?: boolean; page?: number; pageSize?: number }, enabled = true) {
  return useQuery({
    queryKey: ['units', params],
    queryFn: () => apiClient.get<PaginatedResult<UnitDto>>('/units', { params }).then(r => r.data),
    enabled,
  })
}

// POST /units → returns { id } so the caller can navigate to the new record; invalidates ['units'].
export function useCreateUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UnitFormData) => apiClient.post<{ id: string }>('/units', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['units'] }),
  })
}

// PUT /units/:id; invalidates ['units'].
export function useUpdateUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: UnitFormData & { id: string }) =>
      apiClient.put(`/units/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['units'] }),
  })
}

// DELETE /units/:id; invalidates ['units'].
export function useDeleteUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/units/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['units'] }),
  })
}
