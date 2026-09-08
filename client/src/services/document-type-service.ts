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
  templateFileUrl: string | null
  templateFileName: string | null
  hasHtmlTemplate: boolean // has an in-app template (member downloads a prefilled PDF)
  createdAt: string
}

// Full detail (GET /document-types/{id}) — carries the template HTML for the editor (not in the list DTO).
export interface DocumentTypeDetailDto {
  id: string
  name: string
  code: string
  description: string | null
  requiresExpiry: boolean
  requiresApproval: boolean
  isActive: boolean
  displayOrder: number
  templateFileUrl: string | null
  templateFileName: string | null
  templateHtml: string | null
  createdAt: string
  updatedAt: string
}

export interface DocumentTypeListDto {
  id: string
  name: string
  code: string
  requiresExpiry: boolean
  requiresApproval: boolean
  templateFileUrl: string | null
  templateFileName: string | null
  hasHtmlTemplate: boolean // when true the member downloads a server-generated prefilled PDF (not a static file)
}

export interface DocumentTypeFormData {
  name: string
  code: string
  description?: string | null
  requiresExpiry: boolean
  requiresApproval: boolean
  isActive: boolean
  displayOrder: number
  templateFileUrl?: string | null
  templateFileName?: string | null
  templateHtml?: string | null // in-app rich-text template (null = none)
}

// A member-field placeholder the CG can insert into an in-app template ({{key}}).
export interface DocumentTemplateField {
  key: string
  label: string
  sample: string
}

// POST /document-types/template — upload the optional blank form (PDF/Word/Excel/image) a member downloads
// to fill. Returns the served URL + original name to store on the document type.
export async function uploadDocumentTypeTemplate(file: File): Promise<{ url: string; name: string; size: number }> {
  const fd = new FormData()
  fd.append('file', file)
  const { data } = await apiClient.post<{ url: string; name: string; size: number }>('/document-types/template', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
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

// GET /document-types/{id} — full detail (incl. templateHtml) to seed the editor. Enabled only when an id is given.
export function useDocumentTypeDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['document-types', 'detail', id],
    queryFn: () => apiClient.get<DocumentTypeDetailDto>(`/document-types/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

// GET /document-types/template-fields — the member-field placeholders for the "Insérer un champ" dropdown.
export function useDocumentTemplateFields() {
  return useQuery({
    queryKey: ['document-types', 'template-fields'],
    queryFn: () => apiClient.get<DocumentTemplateField[]>('/document-types/template-fields').then(r => r.data),
    staleTime: Infinity, // static catalog
  })
}

// POST /document-types/template-preview — render the CURRENT template HTML to a PDF with sample values (CG check).
export async function previewDocumentTemplate(html: string, name?: string): Promise<Blob> {
  const { data } = await apiClient.post('/document-types/template-preview', { html, name }, { responseType: 'blob' })
  return data as Blob
}

// GET /document-types/{id}/member-pdf/{memberId} — the member's prefilled PDF (own record or a leader of the member).
export async function downloadMemberTemplatePdf(documentTypeId: string, memberId: string) {
  return apiClient.get(`/document-types/${documentTypeId}/member-pdf/${memberId}`, { responseType: 'blob' })
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

// PUT /document-types/reorder — persist a new drag order (list of ids). Invalidates the list.
export function useReorderDocumentTypes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) => apiClient.put('/document-types/reorder', { orderedIds }),
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
