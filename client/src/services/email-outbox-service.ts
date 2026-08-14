// Admin "Emails — file d'attente / échecs": read + operate on the durable email outbox (GET/POST/DELETE
// /email/outbox). Gated server-side by associations.manage. Lets an admin SEE that delivery is broken (the
// sender only logs a Warning on give-up) and requeue failed mail — critical at go-live when SMTP is freshly
// turned on. Queries key on ['email-outbox', ...].
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface OutboxEmail {
  id: string
  templateCode: string
  toEmail: string
  status: 'Pending' | 'Sent' | 'Failed'
  attempts: number
  lastError: string | null
  createdAt: string
  sentAt: string | null
  nextAttemptAt: string
}
export interface OutboxSummary {
  pending: number
  failed: number
  sent: number
}
export interface OutboxList {
  items: OutboxEmail[]
  total: number
  page: number
  pageSize: number
  summary: OutboxSummary
}

// status: '' | 'pending' | 'failed' | 'sent'
export function useOutboxEmails(status: string, search: string, page: number, pageSize = 50) {
  return useQuery({
    queryKey: ['email-outbox', status, search, page, pageSize],
    queryFn: () =>
      apiClient
        .get<OutboxList>('/email/outbox', { params: { status: status || undefined, search: search || undefined, page, pageSize } })
        .then((r) => r.data),
    staleTime: 5_000,
  })
}

export function useRetryOutboxEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/email/outbox/${id}/retry`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-outbox'] }),
  })
}

export function useRetryFailedOutboxEmails() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post<{ count: number }>('/email/outbox/retry-failed').then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-outbox'] }),
  })
}

export function useDeleteOutboxEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/email/outbox/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-outbox'] }),
  })
}

export function usePurgeSentOutboxEmails() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.delete<{ count: number }>('/email/outbox/sent').then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-outbox'] }),
  })
}
