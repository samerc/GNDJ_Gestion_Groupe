// News (Actualités) CMS resource. Admin reads/writes via authenticated apiClient (key ['news']);
// public reads via publicApi (no auth, key ['public','news']).
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import publicApi from '@/lib/public-api-client'
import type { PaginatedResult } from '@/types/api'

// ===== Admin =====
export interface NewsPostAdmin {
  id: string
  title: string
  slug: string
  isPublished: boolean
  publishedAt: string | null
  createdAt: string
  tagLabel: string
}

export interface NewsPostEdit {
  id: string
  title: string
  bodyHtml: string
  isPublished: boolean
  tagType: string
  tagUnitTypeId: string | null
  tagUnitId: string | null
}

export interface NewsFormData {
  title: string
  bodyHtml: string
  isPublished: boolean
  tagType: string // Group | UnitType | Unit
  tagUnitTypeId: string | null
  tagUnitId: string | null
}

// GET /news → all posts (published + drafts) for the admin list.
export function useNewsAdmin() {
  return useQuery({ queryKey: ['news', 'admin'], queryFn: async () => (await apiClient.get<NewsPostAdmin[]>('/news')).data })
}
// GET /news/{id} → editable post (body + tag); disabled until id set.
export function useNewsPost(id: string | null) {
  return useQuery({ queryKey: ['news', 'admin', id], queryFn: async () => (await apiClient.get<NewsPostEdit>(`/news/${id}`)).data, enabled: !!id })
}
// POST /news → create (slug auto-derived from title server-side); invalidates ['news'].
export function useCreateNews() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (data: NewsFormData) => apiClient.post('/news', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['news'] }) })
}
// PUT /news/{id} → update; invalidates ['news'].
export function useUpdateNews() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, ...data }: NewsFormData & { id: string }) => apiClient.put(`/news/${id}`, { id, ...data }), onSuccess: () => qc.invalidateQueries({ queryKey: ['news'] }) })
}
// DELETE /news/{id}; invalidates ['news'].
export function useDeleteNews() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => apiClient.delete(`/news/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['news'] }) })
}

// ===== Public =====
export interface PublicNewsItem {
  slug: string
  title: string
  excerpt: string | null
  publishedAt: string | null
  tagLabel: string
}
export interface PublicNewsArticle {
  slug: string
  title: string
  bodyHtml: string
  publishedAt: string | null
  tagLabel: string
}

// GET /public/news (anonymous, publicApi) → paginated published posts for the public site.
export function usePublicNews(page = 1, pageSize = 12) {
  return useQuery({
    queryKey: ['public', 'news', page, pageSize],
    queryFn: async () => (await publicApi.get<PaginatedResult<PublicNewsItem>>('/public/news', { params: { page, pageSize } })).data,
  })
}
// GET /public/news/{slug} (anonymous, publicApi) → single published article; disabled until slug set.
export function usePublicNewsArticle(slug: string | undefined) {
  return useQuery({
    queryKey: ['public', 'news', 'article', slug],
    queryFn: async () => (await publicApi.get<PublicNewsArticle>(`/public/news/${slug}`)).data,
    enabled: !!slug,
  })
}
