// Associations resource: top-level scout org units. List/create/update/delete CRUD. Queries key on ['associations'].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { PaginatedResult } from '@/types/api'

export interface AssociationDto {
  id: string
  name: string
  code: string
  description: string | null
  unitCount: number
  createdAt: string
}

export interface AssociationFormData {
  name: string
  code: string
  description?: string | null
}

// Paginated associations list (GET /associations); optional search. Keyed ['associations', params].
export function useAssociations(params: { search?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['associations', params],
    queryFn: () => apiClient.get<PaginatedResult<AssociationDto>>('/associations', { params }).then(r => r.data),
  })
}

// POST /associations; invalidates ['associations'].
export function useCreateAssociation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AssociationFormData) => apiClient.post('/associations', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['associations'] }),
  })
}

// PUT /associations/:id; invalidates ['associations'].
export function useUpdateAssociation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: AssociationFormData & { id: string }) =>
      apiClient.put(`/associations/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['associations'] }),
  })
}

// DELETE /associations/:id; invalidates ['associations'].
export function useDeleteAssociation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/associations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['associations'] }),
  })
}
