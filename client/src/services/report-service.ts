import apiClient from '@/lib/api-client'

// Reports resource: PDF/spreadsheet generators. All return a raw blob response (caller saves to file); no caching.

// POST /reports/trombinoscope → photo-grid PDF blob for a unit (optionally a team subset).
export function generateTrombinoscope(data: { unitId: string; scoutYear: string; includePhotos: boolean; teamIds?: string[] | null }) {
  return apiClient.post('/reports/trombinoscope', data, { responseType: 'blob' })
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
