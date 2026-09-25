// "Qualité des données" (CG): what needs fixing in the member data + email bounces. Keyed ['data-quality'].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface DataQualityItem {
  memberId: string | null
  name: string
  unit: string | null
  detail: string
  bounceId: string | null
}

export interface DataQualitySection {
  key: 'bad-email' | 'bounced-email' | 'no-email' | 'no-dob' | 'no-gender' | 'duplicates' | string
  title: string
  hint: string
  total: number
  items: DataQualityItem[]
}

export interface DataQualityReport {
  activeMembers: number
  sections: DataQualitySection[]
}

// GET /data-quality → the report (active members only).
export function useDataQuality() {
  return useQuery({
    queryKey: ['data-quality'],
    queryFn: () => apiClient.get<DataQualityReport>('/data-quality').then((r) => r.data),
  })
}

// DELETE /data-quality/bounces/{id} → forget an email bounce (the address was fixed; mail goes out again).
export function useClearBounce() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/data-quality/bounces/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['data-quality'] }),
  })
}
