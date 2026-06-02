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
