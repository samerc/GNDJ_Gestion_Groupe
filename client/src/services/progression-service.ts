import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// ─── Scout Stages ──────────────────────────
export interface ScoutStageDto {
  id: string; unitTypeId: string; unitTypeName: string; code: string; name: string
  description: string | null; displayOrder: number; isActive: boolean; isBadgeStage: boolean; progressionCount: number
}
export interface ScoutStageListDto { id: string; code: string; name: string; isBadgeStage: boolean }
export interface ScoutStageFormData { unitTypeId: string; code: string; name: string; description?: string | null; displayOrder: number; isActive: boolean; isBadgeStage: boolean }

export function useScoutStages(unitTypeId?: string) {
  return useQuery({
    queryKey: ['scout-stages', unitTypeId],
    queryFn: () => apiClient.get<ScoutStageDto[]>('/scout-stages', { params: { unitTypeId } }).then(r => r.data),
  })
}

export function useScoutStageList(unitTypeId: string) {
  return useQuery({
    queryKey: ['scout-stages', 'list', unitTypeId],
    queryFn: () => apiClient.get<ScoutStageListDto[]>('/scout-stages/list', { params: { unitTypeId } }).then(r => r.data),
    enabled: !!unitTypeId,
  })
}

export function useCreateScoutStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ScoutStageFormData) => apiClient.post('/scout-stages', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scout-stages'] }),
  })
}

export function useUpdateScoutStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: ScoutStageFormData & { id: string }) => apiClient.put(`/scout-stages/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scout-stages'] }),
  })
}

export function useDeleteScoutStage() {
  const qc = useQueryClient()
  return useMutation({
    // { archived: true } when the stage was archived (used by members) rather than deleted.
    mutationFn: (id: string) => apiClient.delete<{ archived: boolean }>(`/scout-stages/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scout-stages'] }),
  })
}

export function useReorderScoutStages() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) => apiClient.put('/scout-stages/reorder', { orderedIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scout-stages'] }),
  })
}

// ─── Badges ────────────────────────────────
export interface BadgeDto {
  id: string; unitTypeId: string; unitTypeName: string; code: string; name: string
  description: string | null; displayOrder: number; isActive: boolean; progressionCount: number
}
export interface BadgeListDto { id: string; code: string; name: string }
export interface BadgeFormData { unitTypeId: string; code: string; name: string; description?: string | null; displayOrder: number; isActive: boolean }

export function useBadges(unitTypeId?: string) {
  return useQuery({
    queryKey: ['badges', unitTypeId],
    queryFn: () => apiClient.get<BadgeDto[]>('/badges', { params: { unitTypeId } }).then(r => r.data),
  })
}

export function useBadgeList(unitTypeId: string) {
  return useQuery({
    queryKey: ['badges', 'list', unitTypeId],
    queryFn: () => apiClient.get<BadgeListDto[]>('/badges/list', { params: { unitTypeId } }).then(r => r.data),
    enabled: !!unitTypeId,
  })
}

export function useCreateBadge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: BadgeFormData) => apiClient.post('/badges', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['badges'] }),
  })
}

export function useUpdateBadge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: BadgeFormData & { id: string }) => apiClient.put(`/badges/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['badges'] }),
  })
}

export function useDeleteBadge() {
  const qc = useQueryClient()
  return useMutation({
    // { archived: true } when the badge was archived (awarded to members) rather than deleted.
    mutationFn: (id: string) => apiClient.delete<{ archived: boolean }>(`/badges/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['badges'] }),
  })
}

export function useReorderBadges() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) => apiClient.put('/badges/reorder', { orderedIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['badges'] }),
  })
}

// ─── Member Progressions ───────────────────
export interface MemberProgressionDto {
  id: string; memberId: string; unitId: string; unitName: string
  scoutStageId: string; scoutStageCode: string; scoutStageName: string
  badgeId: string | null; badgeCode: string | null; badgeName: string | null
  date: string; location: string | null; notes: string | null; createdAt: string
}

export interface CreateProgressionData { memberId: string; unitId: string; scoutStageId: string; badgeId?: string | null; date: string; location?: string | null; notes?: string | null }

export function useMemberProgressions(memberId: string) {
  return useQuery({
    queryKey: ['progressions', memberId],
    queryFn: () => apiClient.get<MemberProgressionDto[]>(`/progressions/member/${memberId}`).then(r => r.data),
    enabled: !!memberId,
  })
}

export function useCreateProgression(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateProgressionData) => apiClient.post('/progressions', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['progressions', memberId] }),
  })
}

export function useDeleteProgression(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/progressions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['progressions', memberId] }),
  })
}
