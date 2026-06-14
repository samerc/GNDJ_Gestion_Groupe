import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { SiteContent } from './public-service'

export type { SiteContent } from './public-service'

export function useSiteContent() {
  return useQuery({
    queryKey: ['site-content', 'admin'],
    queryFn: async () => (await apiClient.get<SiteContent>('/site-content')).data,
  })
}

export function useUpdateSiteContent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: SiteContent) => apiClient.put('/site-content', { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site-content'] })
      qc.invalidateQueries({ queryKey: ['public', 'site-config'] })
    },
  })
}
