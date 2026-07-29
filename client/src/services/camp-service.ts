import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// Camp BP resource: split the group into balanced "familles" (CU grades → CG drafts/assigns/scores).
// Query keys: ['camps'], ['camp', id], ['camp-attendance'/'-grading'/'-familles'/'-games'/'-leader-candidates'/'-etapiste-candidates', ...].

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
  participantId: string | null; memberId: string; firstName: string; lastName: string; gender: string | null
  branche: string | null; unitName: string | null; teamName: string | null; isAttending: boolean
  force: number | null; annee: number | null; note: number | null
  isLeaderCandidate: boolean; role: string; notes: string | null
}
export interface CampFamilleMemberDto { participantId: string; memberId: string; firstName: string; lastName: string; gender: string | null; branche: string | null; unitName: string | null; note: number | null; role: string }
export interface CampFamilleDto {
  id: string; number: number; name: string | null
  pereMemberId: string | null; pereName: string | null; mereMemberId: string | null; mereName: string | null
  size: number; noteSum: number; avgNote: number; boys: number; girls: number
  branchCounts: Record<string, number>; members: CampFamilleMemberDto[]
}
export interface PereMereCandidateDto { memberId: string; firstName: string; lastName: string; branche: string | null; gender: string | null; flagged: boolean; participantId: string | null }
export interface EtapisteDto { memberId: string; firstName: string; lastName: string; unitName: string | null }
export interface CampGameDto { id: string; name: string; description: string | null; etapistes: EtapisteDto[] }
export interface EtapisteCandidateDto { memberId: string; firstName: string; lastName: string; unitName: string | null; roleName: string | null }

// ── Camps ──
// GET /camps → list of camp editions.
export const useCamps = () => useQuery({ queryKey: ['camps'], queryFn: () => apiClient.get<CampListDto[]>('/camps').then(r => r.data) })
// GET /camps/{id} → one camp incl. note formula coefs + counts; disabled until id is set.
export const useCamp = (id?: string) => useQuery({ queryKey: ['camp', id], queryFn: () => apiClient.get<CampDto>(`/camps/${id}`).then(r => r.data), enabled: !!id })

// POST /camps → create a camp edition (returns new id); invalidates ['camps'].
export function useCreateCamp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; scoutYear: string; famillesCount?: number | null }) => apiClient.post<string>('/camps', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['camps'] }),
  })
}
// PUT /camps/{id} → update settings + note coefs; invalidates ['camp', id] and ['camps'].
export function useUpdateCamp(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; scoutYear: string; famillesCount: number; noteForceCoef: number; noteOffset: number }) =>
      apiClient.put(`/camps/${id}`, { id, ...data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['camp', id] }); qc.invalidateQueries({ queryKey: ['camps'] }) },
  })
}
// POST /camps/{id}/archive → archive/unarchive; invalidates ['camps'].
export function useArchiveCamp() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, archive }: { id: string; archive: boolean }) => apiClient.post(`/camps/${id}/archive`, { archive }), onSuccess: () => qc.invalidateQueries({ queryKey: ['camps'] }) })
}
// DELETE /camps/{id} → delete a camp; invalidates ['camps'].
export function useDeleteCamp() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => apiClient.delete(`/camps/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['camps'] }) })
}

// ── Attendance + grading (CU) ──
// GET /camps/{id}/grading → all eligible youth in scope with grade fields (unit-scoped for CU); disabled until campId.
export const useCampGrading = (campId?: string, unitId?: string) =>
  useQuery({ queryKey: ['camp-grading', campId, unitId ?? 'all'], queryFn: () => apiClient.get<CampGradeRowDto[]>(`/camps/${campId}/grading`, { params: unitId ? { unitId } : {} }).then(r => r.data), enabled: !!campId })
// POST /camps/{id}/grading → member-keyed upsert (attendance + force/année/candidate in one save); invalidates grading + attendance.
export function useSaveCampGrades(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (grades: { memberId: string; attending: boolean; force: number | null; annee: number | null; isLeaderCandidate: boolean; notes: string | null }[]) => apiClient.post(`/camps/${campId}/grading`, { campId, grades }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['camp-grading'] }); qc.invalidateQueries({ queryKey: ['camp-attendance'] }) } })
}

// ── Draft + familles (CG) ──
// POST /camps/{id}/draft → run the balanced randomized draft into familles; invalidates familles + camp.
export function useRunDraft(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: () => apiClient.post(`/camps/${campId}/draft`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['camp-familles', campId] }); qc.invalidateQueries({ queryKey: ['camp', campId] }) } })
}
// GET /camps/{id}/familles → familles with members + balance metrics; disabled until campId.
export const useCampFamilles = (campId?: string) =>
  useQuery({ queryKey: ['camp-familles', campId], queryFn: () => apiClient.get<CampFamilleDto[]>(`/camps/${campId}/familles`).then(r => r.data), enabled: !!campId })
// POST /camps/participants/{id}/move → move a participant to another famille; invalidates familles.
export function useMoveParticipant(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ participantId, familleId }: { participantId: string; familleId: string }) => apiClient.post(`/camps/participants/${participantId}/move`, { familleId }), onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-familles', campId] }) })
}
// POST /camps/swap → swap two participants between familles; invalidates familles.
export function useSwapParticipants(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ participantAId, participantBId }: { participantAId: string; participantBId: string }) => apiClient.post('/camps/swap', { participantAId, participantBId }), onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-familles', campId] }) })
}
// POST /camps/familles/{id}/leaders → set Père (male) / Mère (female) for a famille; invalidates familles.
export function useSetLeaders(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ familleId, pereMemberId, mereMemberId }: { familleId: string; pereMemberId: string | null; mereMemberId: string | null }) => apiClient.post(`/camps/familles/${familleId}/leaders`, { pereMemberId, mereMemberId }), onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-familles', campId] }) })
}
// GET /camps/{id}/leader-candidates → eligible Père/Mère candidates (gender on each); disabled until campId.
export const useLeaderCandidates = (campId?: string) =>
  useQuery({ queryKey: ['camp-leader-candidates', campId], queryFn: () => apiClient.get<PereMereCandidateDto[]>(`/camps/${campId}/leader-candidates`).then(r => r.data), enabled: !!campId })

// ── Games (CG) ──
// GET /camps/{id}/games → games with their étapiste sets; disabled until campId.
export const useCampGames = (campId?: string) =>
  useQuery({ queryKey: ['camp-games', campId], queryFn: () => apiClient.get<CampGameDto[]>(`/camps/${campId}/games`).then(r => r.data), enabled: !!campId })
// POST /camps/{id}/games → create a game; invalidates ['camp-games', campId].
export function useCreateGame(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (data: { name: string; description: string | null }) => apiClient.post(`/camps/${campId}/games`, data), onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-games', campId] }) })
}
// DELETE /camps/games/{gameId} → delete a game; invalidates ['camp-games', campId].
export function useDeleteGame(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (gameId: string) => apiClient.delete(`/camps/games/${gameId}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-games', campId] }) })
}
// POST /camps/games/{gameId}/etapistes → set a game's étapiste members; invalidates ['camp-games', campId].
export function useSetEtapistes(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ gameId, memberIds }: { gameId: string; memberIds: string[] }) => apiClient.post(`/camps/games/${gameId}/etapistes`, { memberIds }), onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-games', campId] }) })
}
// GET /camps/{id}/etapiste-candidates → members eligible as étapistes (maîtrise + older youth); disabled until campId.
export const useEtapisteCandidates = (campId?: string) =>
  useQuery({ queryKey: ['camp-etapiste-candidates', campId], queryFn: () => apiClient.get<EtapisteCandidateDto[]>(`/camps/${campId}/etapiste-candidates`).then(r => r.data), enabled: !!campId })

// ── PDF reports ──
// Helper: GET a PDF blob and trigger a browser download (not a hook).
async function downloadPdf(url: string, filename: string) {
  const r = await apiClient.get(url, { responseType: 'blob' })
  const blobUrl = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }))
  const a = document.createElement('a'); a.href = blobUrl; a.download = filename; a.click(); URL.revokeObjectURL(blobUrl)
}
// GET /camps/{id}/familles/{n}/pdf → one famille sheet (blob → save).
export const printFamille = (campId: string, number: number) => downloadPdf(`/camps/${campId}/familles/${number}/pdf`, `Famille_${number}.pdf`)
// GET /camps/{id}/familles/pdf → all familles, one per page (blob → save).
export const printAllFamilles = (campId: string) => downloadPdf(`/camps/${campId}/familles/pdf`, 'Familles.pdf')
// GET /camps/{id}/unit-list/pdf → members grouped by unit with famille number (blob → save).
export const printUnitList = (campId: string) => downloadPdf(`/camps/${campId}/unit-list/pdf`, 'Liste_par_unite.pdf')
