// Passage annuel resource: yearly member transitions (current → proposed → final unit/team/role),
// CU propose / CG review-finalize workflow, open/close toggle. Queries key on ['passages', ...];
// all mutations invalidate ['passages'].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { filenameFromDisposition } from '@/lib/download'

export interface PassageDto {
  id: string
  scoutYear: string
  memberId: string
  memberName: string
  cardNumber: string | null
  dateOfBirth: string | null
  age: number | null
  currentUnitId: string
  currentUnitCode: string
  currentUnitName: string
  currentTeamName: string | null
  currentRoleName: string
  proposedUnitId: string
  proposedUnitCode: string
  proposedUnitName: string
  proposedTeamId: string | null
  proposedTeamName: string | null
  proposedRoleName: string
  finalUnitId: string | null
  finalUnitCode: string | null
  finalUnitName: string | null
  finalTeamId: string | null
  finalTeamName: string | null
  finalRoleName: string | null
  status: string
  isLeaving: boolean
  cuNotes: string | null
  cgNotes: string | null
  createdAt: string
  // The CG's leaving decision when it differs from the CU's (null = same). Effective = finalIsLeaving ?? isLeaving.
  finalIsLeaving: boolean | null
  // True when the CG changed the CU's proposal — the line is then locked for the CU.
  cgModified: boolean
}

export interface PassageUnitSummary {
  unitId: string
  unitCode: string
  unitName: string
  total: number
  pending: number
  approved: number
  rejected: number
  finalized: number
  expectedMembers: number
  missingLines: number
  submitted: boolean
  submittedAt: string | null
}

export interface PassageSummaryDto {
  scoutYear: string
  totalMembers: number
  pending: number
  approved: number
  rejected: number
  finalized: number
  expectedMembers: number
  missingLines: number
  unitSummaries: PassageUnitSummary[]
  unitsNotSubmitted: number
}

// A unit's passage: finished by its CU (locked for them) + how many active members still lack a line.
export interface PassageUnitStatus {
  unitId: string
  submitted: boolean
  submittedAt: string | null
  expectedMembers: number
  missingLines: number
}

// Associations that received newcomers in the posted passage (one Word document each).
export interface PassageNewcomerGroup {
  associationId: string | null
  associationName: string
  count: number
  unitCount: number
}

export interface PassageStatusDto {
  isOpen: boolean
  scoutYear: string
}

// ── "Next year" projection (CG simulation) ────────────────────────────────────────────────────────
export interface PassageProjectionUnit {
  unitId: string
  unitCode: string
  unitName: string
  unitTypeId: string
  unitTypeName: string | null
  quota: number | null
  ageMin: number | null
  ageMax: number | null
}
// lineStatus: 'None' | 'Pending' | 'Approved' | 'Rejected'. destUnitId = final ?? proposed (null if leaving/no line).
export interface PassageProjectionMember {
  memberId: string
  memberName: string
  currentUnitId: string
  lineStatus: string
  isLeaving: boolean
  destUnitId: string | null
}
export interface PassageProjectionDto {
  scoutYear: string
  missingLines: number
  units: PassageProjectionUnit[]
  members: PassageProjectionMember[]
}

// GET /passages/unit/{unitId} — passage lines for one unit (CU page); requires scoutYear. Unit-scoped.
export function usePassagesByUnit(unitId: string, scoutYear: string) {
  return useQuery({
    queryKey: ['passages', 'unit', unitId, scoutYear],
    queryFn: () => apiClient.get<PassageDto[]>(`/passages/unit/${unitId}`, { params: { scoutYear } }).then(r => r.data),
    enabled: !!unitId && !!scoutYear,
  })
}

// GET /passages — all lines (CG page), optional status/unit filters; requires scoutYear.
export function useAllPassages(scoutYear: string, status?: string, unitId?: string) {
  return useQuery({
    queryKey: ['passages', 'all', scoutYear, status, unitId],
    queryFn: () => apiClient.get<PassageDto[]>('/passages', { params: { scoutYear, status, unitId } }).then(r => r.data),
    enabled: !!scoutYear,
  })
}

// GET /passages/summary — CG completeness view (expected vs missing lines per unit + overall).
export function usePassageSummary(scoutYear: string) {
  return useQuery({
    queryKey: ['passages', 'summary', scoutYear],
    queryFn: () => apiClient.get<PassageSummaryDto>(`/passages/summary`, { params: { scoutYear } }).then(r => r.data),
    enabled: !!scoutYear,
  })
}

// GET /passages/projection — CG "next year" preview (raw movement + unit meta; client computes both modes).
export function usePassageProjection(scoutYear: string, enabled = true) {
  return useQuery({
    queryKey: ['passages', 'projection', scoutYear],
    queryFn: () => apiClient.get<PassageProjectionDto>('/passages/projection', { params: { scoutYear } }).then(r => r.data),
    enabled: !!scoutYear && enabled,
  })
}

// GET /passages/status — whether the passage process is open for the year (CG toggle state).
export function usePassageStatus(scoutYear: string) {
  return useQuery({
    queryKey: ['passages', 'status', scoutYear],
    queryFn: () => apiClient.get<PassageStatusDto>(`/passages/status`, { params: { scoutYear } }).then(r => r.data),
  })
}

// POST /passages — CU proposes one member's change (isLeaving = quitte le groupe). "No change" auto-approves.
export function useProposePassage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { memberId: string; scoutYear: string; proposedUnitId: string; proposedTeamId?: string | null; proposedRoleId: string; cuNotes?: string | null; isLeaving?: boolean }) =>
      apiClient.post('/passages', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passages'] }),
  })
}

// POST /passages/bulk — same proposal for many members; returns { count }.
export function useBulkProposePassage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { memberIds: string[]; scoutYear: string; proposedUnitId: string; proposedTeamId?: string | null; proposedRoleId: string; cuNotes?: string | null }) =>
      apiClient.post<{ count: number }>('/passages/bulk', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passages'] }),
  })
}

// PUT /passages/{id}/review — CG accepts a line or changes it (unit/team/role or leaving) with an optional reason.
export function useReviewPassage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { id: string; status: 'Approved'; finalUnitId?: string | null; finalTeamId?: string | null; finalRoleId?: string | null; cgNotes?: string | null; finalIsLeaving?: boolean | null }) =>
      apiClient.put(`/passages/${data.id}/review`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passages'] }),
  })
}

// POST /passages/bulk-review — accept many lines as proposed; returns { count }.
export function useBulkReviewPassage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { passageIds: string[]; status: string; cgNotes?: string | null }) =>
      apiClient.post<{ count: number }>('/passages/bulk-review', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passages'] }),
  })
}

// POST /passages/finalize — CG posts the whole group's passage (pending lines are accepted automatically;
// ends old + creates new assignments); returns { count }. Blocked until every member has a line and every
// unit is finished. Also invalidates ['members'].
export function useFinalizePassages() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { scoutYear: string }) =>
      apiClient.post<{ count: number }>('/passages/finalize', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['passages'] })
      qc.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

// POST /passages/toggle — CG opens/closes the passage process for the year.
export function useTogglePassage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { enabled: boolean; scoutYear: string }) =>
      apiClient.post('/passages/toggle', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passages'] }),
  })
}

// DELETE /passages/{id} — remove a passage line.
export function useDeletePassage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/passages/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passages'] }),
  })
}

// GET /passages/unit/{unitId}/status — is the unit's passage finished (locked for the CU)?
export function usePassageUnitStatus(unitId: string, scoutYear: string) {
  return useQuery({
    queryKey: ['passages', 'unit-status', unitId, scoutYear],
    queryFn: () => apiClient.get<PassageUnitStatus>(`/passages/unit/${unitId}/status`, { params: { scoutYear } }).then(r => r.data),
    enabled: !!unitId && !!scoutYear,
  })
}

// POST /passages/unit/{unitId}/submit — CU (or CG) finishes the unit: it is then locked for the CU.
export function useSubmitPassageUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { unitId: string; scoutYear: string }) =>
      apiClient.post(`/passages/unit/${data.unitId}/submit`, { scoutYear: data.scoutYear }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passages'] }),
  })
}

// POST /passages/unit/{unitId}/reopen — CG reopens a finished unit so its CU can change it again.
export function useReopenPassageUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { unitId: string; scoutYear: string }) =>
      apiClient.post(`/passages/unit/${data.unitId}/reopen`, { scoutYear: data.scoutYear }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passages'] }),
  })
}

// GET /passages/newcomers — associations that received newcomers in the posted passage.
export function usePassageNewcomerGroups(scoutYear: string, enabled = true) {
  return useQuery({
    queryKey: ['passages', 'newcomers', scoutYear],
    queryFn: () => apiClient.get<PassageNewcomerGroup[]>('/passages/newcomers', { params: { scoutYear } }).then(r => r.data),
    enabled: !!scoutYear && enabled,
  })
}

// GET /passages/newcomers/docx — Word list of one association's newcomers ("Passe à la … :" + names).
export async function downloadPassageNewcomersDoc(scoutYear: string, associationId: string | null) {
  const res = await apiClient.get<Blob>('/passages/newcomers/docx', {
    params: { scoutYear, associationId: associationId ?? undefined },
    responseType: 'blob',
  })
  return { blob: res.data, fileName: filenameFromDisposition(res.headers['content-disposition']) ?? `Passage ${scoutYear}.docx` }
}
