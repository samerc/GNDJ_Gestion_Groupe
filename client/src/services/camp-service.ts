import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface CampListDto {
  id: string; name: string; scoutYear: string; famillesCount: number; status: string; isArchived: boolean
  participantCount: number; gradedCount: number; assignedCount: number
}
export interface BranchMultiplierDto { unitTypeId: string; unitTypeName: string; multiplier: number; defaultYears: number }
export interface CampDto {
  id: string; name: string; scoutYear: string; famillesCount: number; status: string; isArchived: boolean
  noteForceCoef: number; noteOffset: number; branchMultipliers: BranchMultiplierDto[]
  participantCount: number; gradedCount: number; assignedCount: number; familleCreatedCount: number
}
export interface CampAttendeeDto {
  memberId: string; firstName: string; lastName: string; gender: string | null; unitName: string | null
  branche: string | null; isAttending: boolean; participantId: string | null; role: string
}
export interface CampGradeRowDto {
  participantId: string; memberId: string; firstName: string; lastName: string; gender: string | null
  branche: string | null; unitName: string | null; force: number | null; annee: number | null; note: number | null
  isLeaderCandidate: boolean; role: string; notes: string | null
}
export interface CampFamilleMemberDto { participantId: string; memberId: string; firstName: string; lastName: string; gender: string | null; branche: string | null; note: number | null; role: string }
export interface CampFamilleDto {
  id: string; number: number; name: string | null
  pereMemberId: string | null; pereName: string | null; mereMemberId: string | null; mereName: string | null
  size: number; noteSum: number; avgNote: number; boys: number; girls: number
  branchCounts: Record<string, number>; members: CampFamilleMemberDto[]
}
export interface PereMereCandidateDto { memberId: string; firstName: string; lastName: string; branche: string | null; flagged: boolean; participantId: string | null }
export interface EtapisteDto { memberId: string; firstName: string; lastName: string; unitName: string | null }
export interface CampGameDto { id: string; name: string; description: string | null; etapistes: EtapisteDto[] }
export interface EtapisteCandidateDto { memberId: string; firstName: string; lastName: string; unitName: string | null; roleName: string | null }

// ── Camps ──
export const useCamps = () => useQuery({ queryKey: ['camps'], queryFn: () => apiClient.get<CampListDto[]>('/camps').then(r => r.data) })
export const useCamp = (id?: string) => useQuery({ queryKey: ['camp', id], queryFn: () => apiClient.get<CampDto>(`/camps/${id}`).then(r => r.data), enabled: !!id })

export function useCreateCamp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; scoutYear: string; famillesCount?: number | null }) => apiClient.post<string>('/camps', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['camps'] }),
  })
}
export function useUpdateCamp(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; scoutYear: string; famillesCount: number; noteForceCoef: number; noteOffset: number; branchMultipliers?: { unitTypeId: string; multiplier: number }[] }) =>
      apiClient.put(`/camps/${id}`, { id, ...data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['camp', id] }); qc.invalidateQueries({ queryKey: ['camps'] }) },
  })
}
export function useArchiveCamp() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, archive }: { id: string; archive: boolean }) => apiClient.post(`/camps/${id}/archive`, { archive }), onSuccess: () => qc.invalidateQueries({ queryKey: ['camps'] }) })
}
export function useDeleteCamp() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => apiClient.delete(`/camps/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['camps'] }) })
}

// ── Attendance + grading (CU) ──
export const useCampAttendance = (campId?: string, unitId?: string) =>
  useQuery({ queryKey: ['camp-attendance', campId, unitId ?? 'all'], queryFn: () => apiClient.get<CampAttendeeDto[]>(`/camps/${campId}/attendance`, { params: unitId ? { unitId } : {} }).then(r => r.data), enabled: !!campId })
export function useSetCampAttendance(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (items: { memberId: string; attending: boolean }[]) => apiClient.post(`/camps/${campId}/attendance`, { campId, items }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['camp-attendance'] }); qc.invalidateQueries({ queryKey: ['camp-grading'] }) } })
}
export const useCampGrading = (campId?: string, unitId?: string) =>
  useQuery({ queryKey: ['camp-grading', campId, unitId ?? 'all'], queryFn: () => apiClient.get<CampGradeRowDto[]>(`/camps/${campId}/grading`, { params: unitId ? { unitId } : {} }).then(r => r.data), enabled: !!campId })
export function useSaveCampGrades(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (grades: { participantId: string; force: number | null; annee: number | null; isLeaderCandidate: boolean; notes: string | null }[]) => apiClient.post(`/camps/${campId}/grading`, { campId, grades }), onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-grading'] }) })
}

// ── Draft + familles (CG) ──
export function useRunDraft(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: () => apiClient.post(`/camps/${campId}/draft`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['camp-familles', campId] }); qc.invalidateQueries({ queryKey: ['camp', campId] }) } })
}
export const useCampFamilles = (campId?: string) =>
  useQuery({ queryKey: ['camp-familles', campId], queryFn: () => apiClient.get<CampFamilleDto[]>(`/camps/${campId}/familles`).then(r => r.data), enabled: !!campId })
export function useMoveParticipant(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ participantId, familleId }: { participantId: string; familleId: string }) => apiClient.post(`/camps/participants/${participantId}/move`, { familleId }), onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-familles', campId] }) })
}
export function useSwapParticipants(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ participantAId, participantBId }: { participantAId: string; participantBId: string }) => apiClient.post('/camps/swap', { participantAId, participantBId }), onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-familles', campId] }) })
}
export function useSetLeaders(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ familleId, pereMemberId, mereMemberId }: { familleId: string; pereMemberId: string | null; mereMemberId: string | null }) => apiClient.post(`/camps/familles/${familleId}/leaders`, { pereMemberId, mereMemberId }), onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-familles', campId] }) })
}
export const useLeaderCandidates = (campId?: string) =>
  useQuery({ queryKey: ['camp-leader-candidates', campId], queryFn: () => apiClient.get<PereMereCandidateDto[]>(`/camps/${campId}/leader-candidates`).then(r => r.data), enabled: !!campId })

// ── Games (CG) ──
export const useCampGames = (campId?: string) =>
  useQuery({ queryKey: ['camp-games', campId], queryFn: () => apiClient.get<CampGameDto[]>(`/camps/${campId}/games`).then(r => r.data), enabled: !!campId })
export function useCreateGame(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (data: { name: string; description: string | null }) => apiClient.post(`/camps/${campId}/games`, data), onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-games', campId] }) })
}
export function useUpdateGame(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ gameId, ...data }: { gameId: string; name: string; description: string | null }) => apiClient.put(`/camps/games/${gameId}`, data), onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-games', campId] }) })
}
export function useDeleteGame(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (gameId: string) => apiClient.delete(`/camps/games/${gameId}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-games', campId] }) })
}
export function useSetEtapistes(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ gameId, memberIds }: { gameId: string; memberIds: string[] }) => apiClient.post(`/camps/games/${gameId}/etapistes`, { memberIds }), onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-games', campId] }) })
}
export const useEtapisteCandidates = () =>
  useQuery({ queryKey: ['camp-etapiste-candidates'], queryFn: () => apiClient.get<EtapisteCandidateDto[]>('/camps/etapiste-candidates').then(r => r.data) })
