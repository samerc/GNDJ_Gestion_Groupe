// Events (Agenda) CMS resource. Admin reads/writes via authenticated apiClient (key ['events']);
// public reads the upcoming agenda via publicApi (no auth, key ['public','events']).
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import publicApi from '@/lib/public-api-client'
import type { PaginatedResult } from '@/types/api'

// ===== Admin =====
export interface EventAdmin {
  id: string
  title: string
  slug: string
  startDate: string        // ISO date (yyyy-MM-dd)
  endDate: string | null
  isPublished: boolean
  tagLabel: string
}

export interface EventEdit {
  id: string
  title: string
  bodyHtml: string
  startDate: string
  endDate: string | null
  timeLabel: string | null
  location: string | null
  isPublished: boolean
  tagType: string
  tagUnitTypeId: string | null
  tagUnitId: string | null
  coverImagePath: string | null
}

export interface EventFormData {
  title: string
  bodyHtml: string
  startDate: string        // yyyy-MM-dd
  endDate: string | null
  timeLabel: string | null // free-text time ("14h00", "toute la journée")
  location: string | null
  isPublished: boolean
  tagType: string          // Group | UnitType | Unit
  tagUnitTypeId: string | null
  tagUnitId: string | null
  coverImagePath: string | null
}

// GET /events → all events (published + drafts) for the admin list.
export function useEventsAdmin() {
  return useQuery({ queryKey: ['events', 'admin'], queryFn: async () => (await apiClient.get<EventAdmin[]>('/events')).data })
}
// GET /events/{id} → editable event; disabled until id set.
export function useEvent(id: string | null) {
  return useQuery({ queryKey: ['events', 'admin', id], queryFn: async () => (await apiClient.get<EventEdit>(`/events/${id}`)).data, enabled: !!id })
}
export function useCreateEvent() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (data: EventFormData) => apiClient.post('/events', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }) })
}
export function useUpdateEvent() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, ...data }: EventFormData & { id: string }) => apiClient.put(`/events/${id}`, { id, ...data }), onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }) })
}
export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => apiClient.delete(`/events/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }) })
}

// ===== Public =====
export interface PublicEventItem {
  slug: string
  title: string
  excerpt: string | null
  startDate: string
  endDate: string | null
  timeLabel: string | null
  location: string | null
  tagLabel: string
  coverImagePath: string | null
}
export interface PublicEventDetail {
  slug: string
  title: string
  bodyHtml: string
  startDate: string
  endDate: string | null
  timeLabel: string | null
  location: string | null
  tagLabel: string
  coverImagePath: string | null
}

// Public agenda tag filter: all (default) | only group-wide events | a specific branch (unit type).
export type EventFilter = { groupOnly?: boolean; unitTypeId?: string | null }

// GET /public/events (anonymous) → paginated UPCOMING published events (soonest first), optionally filtered.
export function usePublicEvents(page = 1, pageSize = 24, filter: EventFilter = {}) {
  return useQuery({
    queryKey: ['public', 'events', page, pageSize, filter.groupOnly ?? false, filter.unitTypeId ?? null],
    queryFn: async () => (await publicApi.get<PaginatedResult<PublicEventItem>>('/public/events', {
      params: { page, pageSize, groupOnly: filter.groupOnly || undefined, unitTypeId: filter.unitTypeId || undefined },
    })).data,
  })
}
// GET /public/events/{slug} (anonymous) → single published event; disabled until slug set.
export function usePublicEvent(slug: string | undefined) {
  return useQuery({
    queryKey: ['public', 'events', 'detail', slug],
    queryFn: async () => (await publicApi.get<PublicEventDetail>(`/public/events/${slug}`)).data,
    enabled: !!slug,
  })
}
