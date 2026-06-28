// Editable site texts (the site.content setting) for the admin "Textes du site" page.
// Authenticated apiClient. The public copy is served via /public/site-config (see public-service).
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { SiteContent } from './public-service'

export type { SiteContent } from './public-service'

// GET /site-content → current site texts for editing.
export function useSiteContent() {
  return useQuery({
    queryKey: ['site-content', 'admin'],
    queryFn: async () => (await apiClient.get<SiteContent>('/site-content')).data,
  })
}

// PUT /site-content → save; invalidates both the admin copy and the public ['public','site-config'] cache.
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
