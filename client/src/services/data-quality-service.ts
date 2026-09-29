// "Qualité des données" (CG): what needs fixing in the member data + email bounces. Keyed ['data-quality'].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface DataQualityItem {
  memberId: string | null
  name: string
  unit: string | null
  detail: string
  bounceId: string | null
  posts?: { assignmentId: string; label: string; isMaitrise: boolean }[] | null // several-posts check
  ackBy?: string | null   // "C'est voulu" confirmed by …
  ackAt?: string | null
}

export interface DataQualitySection {
  key: 'bad-email' | 'bounced-email' | 'no-email' | 'no-dob' | 'no-gender' | 'duplicates' | string
  title: string
  hint: string
  total: number
  items: DataQualityItem[]
  confirmed?: DataQualityItem[] | null // cases confirmed as intended ("C'est voulu")
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

// POST /data-quality/acks → "C'est voulu": hide a flagged case while it stays the same (e.g. several posts on purpose).
export function useAcknowledgeDataQuality() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: { checkKey: string; memberId: string }) => apiClient.post('/data-quality/acks', d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['data-quality'] }),
  })
}

// DELETE /data-quality/acks/{key}/{memberId} → undo a "C'est voulu" (the case is listed again).
export function useRemoveDataQualityAck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: { checkKey: string; memberId: string }) => apiClient.delete(`/data-quality/acks/${d.checkKey}/${d.memberId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['data-quality'] }),
  })
}
