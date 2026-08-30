import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// Réunions / absences. A réunion is a unit-wide OR team-scoped meeting/outing/camp; attendance is an absentee
// list (present by default). A CU (attendance.manage + unit) manages everything in their units; a chef d'équipe
// (a member holding an IsTeamLeader role on a team) creates a PENDING réunion for their team and fills it.
// Queries key on ['meetings', ...].

export const MEETING_TYPES = ['Reunion', 'Sortie', 'Camp'] as const
export type MeetingType = (typeof MEETING_TYPES)[number]
// French labels for the réunion types (Reunion=réunion, Sortie=sortie/outing, Camp=camp w/ date range).
export const MEETING_TYPE_LABELS: Record<string, string> = { Reunion: 'Réunion', Sortie: 'Sortie', Camp: 'Camp' }
export const MEETING_STATUS_LABELS: Record<string, string> = { Approved: 'Approuvée', Pending: 'En attente' }

export interface MeetingDto {
  id: string
  unitId: string
  unitName: string
  teamId: string | null
  teamName: string | null
  type: string
  title: string | null
  date: string // ISO date (yyyy-MM-dd)
  endDate: string | null // camps only
  status: string // Approved | Pending
  rosterCount: number
  absentCount: number
  canManage: boolean // the caller can approve/delete (CU/CG) vs. only fill (chef d'équipe)
  memberGroupId: string | null // set for a member-group réunion (Grande Maîtrise, Chefs d'unité, …)
  groupName: string | null
}

// The caller's manageable units + led teams + usable member groups — drives what to create/fill réunions for.
export interface AttendanceScopeDto {
  units: { unitId: string; unitName: string }[]
  teams: { teamId: string; teamName: string; unitId: string; unitName: string }[]
  groups: { id: string; name: string }[]
}

export interface AttendanceRosterRow {
  memberId: string
  name: string
  teamName: string | null
  absent: boolean
  reason: string | null
}

export interface MeetingAttendanceDto {
  id: string
  unitId: string
  unitName: string
  teamId: string | null
  teamName: string | null
  type: string
  title: string | null
  date: string
  endDate: string | null
  status: string
  canManage: boolean
  roster: AttendanceRosterRow[]
  memberGroupId: string | null
  groupName: string | null
}

export interface MemberAbsenceCount {
  memberId: string
  count: number
}

// GET /meetings/scope → the caller's manageable units + led teams. Drives the page (create/fill scope).
export function useAttendanceScope() {
  return useQuery({
    queryKey: ['meetings', 'scope'],
    queryFn: () => apiClient.get<AttendanceScopeDto>('/meetings/scope').then(r => r.data),
  })
}

// GET /meetings?unitId|memberGroupId&scoutYear → réunions for a unit (CU: all; chef d'équipe: their team's only)
// OR a member group, optionally filtered to a scout year. Disabled until a unit or group is given.
export function useMeetings(unitId: string | undefined, scoutYear?: string, memberGroupId?: string) {
  return useQuery({
    queryKey: ['meetings', 'list', unitId, scoutYear, memberGroupId],
    queryFn: () => apiClient.get<MeetingDto[]>('/meetings', { params: { unitId, scoutYear, memberGroupId } }).then(r => r.data),
    enabled: !!unitId || !!memberGroupId,
  })
}

// GET /meetings/{id}/attendance → roster + current absentees for one réunion. Disabled until id.
export function useMeetingAttendance(id: string | undefined) {
  return useQuery({
    queryKey: ['meetings', 'attendance', id],
    queryFn: () => apiClient.get<MeetingAttendanceDto>(`/meetings/${id}/attendance`).then(r => r.data),
    enabled: !!id,
  })
}

// GET /meetings/absence-counts?unitId&scoutYear → per-member absence counts for a unit's roster/list.
export function useUnitAbsenceCounts(unitId: string | undefined, scoutYear: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['meetings', 'absence-counts', unitId, scoutYear],
    queryFn: () => apiClient.get<MemberAbsenceCount[]>('/meetings/absence-counts', { params: { unitId, scoutYear } }).then(r => r.data),
    enabled: enabled && !!unitId,
  })
}

// POST /meetings → create a réunion (CU: approved; chef d'équipe for their team: pending). Invalidates ['meetings'].
export function useCreateMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { unitId?: string; memberGroupId?: string; teamId: string | null; type: string; title: string | null; date: string; endDate: string | null; notes: string | null }) =>
      apiClient.post<{ id: string }>('/meetings', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meetings'] }),
  })
}

// PUT /meetings/{id} → CU/CG edits a réunion's details (type/title/date/range/scope). Invalidates ['meetings'].
export function useUpdateMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; teamId: string | null; type: string; title: string | null; date: string; endDate: string | null; notes: string | null }) =>
      apiClient.put(`/meetings/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meetings'] }),
  })
}

// POST /meetings/{id}/approve → CU approves a pending (chef-d'équipe-created) réunion. Invalidates ['meetings'].
export function useApproveMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/meetings/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meetings'] }),
  })
}

// DELETE /meetings/{id} → delete a réunion (CU, or the creator while pending). Invalidates ['meetings'].
export function useDeleteMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/meetings/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meetings'] }),
  })
}

// PUT /meetings/{id}/attendance → replace the absentee list (present = not in the list). Invalidates ['meetings'].
export function useSaveMeetingAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ meetingId, absences }: { meetingId: string; absences: { memberId: string; reason: string | null }[] }) =>
      apiClient.put(`/meetings/${meetingId}/attendance`, { meetingId, absences }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meetings'] }),
  })
}
