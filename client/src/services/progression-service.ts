// Progression resource: scout stages + badges (both per unit type, admin-managed, reorderable) and
// member progression records. Queries key on ['scout-stages'|'badges'|'progressions', ...].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// ─── Scout Stages ──────────────────────────
// unitTypeId/unitTypeName are null for a GLOBAL stage (available to every unit type).
export interface ScoutStageDto {
  id: string; unitTypeId: string | null; unitTypeName: string | null; code: string; name: string
  description: string | null; displayOrder: number; isActive: boolean; isBadgeStage: boolean; progressionCount: number
}
export interface ScoutStageListDto { id: string; code: string; name: string; isBadgeStage: boolean }
export interface ScoutStageFormData { unitTypeId: string | null; code: string; name: string; description?: string | null; displayOrder: number; isActive: boolean; isBadgeStage: boolean }

// GET /scout-stages — full stage list, filtered by unit type OR globalOnly (the no-unit-type stages).
export function useScoutStages(unitTypeId?: string, globalOnly?: boolean) {
  return useQuery({
    queryKey: ['scout-stages', unitTypeId, globalOnly],
    queryFn: () => apiClient.get<ScoutStageDto[]>('/scout-stages', { params: { unitTypeId, globalOnly: globalOnly || undefined } }).then(r => r.data),
  })
}

// GET /scout-stages/list — slim list for pickers. global=true → the global (no unit type) stages ("Général");
// otherwise the given unit type's OWN stages only.
export function useScoutStageList(unitTypeId: string, global = false) {
  return useQuery({
    queryKey: ['scout-stages', 'list', unitTypeId, global],
    queryFn: () => apiClient.get<ScoutStageListDto[]>('/scout-stages/list', { params: { unitTypeId: unitTypeId || undefined, global: global || undefined } }).then(r => r.data),
    enabled: !!unitTypeId || global,
  })
}

// POST /scout-stages (code auto-generated from name if blank). Invalidates ['scout-stages'].
export function useCreateScoutStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ScoutStageFormData) => apiClient.post('/scout-stages', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scout-stages'] }),
  })
}

// PUT /scout-stages/{id} (isActive=false also = archive).
export function useUpdateScoutStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: ScoutStageFormData & { id: string }) => apiClient.put(`/scout-stages/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scout-stages'] }),
  })
}

// DELETE /scout-stages/{id} — archives if used by members, else hard-deletes.
export function useDeleteScoutStage() {
  const qc = useQueryClient()
  return useMutation({
    // { archived: true } when the stage was archived (used by members) rather than deleted.
    mutationFn: (id: string) => apiClient.delete<{ archived: boolean }>(`/scout-stages/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scout-stages'] }),
  })
}

// PUT /scout-stages/reorder — persist drag order (orderedIds, top→bottom).
export function useReorderScoutStages() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) => apiClient.put('/scout-stages/reorder', { orderedIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scout-stages'] }),
  })
}

// ─── Badges ────────────────────────────────
// unitTypeId/unitTypeName are null for a GLOBAL badge (available to every unit type).
export interface BadgeDto {
  id: string; unitTypeId: string | null; unitTypeName: string | null; code: string; name: string
  description: string | null; displayOrder: number; isActive: boolean; progressionCount: number
}
export interface BadgeListDto { id: string; code: string; name: string }
export interface BadgeFormData { unitTypeId: string | null; code: string; name: string; description?: string | null; displayOrder: number; isActive: boolean }

// GET /badges — full badge list, filtered by unit type OR globalOnly (the no-unit-type badges).
export function useBadges(unitTypeId?: string, globalOnly?: boolean) {
  return useQuery({
    queryKey: ['badges', unitTypeId, globalOnly],
    queryFn: () => apiClient.get<BadgeDto[]>('/badges', { params: { unitTypeId, globalOnly: globalOnly || undefined } }).then(r => r.data),
  })
}

// GET /badges/list — slim list for pickers. global=true → the global (no unit type) badges; otherwise the
// given unit type's OWN badges only.
export function useBadgeList(unitTypeId: string, global = false) {
  return useQuery({
    queryKey: ['badges', 'list', unitTypeId, global],
    queryFn: () => apiClient.get<BadgeListDto[]>('/badges/list', { params: { unitTypeId: unitTypeId || undefined, global: global || undefined } }).then(r => r.data),
    enabled: !!unitTypeId || global,
  })
}

// POST /badges (code auto-generated from name if blank). Invalidates ['badges'].
export function useCreateBadge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: BadgeFormData) => apiClient.post('/badges', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['badges'] }),
  })
}

// PUT /badges/{id} (isActive=false also = archive).
export function useUpdateBadge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: BadgeFormData & { id: string }) => apiClient.put(`/badges/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['badges'] }),
  })
}

// DELETE /badges/{id} — archives if awarded to members, else hard-deletes.
export function useDeleteBadge() {
  const qc = useQueryClient()
  return useMutation({
    // { archived: true } when the badge was archived (awarded to members) rather than deleted.
    mutationFn: (id: string) => apiClient.delete<{ archived: boolean }>(`/badges/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['badges'] }),
  })
}

// ─── Member Progressions ───────────────────
export interface MemberProgressionDto {
  id: string; memberId: string; unitId: string | null; unitName: string | null // null = global (no unit)
  scoutStageId: string; scoutStageCode: string; scoutStageName: string
  badgeId: string | null; badgeCode: string | null; badgeName: string | null
  date: string; location: string | null; notes: string | null; createdAt: string
}

// unitId null = a global-stage progression ("Général" — no unit).
export interface CreateProgressionData { memberId: string; unitId: string | null; scoutStageId: string; badgeId?: string | null; date: string; location?: string | null; notes?: string | null }

// GET /progressions/member/{id} — a member's progression history. Keyed ['progressions', memberId].
export function useMemberProgressions(memberId: string) {
  return useQuery({
    queryKey: ['progressions', memberId],
    queryFn: () => apiClient.get<MemberProgressionDto[]>(`/progressions/member/${memberId}`).then(r => r.data),
    enabled: !!memberId,
  })
}

// POST /progressions — record a stage (+ optional badge) for a member; needs memberId+unitId+stage.
export function useCreateProgression(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateProgressionData) => apiClient.post('/progressions', data),
    // Also refresh the member's Progression tab-count badge (lives on ['members', memberId]).
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['progressions', memberId] }); qc.invalidateQueries({ queryKey: ['members', memberId] }) },
  })
}

// PUT /progressions/{id} — edit an existing progression (unit/stage/badge/date/location/notes).
export function useUpdateProgression(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: CreateProgressionData & { id: string }) => apiClient.put(`/progressions/${id}`, { id, ...data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['progressions', memberId] }); qc.invalidateQueries({ queryKey: ['members', memberId] }) },
  })
}

// DELETE /progressions/{id}.
export function useDeleteProgression(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/progressions/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['progressions', memberId] }); qc.invalidateQueries({ queryKey: ['members', memberId] }) },
  })
}
