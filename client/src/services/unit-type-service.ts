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

export function useUnitTypes(params: { search?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['unitTypes', params],
    queryFn: () => apiClient.get<PaginatedResult<UnitTypeDto>>('/unit-types', { params }).then(r => r.data),
  })
}

export function useCreateUnitType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UnitTypeFormData) => apiClient.post('/unit-types', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unitTypes'] }),
  })
}

export function useUpdateUnitType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: UnitTypeFormData & { id: string }) =>
      apiClient.put(`/unit-types/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unitTypes'] }),
  })
}

export function useDeleteUnitType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/unit-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unitTypes'] }),
  })
}
