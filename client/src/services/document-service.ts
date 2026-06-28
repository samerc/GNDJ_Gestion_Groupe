// Member documents resource: per-member uploads + approve/reject review, expiry tracking,
// and the unit-scoped CU documents matrix. Queries key on ['documents', ...].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface MemberDocumentDto {
  id: string
  memberId: string
  documentTypeId: string
  documentTypeName: string
  title: string
  fileName: string
  fileSize: number
  mimeType: string
  status: string
  reviewNotes: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  expiryDate: string | null
  issuedDate: string | null
  isExpired: boolean
  createdAt: string
}

export interface ExpiringDocumentDto {
  documentId: string
  memberId: string
  memberName: string
  documentTypeName: string
  title: string
  expiryDate: string
  isExpired: boolean
}

// GET /documents/member/{id} — all docs for one member. Keyed ['documents', memberId].
export function useMemberDocuments(memberId: string) {
  return useQuery({
    queryKey: ['documents', memberId],
    queryFn: () => apiClient.get<MemberDocumentDto[]>(`/documents/member/${memberId}`).then(r => r.data),
    enabled: !!memberId,
  })
}

// POST /documents/upload (multipart). Reports % via onUploadProgress; invalidates member docs + matrix.
export function useUploadDocument(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ formData, onUploadProgress }: { formData: FormData; onUploadProgress?: (pct: number) => void }) =>
      apiClient.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onUploadProgress) {
            onUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total))
          }
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', memberId] })
      qc.invalidateQueries({ queryKey: ['documents', 'matrix'] })
    },
  })
}

// PUT /documents/{id}/review — approve/reject with optional notes. Invalidates member docs + matrix.
export function useReviewDocument(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, reviewNotes }: { id: string; status: string; reviewNotes?: string }) =>
      apiClient.put(`/documents/${id}/review`, { id, status, reviewNotes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', memberId] })
      qc.invalidateQueries({ queryKey: ['documents', 'matrix'] })
    },
  })
}

// DELETE /documents/{id}. Invalidates member docs + matrix.
export function useDeleteDocument(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', memberId] })
      qc.invalidateQueries({ queryKey: ['documents', 'matrix'] })
    },
  })
}

// GET /documents/expiring — docs expiring within daysAhead (default 30), for dashboard warnings.
export function useExpiringDocuments(daysAhead = 30) {
  return useQuery({
    queryKey: ['documents', 'expiring', daysAhead],
    queryFn: () => apiClient.get<ExpiringDocumentDto[]>('/documents/expiring', { params: { daysAhead } }).then(r => r.data),
  })
}

// GET /documents/{id}/download — raw file as a blob (not a hook).
export function downloadDocument(id: string) {
  return apiClient.get(`/documents/${id}/download`, { responseType: 'blob' })
}

// Unit documents matrix (CU page)
export interface UnitDocumentsMatrixDto {
  docTypes: DocTypeColumnDto[]
  members: MemberDocRowDto[]
}

export interface DocTypeColumnDto {
  id: string
  name: string
  code: string
  requiresExpiry: boolean
  requiresApproval: boolean
}

export interface MemberDocRowDto {
  memberId: string
  firstName: string
  lastName: string
  teamName: string | null
  documents: MemberDocCellDto[]
  cotisation: MemberCotisationCellDto
}

export interface CotisationPaymentCellDto {
  amount: number
  currency: string
  paymentMethod: string
}

export interface MemberCotisationCellDto {
  cotisationId: string | null
  receiptNumber: string | null
  paymentDate: string | null
  willNotPay: boolean
  payments: CotisationPaymentCellDto[]
}

export interface MemberDocCellDto {
  docTypeId: string
  documentId: string | null
  fileName: string | null
  mimeType: string | null
  status: string | null
  reviewNotes: string | null
  expiryDate: string | null
  isExpired: boolean
  createdAt: string | null
}

// GET /documents/unit/{unitId}/matrix — members × doc-types grid + cotisation cell; requires scoutYear.
// Unit-scoped. Keyed ['documents','matrix',unitId,scoutYear].
export function useUnitDocumentsMatrix(unitId: string, scoutYear: string) {
  return useQuery({
    queryKey: ['documents', 'matrix', unitId, scoutYear],
    queryFn: () => apiClient.get<UnitDocumentsMatrixDto>(`/documents/unit/${unitId}/matrix`, { params: { scoutYear } }).then(r => r.data),
    enabled: !!unitId && !!scoutYear,
  })
}

// PUT /documents/{id}/review — quick approve/reject from the matrix; invalidates only the unit matrix.
export function useReviewDocumentMatrix(unitId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, reviewNotes }: { id: string; status: string; reviewNotes?: string }) =>
      apiClient.put(`/documents/${id}/review`, { id, status, reviewNotes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents', 'matrix', unitId] }),
  })
}

// GET /documents/unit/{unitId}/zip — all unit docs (optionally one doc type) as a blob, by member folder.
export function downloadUnitDocumentsZip(unitId: string, docTypeId?: string) {
  const params = docTypeId ? { docTypeId } : {}
  return apiClient.get(`/documents/unit/${unitId}/zip`, { params, responseType: 'blob' })
}
