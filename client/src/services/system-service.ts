// Système page (super-admin) + configuration checks. Keyed ['system', ...].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface JobStatus {
  key: string
  label: string
  expectedIntervalMinutes: number
  lastRunAt: string | null
  lastSuccessAt: string | null
  lastErrorAt: string | null
  lastError: string | null
  consecutiveFailures: number
  stale: boolean
  failing: boolean
}

export interface OutboxFailure { at: string; what: string; to: string; error: string | null }
export interface OutboxStats {
  pending: number
  stuck: number
  failedLast24h: number
  sentLast24h: number
  lastSentAt: string | null
  recentFailures: OutboxFailure[]
}

export interface DiskStats { drive: string; totalBytes: number; freeBytes: number; freePercent: number; uploadsBytes: number; low: boolean }
export interface SlowRouteStat { method: string; route: string; count: number; maxMs: number; avgMs: number; lastAt: string; roles: string }
export interface SlowRequestEntry { at: string; method: string; route: string; statusCode: number; elapsedMs: number; role: string }

// A configuration problem. tab = the Paramètres tab to open (category key or "cfg:email-templates").
export interface ConfigIssue { severity: 'error' | 'warning'; message: string; tab: string | null; keys: string[] }

export interface SystemStatus {
  serverStartedAt: string
  environment: string
  jobs: JobStatus[]
  email: OutboxStats
  push: OutboxStats
  disk: DiskStats | null
  slowThresholdMs: number
  slowRoutes: SlowRouteStat[]
  recentSlow: SlowRequestEntry[]
  configIssues: ConfigIssue[]
  problems: string[]
}

export interface OrphanFile { folder: string; name: string; sizeBytes: number; modifiedAt: string }
export interface OrphanFileReport { scannedFiles: number; count: number; totalBytes: number; files: OrphanFile[] }

// GET /system/status — refreshed every minute while the page is open.
export function useSystemStatus() {
  return useQuery({
    queryKey: ['system', 'status'],
    queryFn: () => apiClient.get<SystemStatus>('/system/status').then((r) => r.data),
    refetchInterval: 60_000,
  })
}

// GET /system/settings-check — Paramètres banner (issues of the categories the caller can edit).
export function useSettingsCheck(enabled = true) {
  return useQuery({
    queryKey: ['settings', 'check'], // under ['settings'] so saving a setting re-runs it
    queryFn: () => apiClient.get<ConfigIssue[]>('/system/settings-check').then((r) => r.data),
    enabled,
  })
}

// GET /system/email-templates-check — email templates tab banner (admins).
export function useEmailTemplateCheck(enabled = true) {
  return useQuery({
    queryKey: ['email-templates', 'check'], // under ['email-templates'] so saving a template re-runs it
    queryFn: () => apiClient.get<ConfigIssue[]>('/system/email-templates-check').then((r) => r.data),
    enabled,
  })
}

// GET /system/orphan-files — only on demand (it scans the uploads folders).
export function useOrphanFiles(enabled: boolean) {
  return useQuery({
    queryKey: ['system', 'orphan-files'],
    queryFn: () => apiClient.get<OrphanFileReport>('/system/orphan-files').then((r) => r.data),
    enabled,
    staleTime: 0,
  })
}

export function useDeleteOrphanFiles() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.delete<{ deleted: number; freedBytes: number }>('/system/orphan-files').then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system'] }),
  })
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} Ko`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} Mo`
  return `${(n / 1024 ** 3).toFixed(1)} Go`
}
