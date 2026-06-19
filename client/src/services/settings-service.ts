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

export function useUpdateSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiClient.put(`/settings/${key}`, { key, value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
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

// Normalize a school name for matching (case + accent insensitive).
function normalizeSchool(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
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
  }, [data?.value])
  return (name) => {
    if (!name) return ''
    return map[normalizeSchool(name)] ?? schoolAcronym(name)
  }
}
