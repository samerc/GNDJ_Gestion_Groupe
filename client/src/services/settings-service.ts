// Settings resource: key/value app config (categories, typed values). Hooks read the full set or a
// single key; helpers parse values (array/string) and normalize/snap free-text names (school, city)
// onto managed canonical lists. /settings/cities is CG-accessible; generic key writes are admin-only.
import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface SettingDto {
  key: string
  value: string
  category: string
  label: string
  description: string | null
  valueType: string // string, json_array, number, boolean
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.get<SettingDto[]>('/settings').then(r => r.data),
  })
}

export function useSetting(key: string) {
  return useQuery({
    queryKey: ['settings', key],
    queryFn: () => apiClient.get<SettingDto>(`/settings/${key}`).then(r => r.data),
  })
}

// Write one setting (value validated server-side against its valueType); invalidates all settings.
export function useUpdateSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiClient.put(`/settings/${key}`, { key, value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}

// ── Managed list values (schools/classes/cities/profession domains): rename cascade + archive ──
// These json_array settings hold allowed strings that member/parent records store directly (no FK), so
// editing a value needs a dedicated endpoint: rename cascades the new spelling onto every record; delete
// archives an in-use value (kept on the records, hidden from pickers) or hard-removes an unused one.
export interface ListValueItem { value: string; count: number }
export interface ListValueUsage { managed: boolean; active: ListValueItem[]; archived: ListValueItem[] }

export function useListValueUsage(key: string, enabled = true) {
  return useQuery({
    queryKey: ['list-usage', key],
    queryFn: () => apiClient.get<ListValueUsage>(`/settings/list-usage/${key}`).then(r => r.data),
    enabled,
  })
}

// CG-accessible add (member-data lists) — appends a value to a json_array setting.
export function useAddListValue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { key: string; value: string }) => apiClient.post('/settings/list-value/add', body),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['list-usage', v.key] }); qc.invalidateQueries({ queryKey: ['settings'] }) },
  })
}

export function useRenameListValue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { key: string; oldValue: string; newValue: string }) =>
      apiClient.post<{ affected: number }>('/settings/list-value/rename', body).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['list-usage', v.key] }); qc.invalidateQueries({ queryKey: ['settings'] }) },
  })
}

export function useArchiveListValue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { key: string; value: string }) =>
      apiClient.post<{ archived: boolean }>('/settings/list-value/archive', body).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['list-usage', v.key] }); qc.invalidateQueries({ queryKey: ['settings'] }) },
  })
}

export function useUnarchiveListValue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { key: string; value: string }) => apiClient.post('/settings/list-value/unarchive', body),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['list-usage', v.key] }); qc.invalidateQueries({ queryKey: ['settings'] }) },
  })
}

// Helper hook to get a setting value parsed
export function useSettingValue(key: string): string | null {
  const { data } = useSetting(key)
  return data?.value ?? null
}

export function useSettingArray(key: string): string[] {
  const { data } = useSetting(key)
  if (!data?.value) return []
  try { return JSON.parse(data.value) } catch { return [] }
}

// Normalize a name for matching (case + accent insensitive).
function normalizeSchool(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// ── Cities (managed list, member.cities) ─────────────────────────────────────
export function useCities(): string[] {
  return useSettingArray('member.cities')
}

export function useUpdateCities() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cities: string[]) => apiClient.put('/settings/cities', { cities }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}

// Snap a typed city onto the canonical list entry ignoring accents/case; new names pass through trimmed.
export function matchCity(typed: string, cities: string[]): string {
  const t = normalizeSchool(typed)
  if (!t) return typed.trim()
  return cities.find((c) => normalizeSchool(c) === t) ?? typed.trim()
}

// Snap a typed school name onto the canonical list entry when it matches ignoring accents/case
// (e.g. "college jamhour" → "Collège Notre-Dame de Jamhour"). Genuinely new names pass through
// trimmed. Keeps the "Autre…" escape hatch usable while preventing near-duplicate spellings.
export function matchSchool(typed: string, schools: string[]): string {
  const t = normalizeSchool(typed)
  if (!t) return typed.trim()
  return schools.find((s) => normalizeSchool(s) === t) ?? typed.trim()
}

// Build a short code from a school name when none is configured (initials of significant words).
function schoolAcronym(name: string): string {
  const skip = new Set(['de', 'du', 'la', 'le', 'les', 'des', 'et', "d'", 'of'])
  const code = name
    .split(/[\s-]+/)
    .filter((w) => w && !skip.has(w.toLowerCase()))
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4)
  return code || name.slice(0, 4).toUpperCase()
}

// Returns a resolver: school full name → short code (system-wide, from member.school_codes setting).
export function useSchoolCode(): (name: string | null | undefined) => string {
  const { data } = useSetting('member.school_codes')
  const map = useMemo(() => {
    const m: Record<string, string> = {}
    if (data?.value) {
      try {
        const obj = JSON.parse(data.value) as Record<string, string>
        for (const [k, v] of Object.entries(obj)) m[normalizeSchool(k)] = v
      } catch { /* ignore malformed */ }
    }
    return m
  }, [data]) // depend on the whole query result (matches the compiler's inferred dependency)
  return (name) => {
    if (!name) return ''
    return map[normalizeSchool(name)] ?? schoolAcronym(name)
  }
}
