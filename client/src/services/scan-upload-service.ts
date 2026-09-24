// "Scanner un document avec le téléphone" — desktop→phone document upload hand-off.
// Desktop (authed): create a session + poll its status. Phone (anonymous): read the session info + upload files.
import { useMutation, useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import publicApi from '@/lib/public-api-client'

export interface CreateUploadSessionResult {
  id: string
  token: string
  expiresAt: string
}

export interface UploadSessionStatus {
  uploadedCount: number
  expired: boolean
}

export interface ScanDocType {
  id: string
  name: string
  requiresExpiry: boolean
}

export interface ScanUploadInfo {
  memberLabel: string
  docTypes: ScanDocType[]
  expiresAt: string
}

// DESKTOP (authenticated): create a scan-upload session for a member. Returns the token to put in the QR.
export function useCreateUploadSession() {
  return useMutation({
    mutationFn: (memberId: string) =>
      apiClient.post<CreateUploadSessionResult>('/scan-upload/sessions', { memberId }).then((r) => r.data),
  })
}

// DESKTOP (authenticated): poll a session while the QR dialog is open. Stops once the session has expired.
export function useUploadSessionStatus(sessionId: string | null) {
  return useQuery({
    queryKey: ['scan-upload', 'session', sessionId],
    queryFn: () => apiClient.get<UploadSessionStatus>(`/scan-upload/sessions/${sessionId}`).then((r) => r.data),
    enabled: !!sessionId,
    // Poll every 2.5s so the desktop sees an arriving document quickly; stop once expired.
    refetchInterval: (q) => (q.state.data?.expired ? false : 2500),
  })
}

// PHONE (anonymous): read the minimal context for the scan page (member label + document types).
export function useScanUploadInfo(token: string) {
  return useQuery({
    queryKey: ['scan-upload', 'info', token],
    queryFn: () => publicApi.get<ScanUploadInfo>(`/scan-upload/${token}`).then((r) => r.data),
    enabled: !!token,
    retry: false, // an expired/invalid token should show its error immediately, not retry
  })
}

// PHONE (anonymous): upload photographed document file(s) against a scan session token.
export function scanUploadFiles(token: string, formData: FormData, onUploadProgress?: (pct: number) => void) {
  return publicApi.post(`/scan-upload/${token}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (e.total && onUploadProgress) onUploadProgress(Math.round((e.loaded * 100) / e.total))
    },
  })
}
