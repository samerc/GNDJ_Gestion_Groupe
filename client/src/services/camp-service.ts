import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { saveBlob } from '@/lib/download'

// Camp BP resource: split the group into balanced "familles" (CU grades → CG drafts/assigns/scores).
// Query keys: ['camps'], ['camp', id], ['camp-attendance'/'-grading'/'-familles'/'-games'/'-leader-candidates'/'-etapiste-candidates', ...].

// name + scoutYear are automatic and fixed ("Camp BP 2027" for 2026-2027); theme is free text.
export interface CampListDto {
  id: string; name: string; scoutYear: string; theme: string | null; famillesCount: number; status: string; isArchived: boolean
  participantCount: number; gradedCount: number; assignedCount: number
}
export interface BranchMultiplierDto { unitTypeId: string; unitTypeName: string; multiplier: number; defaultYears: number }
export interface CampDto {
  id: string; name: string; scoutYear: string; theme: string | null; famillesCount: number; status: string; isArchived: boolean
  noteForceCoef: number; noteOffset: number; branchMultipliers: BranchMultiplierDto[]
  participantCount: number; gradedCount: number; assignedCount: number; familleCreatedCount: number
  myAccess: CampMyAccessDto
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
export interface CampFamilleMemberDto { participantId: string; memberId: string; firstName: string; lastName: string; gender: string | null; branche: string | null; unitName: string | null; unitCode: string | null; note: number | null; role: string }
export interface CampFamilleDto {
  id: string; number: number; name: string | null; description: string | null; superFamilleId: string | null; superFamilleName: string | null
  pereMemberId: string | null; pereName: string | null; mereMemberId: string | null; mereName: string | null
  size: number; noteSum: number; avgNote: number; boys: number; girls: number
  branchCounts: Record<string, number>; members: CampFamilleMemberDto[]
}
export interface PereMereCandidateDto { memberId: string; firstName: string; lastName: string; branche: string | null; gender: string | null; flagged: boolean; participantId: string | null }
export interface EtapisteDto { memberId: string; firstName: string; lastName: string; unitName: string | null }
// mainLocation (lieu A) / backupLocation (lieu B, bad weather) are picked from the camp.places setting.
// backupGame*: the game played instead when Plan B is on.
export interface CampGameDto {
  id: string; number: number | null; name: string; description: string | null; mainLocation: string | null; backupLocation: string | null; etapistes: EtapisteDto[]
  backupGameName: string | null; backupGameDescription: string | null
}
// isAine = routier / caravelle / JEM (offered only when the camp.etapistes_aines setting is on); branch = their branch name.
export interface EtapisteCandidateDto { memberId: string; firstName: string; lastName: string; unitName: string | null; unitCode: string | null; roleName: string | null; isAine: boolean; branch: string | null }

// ── Camps ──
// GET /camps → list of camp editions. `enabled` lets callers without camp permission (e.g. the sidebar
// deciding whether to show the CU "Camp BP" link) skip the fetch instead of getting a 403.
// staleTime: the sidebar reads this on every navigation just to place the "Camp BP" link; camps rarely change
// mid-session (create/archive invalidate ['camps']), so cache it 5 min to avoid a refetch on each route change.
export const useCamps = (enabled = true) => useQuery({ queryKey: ['camps'], queryFn: () => apiClient.get<CampListDto[]>('/camps').then(r => r.data), enabled, staleTime: 5 * 60 * 1000 })
// GET /camps/{id} → one camp incl. note formula coefs + counts; disabled until id is set.
export const useCamp = (id?: string) => useQuery({ queryKey: ['camp', id], queryFn: () => apiClient.get<CampDto>(`/camps/${id}`).then(r => r.data), enabled: !!id })

// ── Commission BP ──
// Access level of a commission member for one area of the camp.
export type CampAccessLevel = 'none' | 'view' | 'edit'
// What the CURRENT user may do in this camp (server-computed: CG = admin, chef de commission, member levels).
export interface CampMyAccessDto {
  isAdmin: boolean; isCommissionMember: boolean; isChef: boolean
  familles: CampAccessLevel; jeux: CampAccessLevel; parametres: CampAccessLevel
  canManageCommission: boolean; canSetRights: boolean
}
export interface CampCommissionMemberDto {
  memberId: string; firstName: string; lastName: string; roles: string | null
  isChef: boolean; famillesAccess: CampAccessLevel; jeuxAccess: CampAccessLevel; parametresAccess: CampAccessLevel
  subCommissions: string[]
}
export interface CampCommissionCandidateDto { memberId: string; firstName: string; lastName: string; roles: string | null }
// GET /camps/{id}/commission → the members named to run this camp, with their rights.
export const useCampCommission = (campId: string) => useQuery({
  queryKey: ['camp', campId, 'commission'],
  queryFn: () => apiClient.get<CampCommissionMemberDto[]>(`/camps/${campId}/commission`).then(r => r.data),
  enabled: !!campId,
})
// GET /camps/commission-candidates → maîtrise members who can join a commission; groupLevelOnly = the
// assistants chef de groupe who can be named "Chef de commission".
export const useCampCommissionCandidates = (enabled: boolean, groupLevelOnly = false) => useQuery({
  queryKey: ['camp', 'commission-candidates', groupLevelOnly],
  queryFn: () => apiClient.get<CampCommissionCandidateDto[]>('/camps/commission-candidates', { params: { groupLevelOnly } }).then(r => r.data),
  enabled,
})
// PUT /camps/{id}/chefs → the ACGs leading this camp (CG only).
export function useSetCampChefs(campId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (memberIds: string[]) => apiClient.put(`/camps/${campId}/chefs`, { memberIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['camp', campId, 'commission'] }),
  })
}
// PUT /camps/{id}/commission → replace the commission members (CG or a chef de commission).
export function useSetCampCommission(campId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (memberIds: string[]) => apiClient.put(`/camps/${campId}/commission`, { memberIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['camp', campId, 'commission'] }),
  })
}
// PUT /camps/{id}/commission/{memberId}/access → one member's rights per area (a chef de commission or the CG).
export function useSetCampCommissionAccess(campId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: { memberId: string; famillesAccess: CampAccessLevel; jeuxAccess: CampAccessLevel; parametresAccess: CampAccessLevel }) =>
      apiClient.put(`/camps/${campId}/commission/${b.memberId}/access`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['camp', campId, 'commission'] }),
  })
}

// POST /camps → create a camp edition (returns new id); invalidates ['camps'].
export function useCreateCamp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { theme: string | null; famillesCount?: number | null; chefMemberIds?: string[] }) => apiClient.post<string>('/camps', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['camps'] }),
  })
}
// PUT /camps/{id} → update settings + note coefs; invalidates ['camp', id] and ['camps'].
export function useUpdateCamp(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { theme: string | null; famillesCount: number; noteForceCoef: number; noteOffset: number }) =>
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
  return useMutation({ mutationFn: (data: { name: string; description: string | null; number?: number | null }) => apiClient.post(`/camps/${campId}/games`, data), onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-games', campId] }) })
}
// PUT /camps/games/{gameId} → rename a game / edit its description (rich-text HTML); invalidates ['camp-games', campId].
export function useUpdateGame(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, ...body }: { id: string; name: string; description: string | null; mainLocation: string | null; backupLocation: string | null; number: number | null; backupGameName: string | null; backupGameDescription: string | null }) => apiClient.put(`/camps/games/${id}`, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-games', campId] }) })
}
// POST /camps/{id}/games/auto-places → give the games a lieu A and/or B from camp.places (within capacity).
export interface CampPlacesAssignResult { assignedMain: number; assignedBackup: number; noPlace: string[] }
export function useAutoAssignPlaces(campId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { main: boolean; backup: boolean; replace: boolean }) => apiClient.post<CampPlacesAssignResult>(`/camps/${campId}/games/auto-places`, body).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['camp-games', campId] }); qc.invalidateQueries({ queryKey: ['camp-rotation', campId] }) },
  })
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
  saveBlob(r.data, filename, 'application/pdf')
}
// ── Étapistes: my games ──
export interface MyCampGameDto {
  id: string; campId: string; campName: string; number: number | null; name: string; description: string | null; mainLocation: string | null; backupLocation: string | null; etapistes: EtapisteDto[]
  backupGameName: string | null; backupGameDescription: string | null; useBackupLocations: boolean
}
// GET /camps/my-games → games of live camps where I am an étapiste (any signed-in member).
export const useMyCampGames = () =>
  useQuery({ queryKey: ['camp-my-games'], queryFn: () => apiClient.get<MyCampGameDto[]>('/camps/my-games').then(r => r.data) })
// GET /camps/games/{id}/pdf → printable sheet of one game (name, étapistes, description).
export const printGame = (gameId: string, name: string) => downloadPdf(`/camps/games/${gameId}/pdf`, `Jeu - ${name}.pdf`)
// GET /camps/{id}/familles/{n}/pdf → one famille sheet (blob → save).
export const printFamille = (campId: string, number: number) => downloadPdf(`/camps/${campId}/familles/${number}/pdf`, `Famille_${number}.pdf`)
// GET /camps/{id}/familles/pdf → all familles, one per page (blob → save).
export const printAllFamilles = (campId: string) => downloadPdf(`/camps/${campId}/familles/pdf`, 'Familles.pdf')
// GET /camps/{id}/unit-list/pdf → members grouped by unit with famille number (blob → save).
export const printUnitList = (campId: string) => downloadPdf(`/camps/${campId}/unit-list/pdf`, 'Liste_par_unite.pdf')
// GET /camps/{id}/presence/xlsx → « Liste de présence » Excel, one sheet per unit in my scope (absents marked).
export async function downloadPresenceList(campId: string) {
  const r = await apiClient.get(`/camps/${campId}/presence/xlsx`, { responseType: 'blob' })
  saveBlob(r.data, 'Liste de présence.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}


// ── Grand jeu: rotation (fixed grid), lookup, scoring ──
// Dates are 'yyyy-MM-dd', times 'HH:mm:ss' (camp time, Lebanon). `now` is the server's camp-local time.
export interface CampRotationSlotDto { number: number; date: string; startTime: string; endTime: string }
export interface CampRotationGameDto { number: number; gameId: string | null; name: string | null; mainLocation: string | null; backupLocation: string | null; etapistes: string[]; backupGameName: string | null }
export interface CampRotationDto {
  generated: boolean; useBackupLocations: boolean; famillesCount: number; existingFamilles: number
  // gamesCount = games of the grid (G games for 2 × G familles); gridProblem = why the famille count can't get a
  // rotation; generatedFamilles = familles of the generated grid (0 before); defaultFirstDaySlots = proposed split.
  gamesCount: number; gridProblem: string | null; generatedFamilles: number; defaultFirstDaySlots: number
  matchCount: number; scoredCount: number; slots: CampRotationSlotDto[]; games: CampRotationGameDto[]; now: string
}
export interface CampPersonMatchDto { memberId: string; firstName: string; lastName: string; unitCode: string | null; role: string; familleNumber: number | null; familleName: string | null }
export interface CampScheduleStepDto {
  slot: number; date: string; startTime: string; endTime: string; gameNumber: number; gameName: string | null
  mainLocation: string | null; backupLocation: string | null; opponent: number; opponentName: string | null; etapistes: string[]
  backupGameName: string | null // played instead of gameName when Plan B is on
}
export interface CampFamilleScheduleDto {
  number: number; name: string | null; superFamille: string | null; pereName: string | null; perePhone: string | null
  mereName: string | null; merePhone: string | null; memberCount: number; useBackupLocations: boolean; now: string; steps: CampScheduleStepDto[]
}
export type CampLateness = 'none' | 'A' | 'B'
export type CampSide = 'A' | 'B' | 'tie'
export interface CampMatchDto {
  id: string; slotNumber: number; date: string | null; startTime: string | null; endTime: string | null; gameNumber: number; gameName: string | null
  familleA: number; familleAName: string | null; familleB: number; familleBName: string | null
  retardA: CampLateness | null; retardB: CampLateness | null; manche1: CampSide | null; manche2: CampSide | null; espritA: number | null; firstArrived: 'A' | 'B' | null
  pointsA: number | null; pointsB: number | null; espritB: number | null; enigme: 'A' | 'B' | null
  scoredAt: string | null; scoredByName: string | null; source: 'online' | 'paper' | null; canEdit: boolean
}
export interface CampRankingRowDto { rank: number; number: number; name: string | null; superFamille: string | null; gamePoints: number; esprit: number; total: number; enigmes: number; played: number }
export interface CampRankingDto { scoredCount: number; matchCount: number; familles: CampRankingRowDto[]; superFamilles: { name: string; familles: number; total: number; average: number }[] }
export interface CampSuperFamilleDto { id: string; name: string; description: string | null; displayOrder: number; familleNumbers: number[] }

// Everything that depends on the rotation / scores is refreshed together.
const invalidateGrandJeu = (qc: ReturnType<typeof useQueryClient>, campId: string) => {
  qc.invalidateQueries({ queryKey: ['camp-rotation', campId] })
  qc.invalidateQueries({ queryKey: ['camp-schedule', campId] })
  qc.invalidateQueries({ queryKey: ['camp-matches', campId] })
  qc.invalidateQueries({ queryKey: ['camp-ranking', campId] })
}
// GET /camps/{id}/rotation → slots, the 25 game numbers with their game, rain plan, progress (commission).
export const useCampRotation = (campId?: string, enabled = true) =>
  useQuery({ queryKey: ['camp-rotation', campId], queryFn: () => apiClient.get<CampRotationDto>(`/camps/${campId}/rotation`).then(r => r.data), enabled: !!campId && enabled })
// POST /camps/{id}/rotation/generate → slots + matches of the fixed grid for the two camp days.
export function useGenerateRotation(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (b: { firstDay: string; secondDay: string; firstDaySlots?: number | null }) => apiClient.post(`/camps/${campId}/rotation/generate`, b), onSuccess: () => invalidateGrandJeu(qc, campId) })
}
// PUT /camps/{id}/rotation/slots → dates / hours of the slots.
export function useUpdateRotationSlots(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (slots: CampRotationSlotDto[]) => apiClient.put(`/camps/${campId}/rotation/slots`, slots), onSuccess: () => invalidateGrandJeu(qc, campId) })
}
// PUT /camps/{id}/rotation/plan-b → rain plan (backup places) on / off.
export function useSetPlanB(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (useBackup: boolean) => apiClient.put(`/camps/${campId}/rotation/plan-b`, { useBackup }), onSuccess: () => invalidateGrandJeu(qc, campId) })
}
// GET /camps/{id}/lookup?q= → people (famille member / Père / Mère) or a famille number.
export const useCampLookup = (campId: string | undefined, q: string) =>
  useQuery({
    queryKey: ['camp-lookup', campId, q],
    queryFn: () => apiClient.get<CampPersonMatchDto[]>(`/camps/${campId}/lookup`, { params: { q } }).then(r => r.data),
    enabled: !!campId && q.trim().length >= 1, staleTime: 30_000,
  })
// GET /camps/{id}/familles/{n}/schedule → the famille's full route.
export const useFamilleSchedule = (campId: string | undefined, number: number | null) =>
  useQuery({
    queryKey: ['camp-schedule', campId, number],
    queryFn: () => apiClient.get<CampFamilleScheduleDto>(`/camps/${campId}/familles/${number}/schedule`).then(r => r.data),
    enabled: !!campId && number != null,
  })
// GET /camps/{id}/matches?game=&slot= → matches with their score (an étapiste only gets their own games).
export const useCampMatches = (campId: string | undefined, filter: { game?: number | null; slot?: number | null }, enabled = true) =>
  useQuery({
    queryKey: ['camp-matches', campId, filter.game ?? null, filter.slot ?? null],
    queryFn: () => apiClient.get<CampMatchDto[]>(`/camps/${campId}/matches`, { params: { game: filter.game ?? undefined, slot: filter.slot ?? undefined } }).then(r => r.data),
    enabled: !!campId && enabled,
  })
export interface CampScoreBody { retardA: CampLateness; retardB: CampLateness; manche1: CampSide | null; manche2: CampSide | null; espritA: number | null; firstArrived: 'A' | 'B' | null; source: 'online' | 'paper' }
// PUT /camps/matches/{id}/score → enter / correct a score (points computed server-side).
export function useSaveMatchScore(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ matchId, ...b }: CampScoreBody & { matchId: string }) => apiClient.put(`/camps/matches/${matchId}/score`, b), onSuccess: () => invalidateGrandJeu(qc, campId) })
}
// DELETE /camps/matches/{id}/score → back to "not scored".
export function useClearMatchScore(campId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (matchId: string) => apiClient.delete(`/camps/matches/${matchId}/score`), onSuccess: () => invalidateGrandJeu(qc, campId) })
}
// GET /camps/{id}/ranking → familles (and superfamilles) ranking.
export const useCampRanking = (campId?: string, enabled = true) =>
  useQuery({ queryKey: ['camp-ranking', campId], queryFn: () => apiClient.get<CampRankingDto>(`/camps/${campId}/ranking`).then(r => r.data), enabled: !!campId && enabled })
// Printouts: famille passports (all or one) and the paper score sheets (all games or one).
export const printPassports = (campId: string, famille?: number) =>
  downloadPdf(`/camps/${campId}/passports/pdf${famille ? `?famille=${famille}` : ''}`, famille ? `Passeport - Famille ${famille}.pdf` : 'Passeports des familles.pdf')
export const printScoreSheets = (campId: string, game?: number) =>
  downloadPdf(`/camps/${campId}/score-sheets/pdf${game ? `?game=${game}` : ''}`, game ? `Pointage - Jeu ${game}.pdf` : 'Pointage - tous les jeux.pdf')

// ── Familles info + superfamilles ──
// PUT /camps/familles/{id}/info → name, description, superfamille of a famille.
export function useUpdateFamilleInfo(campId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ familleId, ...b }: { familleId: string; name: string | null; description: string | null; superFamilleId: string | null }) => apiClient.put(`/camps/familles/${familleId}/info`, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['camp-familles', campId] }); qc.invalidateQueries({ queryKey: ['camp-superfamilles', campId] }); invalidateGrandJeu(qc, campId) },
  })
}
// GET /camps/{id}/superfamilles → the optional groups of familles.
export const useCampSuperFamilles = (campId?: string) =>
  useQuery({ queryKey: ['camp-superfamilles', campId], queryFn: () => apiClient.get<CampSuperFamilleDto[]>(`/camps/${campId}/superfamilles`).then(r => r.data), enabled: !!campId })
// PUT /camps/{id}/superfamilles → replace the list (a removed one ungroups its familles).
export function useSaveSuperFamilles(campId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (items: { id: string | null; name: string; description: string | null }[]) => apiClient.put(`/camps/${campId}/superfamilles`, items),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['camp-superfamilles', campId] }); qc.invalidateQueries({ queryKey: ['camp-familles', campId] }) },
  })
}
// POST /camps/{id}/superfamilles/auto → split the familles evenly, in number order.
export function useAutoSuperFamilles(campId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post(`/camps/${campId}/superfamilles/auto`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['camp-superfamilles', campId] }); qc.invalidateQueries({ queryKey: ['camp-familles', campId] }) },
  })
}

// ── Sub-commissions ──
// GET /camps/{id}/sub-commissions → the camp's list (Trésor, Jeu, Code… by default).
export const useCampSubCommissions = (campId?: string) =>
  useQuery({ queryKey: ['camp', campId, 'sub-commissions'], queryFn: () => apiClient.get<string[]>(`/camps/${campId}/sub-commissions`).then(r => r.data), enabled: !!campId })
// PUT /camps/{id}/sub-commissions → replace the list (CG or a chef de commission).
export function useSetCampSubCommissions(campId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (names: string[]) => apiClient.put(`/camps/${campId}/sub-commissions`, names),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['camp', campId, 'sub-commissions'] }); qc.invalidateQueries({ queryKey: ['camp', campId, 'commission'] }) },
  })
}
// PUT /camps/{id}/commission/{memberId}/sub-commissions → the sub-commissions of one member.
export function useSetMemberSubCommissions(campId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ memberId, names }: { memberId: string; names: string[] }) => apiClient.put(`/camps/${campId}/commission/${memberId}/sub-commissions`, names),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['camp', campId, 'commission'] }),
  })
}
