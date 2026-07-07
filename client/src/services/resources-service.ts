// Heritage / knowledge library (Ressources) CMS resource. Admin reads/writes via authenticated apiClient
// (key ['resources']); public reads via publicApi (no auth, key ['public','resources']).
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import publicApi from '@/lib/public-api-client'
import type { PaginatedResult } from '@/types/api'

// The category catalog — value (stored) → French plural label (shown). Mirrors ResourceCategories on the API.
export const RESOURCE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'Chant', label: 'Chants' },
  { value: 'Technique', label: 'Techniques' },
  { value: 'Noeud', label: 'Nœuds' },
  { value: 'Badge', label: 'Badges' },
  { value: 'Biographie', label: 'Biographies' },
  { value: 'Document', label: 'Documents' },
]
export function categoryLabel(value: string): string {
  return RESOURCE_CATEGORIES.find((c) => c.value === value)?.label ?? value
}

export interface ResourceAttachment { name: string; url: string }

// ===== Admin =====
export interface ResourceAdmin { id: string; title: string; slug: string; category: string; isPublished: boolean; createdAt: string }
export interface ResourceEdit {
  id: string
  title: string
  bodyHtml: string
  category: string
  tags: string | null
  coverImagePath: string | null
  isPublished: boolean
  attachments: ResourceAttachment[]
}
export interface ResourceFormData {
  title: string
  bodyHtml: string
  category: string
  tags: string | null       // comma-separated free-text tags
  coverImagePath: string | null
  isPublished: boolean
  attachments: ResourceAttachment[] // mp3 / PDF / images
}

export function useResourcesAdmin() {
  return useQuery({ queryKey: ['resources', 'admin'], queryFn: async () => (await apiClient.get<ResourceAdmin[]>('/resources')).data })
}
export function useResource(id: string | null) {
  return useQuery({ queryKey: ['resources', 'admin', id], queryFn: async () => (await apiClient.get<ResourceEdit>(`/resources/${id}`)).data, enabled: !!id })
}
export function useCreateResource() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (data: ResourceFormData) => apiClient.post('/resources', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['resources'] }) })
}
export function useUpdateResource() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, ...data }: ResourceFormData & { id: string }) => apiClient.put(`/resources/${id}`, { id, ...data }), onSuccess: () => qc.invalidateQueries({ queryKey: ['resources'] }) })
}
export function useDeleteResource() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => apiClient.delete(`/resources/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['resources'] }) })
}

// ===== Public =====
export interface PublicResourceItem {
  slug: string
  title: string
  excerpt: string | null
  category: string
  tags: string | null
  coverImagePath: string | null
  attachmentCount: number   // 0/1 presence flag from the API (whether any attachment exists)
}
export interface PublicResourceDetail {
  slug: string
  title: string
  bodyHtml: string
  category: string
  tags: string | null
  coverImagePath: string | null
  attachments: ResourceAttachment[]
}

export type ResourceFilter = { category?: string | null; search?: string }

// GET /public/resources (anonymous) → paginated published resources, optional category + search.
export function usePublicResources(page = 1, pageSize = 24, filter: ResourceFilter = {}) {
  return useQuery({
    queryKey: ['public', 'resources', page, pageSize, filter.category ?? null, filter.search ?? ''],
    queryFn: async () => (await publicApi.get<PaginatedResult<PublicResourceItem>>('/public/resources', {
      params: { page, pageSize, category: filter.category || undefined, search: filter.search || undefined },
    })).data,
  })
}
// GET /public/resources/{slug} (anonymous) → single published resource; disabled until slug set.
export function usePublicResource(slug: string | undefined) {
  return useQuery({
    queryKey: ['public', 'resources', 'detail', slug],
    queryFn: async () => (await publicApi.get<PublicResourceDetail>(`/public/resources/${slug}`)).data,
    enabled: !!slug,
  })
}
