import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { PaginatedResult } from '@/types/api'

export interface TeamDto {
  id: string
  name: string
  description: string | null
  totem: string | null
  adjective: string | null
  color1: string | null
  color2: string | null
  displayOrder: number
  unitId: string
  unitName: string
  memberCount: number
}

export interface TeamFormData {
  name: string
  unitId: string
  description?: string | null
  totem?: string | null
  adjective?: string | null
  color1?: string | null
  color2?: string | null
  displayOrder: number
}

export function useTeams(params: { unitId?: string; search?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['teams', params],
    queryFn: () => apiClient.get<PaginatedResult<TeamDto>>('/teams', { params }).then(r => r.data),
  })
}

export function useCreateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TeamFormData) => apiClient.post('/teams', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); qc.invalidateQueries({ queryKey: ['units'] }) },
  })
}

export function useUpdateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: TeamFormData & { id: string }) =>
      apiClient.put(`/teams/${id}`, { id, ...data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); qc.invalidateQueries({ queryKey: ['units'] }) },
  })
}

export function useDeleteTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/teams/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); qc.invalidateQueries({ queryKey: ['units'] }) },
  })
}
