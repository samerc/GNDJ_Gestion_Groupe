import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { PaginatedResult } from '@/types/api'

export interface UnitDto {
  id: string
  name: string
  code: string
  description: string | null
  isActive: boolean
  associationId: string
  associationName: string
  unitTypeId: string
  unitTypeName: string
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
  associationId: string
  unitTypeId: string
  isActive?: boolean
  slug?: string | null
  isPublished?: boolean
  foundedDate?: string | null
}

export function useUnits(params: { search?: string; associationId?: string; unitTypeId?: string; isActive?: boolean; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['units', params],
    queryFn: () => apiClient.get<PaginatedResult<UnitDto>>('/units', { params }).then(r => r.data),
  })
}

export function useCreateUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UnitFormData) => apiClient.post('/units', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['units'] }),
  })
}

export function useUpdateUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: UnitFormData & { id: string }) =>
      apiClient.put(`/units/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['units'] }),
  })
}

export function useDeleteUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/units/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['units'] }),
  })
}
