// In-app notifications for the current user. The bell badge polls the unread count; the dropdown lazily
// fetches the list. Keys on ['notifications', ...]. Marking read invalidates both.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// Coarse categories — mirror the backend NotificationTypes (drive the icon/colour).
export type NotificationType = 'document' | 'change_request' | 'demande' | 'hold' | 'info'

export interface NotificationDto {
  id: string
  type: NotificationType
  title: string
  body: string | null
  linkUrl: string | null
  isRead: boolean
  createdAt: string
}

export interface NotificationListDto {
  items: NotificationDto[]
  unreadCount: number
  hasMore: boolean
}

// GET /notifications/unread-count — the bell badge. Polled so a new notification appears without a reload.
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => apiClient.get<{ count: number }>('/notifications/unread-count').then(r => r.data.count),
    refetchInterval: 60_000,
    staleTime: 55_000,
  })
}

// GET /notifications — the recent list (newest first). Fetched when the dropdown is open.
export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => apiClient.get<NotificationListDto>('/notifications', { params: { pageSize: 20 } }).then(r => r.data),
    enabled,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/notifications/${id}/read`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }) },
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post('/notifications/read-all').then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }) },
  })
}

// DELETE /notifications/{id} — remove one notification.
export function useDeleteNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/notifications/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }) },
  })
}

// DELETE /notifications/read — clear all READ notifications (tidy up).
export function useClearReadNotifications() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.delete('/notifications/read').then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }) },
  })
}

// POST /notifications/send — CG targeted send (in-app + Web Push) to members / a unit / a member group.
// Returns the recipient count.
export interface SendNotificationInput {
  memberIds?: string[]
  unitId?: string
  memberGroupId?: string
  title: string
  body?: string
  url?: string
}
export function useSendPushNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SendNotificationInput) =>
      apiClient.post<{ count: number }>('/notifications/send', input).then(r => r.data),
    // Refresh the broadcast history so a just-sent notification appears immediately.
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications', 'broadcasts'] }) },
  })
}

// GET /notifications/broadcasts — history of the manual sends above (manager-only). Newest first, paged.
export interface NotificationBroadcast {
  id: string
  sentByName: string
  sentAt: string
  title: string
  body?: string | null
  url?: string | null
  audienceLabel: string
  recipientCount: number
}
export function useNotificationBroadcasts(page: number) {
  return useQuery({
    queryKey: ['notifications', 'broadcasts', page],
    queryFn: () =>
      apiClient.get<{ items: NotificationBroadcast[]; hasMore: boolean }>(
        `/notifications/broadcasts?page=${page}&pageSize=20`).then(r => r.data),
  })
}

// Preferences — the categories the user has MUTED (hidden from the bell + unread count).
export function useNotificationPreferences(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: () => apiClient.get<{ mutedTypes: NotificationType[] }>('/notifications/preferences').then(r => r.data.mutedTypes),
    enabled,
  })
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (mutedTypes: NotificationType[]) => apiClient.put('/notifications/preferences', { mutedTypes }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }) },
  })
}
