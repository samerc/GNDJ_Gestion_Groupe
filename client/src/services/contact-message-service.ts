// Admin inbox for public contact-form messages. Managers (content.manage) list, read, reply, delete.
// Keys on ['contact-messages', ...]; every mutation invalidates the whole prefix so the list + badge refresh.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface ContactMessageDto {
  id: string
  senderName: string
  senderEmail: string
  subject: string
  message: string
  isRead: boolean
  createdAt: string
  repliedAt: string | null
  replySubject: string | null
  replyBody: string | null
  claimedByUserId: string | null
  claimedByName: string | null
  claimedAt: string | null
  // Deliverable reply address: the senderEmail for a normal address, the member's real contact email when the
  // sender typed their login username, or null when it's a username with no real email on file (can't reply).
  replyToEmail: string | null
}

export interface ContactMessageListDto {
  items: ContactMessageDto[]
  total: number
  unreadCount: number
  hasMore: boolean
}

// GET /contact-messages — paged inbox (unread first, then newest). search + unreadOnly optional.
export function useContactMessages(params: { search?: string; unreadOnly?: boolean; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['contact-messages', 'list', params],
    queryFn: () =>
      apiClient
        .get<ContactMessageListDto>('/contact-messages', {
          params: { search: params.search || undefined, unreadOnly: params.unreadOnly || undefined, page: params.page ?? 1, pageSize: params.pageSize ?? 20 },
        })
        .then((r) => r.data),
  })
}

// GET /contact-messages/unread-count — the sidebar badge. Polled so a new message shows without a reload.
export function useUnreadContactMessageCount(enabled: boolean) {
  return useQuery({
    queryKey: ['contact-messages', 'unread'],
    queryFn: () => apiClient.get<{ count: number }>('/contact-messages/unread-count').then((r) => r.data.count),
    enabled,
    refetchInterval: 60_000,
    staleTime: 55_000,
  })
}

export function useMarkContactMessageRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) =>
      apiClient.post(`/contact-messages/${id}/read`, { read }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-messages'] }),
  })
}

export function useReplyContactMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, subject, body }: { id: string; subject: string; body: string }) =>
      apiClient.post(`/contact-messages/${id}/reply`, { subject, body }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-messages'] }),
  })
}

export function useDeleteContactMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/contact-messages/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-messages'] }),
  })
}

// Claim / release a message ("En cours de traitement par X").
export function useClaimContactMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, claim }: { id: string; claim: boolean }) =>
      apiClient.post(`/contact-messages/${id}/claim`, { claim }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-messages'] }),
  })
}

// Undo a delete — restores the soft-deleted message.
export function useRestoreContactMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/contact-messages/${id}/restore`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-messages'] }),
  })
}
