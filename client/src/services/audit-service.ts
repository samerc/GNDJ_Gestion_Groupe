// Audit log resource: read-only viewer of mutation history (audit.view = CG/admin). Queries key on ['audit-logs', ...].
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { saveBlob, filenameFromDisposition } from '@/lib/download'
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

export interface AuditUserOption { id: string; email: string }
export interface AuditFilterOptionsDto {
  entityTypes: string[]
  actions: string[]
  users: AuditUserOption[]
}

export interface AuditFilters {
  entityType?: string; action?: string; userId?: string
  from?: string; to?: string; search?: string
}

// GET /audit-logs — paginated, filterable by entity/action/user/date. Keyed ['audit-logs', params].
export function useAuditLogs(params: AuditFilters & { page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => apiClient.get<PaginatedResult<AuditLogDto>>('/audit-logs', { params }).then(r => r.data),
  })
}

// GET /audit-logs/member/{id} — the audit trail related to one member (subject or actor). Powers the fiche Journal tab.
export function useMemberAuditLogs(memberId: string | undefined, page: number, enabled = true) {
  return useQuery({
    queryKey: ['audit-logs', 'member', memberId, page],
    queryFn: () => apiClient.get<PaginatedResult<AuditLogDto>>(`/audit-logs/member/${memberId}`, { params: { page, pageSize: 30 } }).then(r => r.data),
    enabled: enabled && !!memberId,
  })
}

// GET /audit-logs/filters — distinct entity types, actions + users to populate the filter dropdowns.
export function useAuditFilterOptions() {
  return useQuery({
    queryKey: ['audit-logs', 'filters'],
    queryFn: () => apiClient.get<AuditFilterOptionsDto>('/audit-logs/filters').then(r => r.data),
  })
}

// GET /audit-logs/export — download the current (filtered) trail as a CSV file.
export function useExportAuditLogs() {
  return useMutation({
    mutationFn: async (filters: AuditFilters) => {
      const res = await apiClient.get('/audit-logs/export', { params: filters, responseType: 'blob' })
      const name = filenameFromDisposition(res.headers['content-disposition']) ?? 'journal-audit.csv'
      saveBlob(res.data as BlobPart, name, 'text/csv')
    },
  })
}

// DELETE /audit-logs — clear the audit trail (super-admin only, enforced server-side). Optional `before` keeps
// newer entries. Returns a CSV BACKUP of the deleted rows (auto-downloaded) + the deleted count (X-Deleted-Count).
export function useClearAuditLogs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (before?: string) => {
      const res = await apiClient.delete('/audit-logs', { params: { before }, responseType: 'blob' })
      const name = filenameFromDisposition(res.headers['content-disposition']) ?? 'journal-audit-supprime.csv'
      saveBlob(res.data as BlobPart, name, 'text/csv')
      const deleted = parseInt(res.headers['x-deleted-count'] ?? '0', 10) || 0
      return { deleted }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-logs'] }),
  })
}
