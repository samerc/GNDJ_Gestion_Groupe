import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import publicApi from '@/lib/public-api-client'

// ===== Admin =====
export interface PageAdmin { id: string; title: string; slug: string; isPublished: boolean; showInMenu: boolean; displayOrder: number; parentId: string | null }
export interface PageEdit { id: string; title: string; bodyHtml: string; isPublished: boolean; showInMenu: boolean; parentId: string | null }
export interface PageFormData { title: string; bodyHtml: string; isPublished: boolean; showInMenu: boolean; parentId: string | null }

export function usePagesAdmin() {
  return useQuery({ queryKey: ['pages', 'admin'], queryFn: async () => (await apiClient.get<PageAdmin[]>('/pages')).data })
}
export function usePage(id: string | null) {
  return useQuery({ queryKey: ['pages', 'admin', id], queryFn: async () => (await apiClient.get<PageEdit>(`/pages/${id}`)).data, enabled: !!id })
}
export function useCreatePage() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (d: PageFormData) => apiClient.post('/pages', d), onSuccess: () => qc.invalidateQueries({ queryKey: ['pages'] }) })
}
export function useUpdatePage() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, ...d }: PageFormData & { id: string }) => apiClient.put(`/pages/${id}`, { id, ...d }), onSuccess: () => qc.invalidateQueries({ queryKey: ['pages'] }) })
}
export function useDeletePage() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => apiClient.delete(`/pages/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['pages'] }) })
}
export function useReorderPages() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { parentId: string | null; orderedIds: string[] }) => apiClient.put('/pages/reorder', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pages'] }),
  })
}

// ===== Public =====
export interface PublicPageNav { slug: string; title: string; children: PublicPageNav[] }
export interface PublicPage { slug: string; title: string; bodyHtml: string }

export function usePublicPages() {
  return useQuery({ queryKey: ['public', 'pages'], queryFn: async () => (await publicApi.get<PublicPageNav[]>('/public/pages')).data, staleTime: 60_000 })
}
export function usePublicPage(slug: string | undefined) {
  return useQuery({
    queryKey: ['public', 'page', slug],
    queryFn: async () => (await publicApi.get<PublicPage>(`/public/pages/${slug}`)).data,
    enabled: !!slug,
  })
}
