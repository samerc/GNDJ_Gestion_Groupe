import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// Rentrée resource: scout-year startup checklist (per-year tasks generated from templates). Queries key on ['rentree', ...].

export interface RentreeTask {
  id: string
  templateId: string | null
  scoutYear: string
  title: string
  description: string | null
  phase: string
  displayOrder: number
  assigneeType: string
  assigneeRole: string | null
  unitId: string | null
  unitName: string | null
  assigneeMemberIds: string[]
  assigneeNames: string[]
  deadlineLabel: string | null
  dueDate: string | null // EFFECTIVE due date (anchor-resolved on the server), drives overdue + the chip
  deadlineAnchor: string | null
  status: string
  completedByName: string | null
  completedAt: string | null
  dependsOnTaskIds: string[]
  isBlocked: boolean
  blockedByTitles: string[]
  isMine: boolean
  isOverdue: boolean
  actionKey: string | null
  // Live progress signal (module state): a task auto-satisfies when progressComplete. isDone = effective done
  // (manually completed OR progress complete) — use it, not status, to render "done".
  progressKey: string | null
  progressLabel: string | null
  progressCurrent: number | null
  progressTotal: number | null
  progressComplete: boolean
  isDone: boolean
}

export interface RentreeTemplate {
  id: string
  title: string
  description: string | null
  phase: string
  displayOrder: number
  assigneeType: string
  assigneeRole: string | null
  fanOutPerUnit: boolean
  assigneeMemberIds: string[]
  assigneeMemberNames: string[]
  defaultDeadlineLabel: string | null
  deadlineAnchor: string | null
  progressKey: string | null
  dependsOnTemplateIds: string[]
  actionKey: string | null
}

// GET /rentree/years → scout years that have generated tasks.
export function useRentreeYears() {
  return useQuery({ queryKey: ['rentree', 'years'], queryFn: () => apiClient.get<string[]>('/rentree/years').then(r => r.data) })
}

// GET /rentree/tasks?scoutYear&mineOnly → year's tasks; non-managers are forced mine-only server-side. Disabled until scoutYear.
export function useRentreeTasks(scoutYear: string | undefined, mineOnly = false) {
  return useQuery({
    queryKey: ['rentree', 'tasks', scoutYear, mineOnly],
    queryFn: () => apiClient.get<RentreeTask[]>('/rentree/tasks', { params: { scoutYear, mineOnly } }).then(r => r.data),
    enabled: !!scoutYear,
  })
}

// GET /rentree/my-overdue → my tasks past a fixed due date (drives the login popup).
export function useMyOverdueRentree() {
  return useQuery({ queryKey: ['rentree', 'my-overdue'], queryFn: () => apiClient.get<RentreeTask[]>('/rentree/my-overdue').then(r => r.data) })
}

// POST /rentree/tasks/{id}/complete → mark done/undone (blocked while prerequisites unfinished); invalidates ['rentree'].
export function useCompleteRentreeTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => apiClient.post(`/rentree/tasks/${id}/complete`, { done }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rentree'] }),
  })
}

// POST /rentree/tasks/{id}/run-action → run a task's built-in "do" action (open inscriptions/passage) + mark it done.
export function useRunRentreeTaskAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post<{ message: string }>(`/rentree/tasks/${id}/run-action`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rentree'] })
      // "do" actions flip global state (open-demandes / open-passage): refresh the demande + passage status
      // and settings so the rest of the UI (banners, sidebar badges, pills) reflects it without a reload.
      qc.invalidateQueries({ queryKey: ['demandes'] })
      qc.invalidateQueries({ queryKey: ['passages'] })
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}

// POST /rentree/generate → build a year's tasks from the template (fans out per-unit, wires deps); overwrite replaces. Invalidates ['rentree'].
export function useGenerateRentree() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scoutYear, overwrite, addOnly }: { scoutYear: string; overwrite: boolean; addOnly?: boolean }) =>
      apiClient.post<{ created: number }>('/rentree/generate', { scoutYear, overwrite, addOnly: !!addOnly }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rentree'] }),
  })
}

// POST /rentree/tasks → CG adds a one-off task directly to a year (not in the template); invalidates ['rentree'].
export function useCreateRentreeTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      scoutYear: string; title: string; description: string | null; phase: string
      assigneeType: string; assigneeRole: string | null; fanOutPerUnit: boolean
      assigneeMemberIds: string[]; deadlineLabel: string | null; dueDate: string | null; actionKey: string | null
      deadlineAnchor: string | null; progressKey: string | null
    }) => apiClient.post<{ created: number }>('/rentree/tasks', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rentree'] }),
  })
}

// POST /rentree/refresh-assignees → re-resolve every role task's assignees for a year from the CURRENT holders
// (fixes assignees frozen at generate time, e.g. a CU confirmed after the checklist was generated). Invalidates ['rentree'].
export function useRefreshRentreeAssignees() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scoutYear: string) => apiClient.post<{ changed: number }>('/rentree/refresh-assignees', { scoutYear }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rentree'] }),
  })
}

// PUT /rentree/tasks/{id} → CG edits a task (title/desc/deadline/assignees); invalidates ['rentree'].
export function useUpdateRentreeTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { id: string; title: string; description: string | null; deadlineLabel: string | null; dueDate: string | null; assigneeMemberIds: string[]; deadlineAnchor: string | null; progressKey: string | null }) =>
      apiClient.put(`/rentree/tasks/${data.id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rentree'] }),
  })
}

// DELETE /rentree/tasks/{id} → delete a task; invalidates ['rentree'].
export function useDeleteRentreeTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/rentree/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rentree'] }),
  })
}

// ── Templates ──
// GET /rentree/templates → master task definitions (used to generate each year).
export function useRentreeTemplates() {
  return useQuery({ queryKey: ['rentree', 'templates'], queryFn: () => apiClient.get<RentreeTemplate[]>('/rentree/templates').then(r => r.data) })
}

// POST /rentree/templates → create or update a template (id null = create); invalidates ['rentree'].
export function useSaveRentreeTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      id: string | null; title: string; description: string | null; phase: string
      assigneeType: string; assigneeRole: string | null; fanOutPerUnit: boolean
      assigneeMemberIds: string[]; defaultDeadlineLabel: string | null; dependsOnTemplateIds: string[]
      actionKey: string | null; deadlineAnchor: string | null; progressKey: string | null
    }) => apiClient.post('/rentree/templates', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rentree'] }),
  })
}

// DELETE /rentree/templates/{id} → delete a template; invalidates ['rentree'].
export function useDeleteRentreeTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/rentree/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rentree'] }),
  })
}

// PUT /rentree/templates/reorder → persist new template order; invalidates ['rentree'].
export function useReorderRentreeTemplates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) => apiClient.put('/rentree/templates/reorder', { orderedIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rentree'] }),
  })
}
