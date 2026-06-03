import { useQuery } from '@tanstack/react-query'
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
}

export interface AuditFilterOptionsDto {
  entityTypes: string[]
  actions: string[]
}

export function useAuditLogs(params: {
  entityType?: string; action?: string; userId?: string
  from?: string; to?: string; page?: number; pageSize?: number
}) {
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => apiClient.get<PaginatedResult<AuditLogDto>>('/audit-logs', { params }).then(r => r.data),
  })
}

export function useAuditFilterOptions() {
  return useQuery({
    queryKey: ['audit-logs', 'filters'],
    queryFn: () => apiClient.get<AuditFilterOptionsDto>('/audit-logs/filters').then(r => r.data),
  })
}
