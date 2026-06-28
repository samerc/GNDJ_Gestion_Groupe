// Document types resource: admin-managed catalogue of document kinds (code, expiry/approval flags,
// isActive). Queries key on ['document-types', ...].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { PaginatedResult } from '@/types/api'

export interface DocumentTypeDto {
  id: string
  name: string
  code: string
  description: string | null
  requiresExpiry: boolean
  requiresApproval: boolean
  isActive: boolean
  displayOrder: number
  documentCount: number
  createdAt: string
}

export interface DocumentTypeListDto {
  id: string
  name: string
  code: string
  requiresExpiry: boolean
  requiresApproval: boolean
}

export interface DocumentTypeFormData {
  name: string
  code: string
  description?: string | null
  requiresExpiry: boolean
  requiresApproval: boolean
  isActive: boolean
  displayOrder: number
}

// GET /document-types — paginated admin list (search/page). Keyed ['document-types', params].
export function useDocumentTypes(params: { search?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['document-types', params],
    queryFn: () => apiClient.get<PaginatedResult<DocumentTypeDto>>('/document-types', { params }).then(r => r.data),
  })
}

// GET /document-types/list — slim active list for pickers/matrix columns.
export function useDocumentTypeList() {
  return useQuery({
    queryKey: ['document-types', 'list'],
    queryFn: () => apiClient.get<DocumentTypeListDto[]>('/document-types/list').then(r => r.data),
  })
}

// POST /document-types. Invalidates the list.
export function useCreateDocumentType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: DocumentTypeFormData) => apiClient.post('/document-types', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['document-types'] }),
  })
}

// PUT /document-types/{id}. Invalidates the list.
export function useUpdateDocumentType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: DocumentTypeFormData & { id: string }) =>
      apiClient.put(`/document-types/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['document-types'] }),
  })
}

// DELETE /document-types/{id}. Invalidates the list.
export function useDeleteDocumentType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/document-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['document-types'] }),
  })
}
