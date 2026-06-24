import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface RentreeTask {
  id: string
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
  dueDate: string | null
  status: string
  completedByName: string | null
  completedAt: string | null
  dependsOnTaskIds: string[]
  isBlocked: boolean
  blockedByTitles: string[]
  isMine: boolean
  isOverdue: boolean
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
  dependsOnTemplateIds: string[]
}

export function useRentreeYears() {
  return useQuery({ queryKey: ['rentree', 'years'], queryFn: () => apiClient.get<string[]>('/rentree/years').then(r => r.data) })
}

export function useRentreeTasks(scoutYear: string | undefined, mineOnly = false) {
  return useQuery({
    queryKey: ['rentree', 'tasks', scoutYear, mineOnly],
    queryFn: () => apiClient.get<RentreeTask[]>('/rentree/tasks', { params: { scoutYear, mineOnly } }).then(r => r.data),
    enabled: !!scoutYear,
  })
}

export function useMyOverdueRentree() {
  return useQuery({ queryKey: ['rentree', 'my-overdue'], queryFn: () => apiClient.get<RentreeTask[]>('/rentree/my-overdue').then(r => r.data) })
}

export function useCompleteRentreeTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => apiClient.post(`/rentree/tasks/${id}/complete`, { done }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rentree'] }),
  })
}

export function useGenerateRentree() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scoutYear, overwrite }: { scoutYear: string; overwrite: boolean }) =>
      apiClient.post<{ created: number }>('/rentree/generate', { scoutYear, overwrite }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rentree'] }),
  })
}

export function useUpdateRentreeTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { id: string; title: string; description: string | null; deadlineLabel: string | null; dueDate: string | null; assigneeMemberIds: string[] }) =>
      apiClient.put(`/rentree/tasks/${data.id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rentree'] }),
  })
}

export function useDeleteRentreeTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/rentree/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rentree'] }),
  })
}

// ── Templates ──
export function useRentreeTemplates() {
  return useQuery({ queryKey: ['rentree', 'templates'], queryFn: () => apiClient.get<RentreeTemplate[]>('/rentree/templates').then(r => r.data) })
}

export function useSaveRentreeTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      id: string | null; title: string; description: string | null; phase: string
      assigneeType: string; assigneeRole: string | null; fanOutPerUnit: boolean
      assigneeMemberIds: string[]; defaultDeadlineLabel: string | null; dependsOnTemplateIds: string[]
    }) => apiClient.post('/rentree/templates', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rentree'] }),
  })
}

export function useDeleteRentreeTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/rentree/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rentree'] }),
  })
}

export function useReorderRentreeTemplates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) => apiClient.put('/rentree/templates/reorder', { orderedIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rentree'] }),
  })
}
