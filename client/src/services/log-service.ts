// Super-admin error journal: reads Serilog's application_logs (Warning+) via GET /logs. Keyed on the filters.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface ErrorLogEntry {
  timestamp: string
  level: string
  message: string
  exception: string | null
}
export interface ErrorLogPage {
  items: ErrorLogEntry[]
  total: number
}

export function useErrorLogs(level: string, search: string, page: number, pageSize = 50) {
  return useQuery({
    queryKey: ['logs', level, search, page, pageSize],
    queryFn: () =>
      apiClient
        .get<ErrorLogPage>('/logs', { params: { level: level || undefined, search: search || undefined, page, pageSize } })
        .then((r) => r.data),
    staleTime: 10_000,
  })
}

// Clear the log (super-admin). `before` (ISO) keeps newer entries; omit to wipe everything.
export function useClearErrorLogs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (before?: string) =>
      apiClient.delete<{ deleted: number }>('/logs', { params: { before: before || undefined } }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['logs'] }),
  })
}
