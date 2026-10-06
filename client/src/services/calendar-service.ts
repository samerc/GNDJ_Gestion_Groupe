// Group calendar (« Calendrier »): the viewer's items for a period (events + réunions + important dates), what they
// may create, the event CRUD, cancelling one date of a repeating event, and the personal phone-calendar link.
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export type CalendarAudience = 'Group' | 'Branch' | 'Unit' | 'Maitrise' | 'CgTeam'
export type CalendarRecurrence = 'None' | 'Weekly' | 'Monthly'
export type CalendarItemKind = 'event' | 'meeting' | 'date'

export interface CalendarItem {
  id: string
  kind: CalendarItemKind
  eventId: string | null
  meetingId: string | null
  title: string
  description: string | null
  location: string | null
  date: string            // yyyy-MM-dd (this occurrence)
  endDate: string | null  // last day of a multi-day item
  startTime: string | null // HH:mm:ss
  endTime: string | null
  audience: CalendarAudience
  audienceLabel: string
  unitId: string | null
  unitCode: string | null
  recurring: boolean
  canEdit: boolean
  meetingType: string | null
}

export interface CalendarOption { id: string; name: string; code: string | null }
export interface CalendarOptions { audiences: CalendarAudience[]; units: CalendarOption[]; unitTypes: CalendarOption[]; canSeeAllUnits: boolean }

export interface CalendarEventInput {
  title: string
  description: string | null
  location: string | null
  startDate: string
  endDate: string | null
  startTime: string | null
  endTime: string | null
  audience: CalendarAudience
  unitTypeId: string | null
  unitId: string | null
  recurrence: CalendarRecurrence
  recurrenceInterval: number
  recurrenceUntil: string | null
  reminderMinutes: number | null
  publishOnSite: boolean
}

export interface CalendarEventDetail extends CalendarEventInput {
  id: string
  exceptionDates: string[]
  canEdit: boolean
}

export const AUDIENCE_LABELS: Record<CalendarAudience, string> = {
  Group: 'Tout le groupe',
  Branch: 'Une branche',
  Unit: 'Une unité',
  Maitrise: 'La maîtrise',
  CgTeam: 'Équipe du Chef de Groupe',
}

export function useCalendar(from: string, to: string, unitId: string | null) {
  return useQuery({
    queryKey: ['calendar', from, to, unitId],
    queryFn: () => apiClient.get<CalendarItem[]>('/calendar', { params: { from, to, unitId: unitId ?? undefined } }).then((r) => r.data),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

export function useCalendarOptions() {
  return useQuery({
    queryKey: ['calendar', 'options'],
    queryFn: () => apiClient.get<CalendarOptions>('/calendar/options').then((r) => r.data),
    staleTime: 5 * 60_000,
  })
}

export function useCalendarEvent(id: string | null) {
  return useQuery({
    queryKey: ['calendar', 'event', id],
    queryFn: () => apiClient.get<CalendarEventDetail>(`/calendar/events/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

function useCalendarMutation<T>(fn: (v: T) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }) })
}

export const useCreateCalendarEvent = () =>
  useCalendarMutation((data: CalendarEventInput) => apiClient.post<{ id: string }>('/calendar/events', data).then((r) => r.data))
export const useUpdateCalendarEvent = () =>
  useCalendarMutation(({ id, data }: { id: string; data: CalendarEventInput }) => apiClient.put(`/calendar/events/${id}`, data))
export const useDeleteCalendarEvent = () =>
  useCalendarMutation((id: string) => apiClient.delete(`/calendar/events/${id}`))
export const useCancelCalendarDate = () =>
  useCalendarMutation(({ id, date, restore = false }: { id: string; date: string; restore?: boolean }) =>
    apiClient.post(`/calendar/events/${id}/cancel-date`, { date, restore }))
// « Modifier cette date seulement »: one occurrence of a repeating event gets its own details.
export const useEditCalendarDate = () =>
  useCalendarMutation(({ id, date, data }: { id: string; date: string; data: CalendarEventInput }) =>
    apiClient.post<{ id: string }>(`/calendar/events/${id}/edit-date`, { date, data }).then((r) => r.data))

// The personal phone-calendar link (token → full URL built here). Asking for it is idempotent (created the first
// time), so it's a query; « Nouveau lien » is a mutation that replaces it (the old link stops working).
const feedUrl = (token: string) => `${window.location.origin}/api/v1/calendar/feed/${token}.ics`

export function useCalendarFeedLink(enabled: boolean) {
  return useQuery({
    queryKey: ['calendar', 'feed-link'],
    queryFn: () => apiClient.post<{ token: string }>('/calendar/feed-link', { reset: false }).then((r) => feedUrl(r.data.token)),
    enabled,
    staleTime: Infinity,
  })
}

export function useResetCalendarFeedLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post<{ token: string }>('/calendar/feed-link', { reset: true }).then((r) => feedUrl(r.data.token)),
    onSuccess: (url) => qc.setQueryData(['calendar', 'feed-link'], url),
  })
}
