// Teams resource: a sizaine/équipe within a unit (totem, colors, isMaitrise). List/CRUD. Mutations also invalidate ['units'] (memberCount/teamCount). Queries key on ['teams'].
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
  isMaitrise: boolean
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
  isMaitrise?: boolean
}

// Order teams for a picker dropdown: the Maîtrise team(s) first, then the rest in their existing
// order (Array.sort is stable, so non-maîtrise teams keep their server order). "Aucune équipe" is a
// static option the dropdowns prepend themselves — this only orders the real teams after it.
export function teamsForSelect(teams: TeamDto[] | undefined): TeamDto[] {
  if (!teams) return []
  return [...teams].sort((a, b) => Number(b.isMaitrise) - Number(a.isMaitrise))
}

// Paginated teams list (GET /teams); filter by unitId + search. Keyed ['teams', params].
export function useTeams(params: { unitId?: string; search?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['teams', params],
    queryFn: () => apiClient.get<PaginatedResult<TeamDto>>('/teams', { params }).then(r => r.data),
  })
}

// POST /teams; invalidates ['teams'] + ['units'].
export function useCreateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TeamFormData) => apiClient.post('/teams', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); qc.invalidateQueries({ queryKey: ['units'] }) },
  })
}

// PUT /teams/:id; invalidates ['teams'] + ['units'].
export function useUpdateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: TeamFormData & { id: string }) =>
      apiClient.put(`/teams/${id}`, { id, ...data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); qc.invalidateQueries({ queryKey: ['units'] }) },
  })
}

// DELETE /teams/:id; invalidates ['teams'] + ['units'].
export function useDeleteTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/teams/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); qc.invalidateQueries({ queryKey: ['units'] }) },
  })
}
