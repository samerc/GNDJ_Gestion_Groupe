// Audit log resource: read-only viewer of mutation history (super-admin). Queries key on ['audit-logs', ...].
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { PaginatedResult } from '@/types/api'

export interface AuditLogDto {
  id: string
  userId: string | null
  userEmail: string | null
  action: string
  entityType: string
  entityId: string | null
  oldValues: string | null
  newValues: string | null
  ipAddress: string | null
  timestamp: string
  userAgent: string | null // browser/device string (for troubleshooting a login)
}

export interface AuditFilterOptionsDto {
  entityTypes: string[]
  actions: string[]
}

// GET /audit-logs — paginated, filterable by entity/action/user/date. Keyed ['audit-logs', params].
export function useAuditLogs(params: {
  entityType?: string; action?: string; userId?: string
  from?: string; to?: string; page?: number; pageSize?: number
}) {
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => apiClient.get<PaginatedResult<AuditLogDto>>('/audit-logs', { params }).then(r => r.data),
  })
}

// GET /audit-logs/filters — distinct entity types + actions to populate the filter dropdowns.
export function useAuditFilterOptions() {
  return useQuery({
    queryKey: ['audit-logs', 'filters'],
    queryFn: () => apiClient.get<AuditFilterOptionsDto>('/audit-logs/filters').then(r => r.data),
  })
}

// DELETE /audit-logs — clear the audit trail (super-admin only, enforced server-side). Optional `before` keeps
// newer entries. Returns the number of rows deleted.
export function useClearAuditLogs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (before?: string) =>
      apiClient.delete<{ deleted: number }>('/audit-logs', { params: { before } }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-logs'] }),
  })
}
