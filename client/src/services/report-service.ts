import apiClient from '@/lib/api-client'

// Reports resource: PDF/spreadsheet generators. All return a raw blob response (caller saves to file); no caching.

// NB: generating a trombinoscope now always SAVES it (see archiveTrombinoscope below) — the CU dialog no
// longer uses a separate unsaved "preview". The raw POST /reports/trombinoscope endpoint still exists
// server-side for API integrations, but the app doesn't call it.

// Status of a SAVED (frozen) trombinoscope for a unit + year.
export interface TrombinoscopeArchiveInfo { exists: boolean; fileName: string | null; savedAt: string | null; memberCount: number; published: boolean }

// POST /reports/trombinoscope/archive → freeze (save) the current-roster trombinoscope for a unit + year.
// publish = make it visible to members (else it's a CU-only internal overview).
export function archiveTrombinoscope(data: { unitId: string; scoutYear: string; includePhotos: boolean; teamIds?: string[] | null; publish: boolean }) {
  return apiClient.post<TrombinoscopeArchiveInfo>('/reports/trombinoscope/archive', data).then(r => r.data)
}

// GET /reports/trombinoscope/archive → whether a saved trombinoscope exists (and when it was saved).
export function getTrombinoscopeArchiveInfo(unitId: string, scoutYear: string) {
  return apiClient.get<TrombinoscopeArchiveInfo>('/reports/trombinoscope/archive', { params: { unitId, scoutYear } }).then(r => r.data)
}

// POST /reports/trombinoscope/archive/publish → publish/unpublish a saved trombinoscope (no regeneration).
export function setTrombinoscopePublished(unitId: string, scoutYear: string, published: boolean) {
  return apiClient.post<TrombinoscopeArchiveInfo>('/reports/trombinoscope/archive/publish', { unitId, scoutYear, published }).then(r => r.data)
}

// GET /reports/trombinoscope/archive/download → the saved PDF blob.
export function downloadTrombinoscopeArchive(unitId: string, scoutYear: string) {
  return apiClient.get('/reports/trombinoscope/archive/download', { params: { unitId, scoutYear }, responseType: 'blob' })
}

// GET /reports/member-card/{memberId} → single credit-card-sized PDF blob.
export function generateMemberCard(memberId: string) {
  return apiClient.get(`/reports/member-card/${memberId}`, { responseType: 'blob' })
}

// POST /reports/roster → roster PDF blob for a unit; columns picks the fields.
export function generateRoster(data: { unitId: string; teamId?: string | null; scoutYear: string; columns: string[] }) {
  return apiClient.post('/reports/roster', data, { responseType: 'blob' })
}

// GET /reports/bulk-cards/{unitId} → multi-card-per-page PDF blob for all unit members.
export function generateBulkCards(unitId: string) {
  return apiClient.get(`/reports/bulk-cards/${unitId}`, { responseType: 'blob' })
}

// POST /reports/export → Excel/CSV blob (format = excel|csv) of selected columns.
export function generateExport(data: { unitId: string; teamId?: string | null; scoutYear: string; columns: string[]; format: string }) {
  return apiClient.post('/reports/export', data, { responseType: 'blob' })
}
