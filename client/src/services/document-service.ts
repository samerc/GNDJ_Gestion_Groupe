// Member documents resource: per-member uploads + approve/reject review, expiry tracking,
// and the unit-scoped CU documents matrix. Queries key on ['documents', ...].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// One file of a document. isPrimary = page 1 (download via /documents/{docId}/download); otherwise a child
// page (download via /documents/pages/{pageId}/download).
export interface DocumentPageDto {
  pageId: string | null
  order: number
  fileName: string
  mimeType: string
  fileSize: number
  isPrimary: boolean
}

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
  pages: DocumentPageDto[]   // all files of the document (page 1 + extra pages)
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
      // A doc change also moves the member's tab counts + list "dossier complet" flag + dashboard compliance.
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
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
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
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
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// POST /documents/{id}/pages — add extra pages/files to an existing document. Invalidates member docs + matrix.
export function useAddDocumentPages(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ documentId, formData, onUploadProgress }: { documentId: string; formData: FormData; onUploadProgress?: (pct: number) => void }) =>
      apiClient.post(`/documents/${documentId}/pages`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => { if (e.total && onUploadProgress) onUploadProgress(Math.round((e.loaded * 100) / e.total)) },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', memberId] })
      qc.invalidateQueries({ queryKey: ['documents', 'matrix'] })
      qc.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

// DELETE /documents/pages/{pageId} — remove one extra page (leader). Invalidates member docs + matrix.
export function useDeleteDocumentPage(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (pageId: string) => apiClient.delete(`/documents/pages/${pageId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', memberId] })
      qc.invalidateQueries({ queryKey: ['documents', 'matrix'] })
      qc.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

// GET /documents/{id}/download (page 1) or /documents/pages/{pageId}/download (extra page) — raw blob (not a hook).
export function downloadDocument(id: string) {
  return apiClient.get(`/documents/${id}/download`, { responseType: 'blob' })
}
export function downloadDocumentPage(pageId: string) {
  return apiClient.get(`/documents/pages/${pageId}/download`, { responseType: 'blob' })
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', 'matrix', unitId] })
      // Also refresh the member list "dossier complet" flag + dashboard compliance (no memberId in scope here).
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// GET /documents/unit/{unitId}/zip — all unit docs (optionally one doc type) as a blob, by member folder.
export function downloadUnitDocumentsZip(unitId: string, docTypeId?: string) {
  const params = docTypeId ? { docTypeId } : {}
  return apiClient.get(`/documents/unit/${unitId}/zip`, { params, responseType: 'blob' })
}

// ── Relance documents (CU reminder emails) ──
// One non-compliant member + their gaps. reason: "missing" | "rejected" | "expired".
export interface DocGap { docTypeName: string; reason: string }
export interface DocReminderCandidate {
  memberId: string
  memberName: string
  teamName: string | null
  gaps: DocGap[]
  hasEmail: boolean
  contactEmail: string | null
}
export interface SendRemindersResult {
  sent: number
  noEmail: number
  compliant: number
  noAccess: number
  details: { memberId: string; memberName: string; status: string; email: string | null }[]
}

// GET /documents/unit/{unitId}/reminder-candidates — members whose dossier is incomplete + their gaps.
export function useDocumentReminderCandidates(unitId: string | undefined) {
  return useQuery({
    queryKey: ['documents', 'reminder-candidates', unitId],
    queryFn: () => apiClient.get<DocReminderCandidate[]>(`/documents/unit/${unitId}/reminder-candidates`).then(r => r.data),
    enabled: !!unitId,
  })
}

// POST /documents/send-reminders — send the reminder email to a whole unit or an explicit member list.
export function useSendDocumentReminders() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { unitId?: string; memberIds?: string[] }) =>
      apiClient.post<SendRemindersResult>('/documents/send-reminders', body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents', 'reminder-candidates'] }),
  })
}
