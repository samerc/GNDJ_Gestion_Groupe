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
