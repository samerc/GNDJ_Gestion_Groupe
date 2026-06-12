import apiClient from '@/lib/api-client'

export function generateTrombinoscope(data: { unitId: string; scoutYear: string; includePhotos: boolean; teamIds?: string[] | null }) {
  return apiClient.post('/reports/trombinoscope', data, { responseType: 'blob' })
}

export function generateMemberCard(memberId: string) {
  return apiClient.get(`/reports/member-card/${memberId}`, { responseType: 'blob' })
}

export function generateRoster(data: { unitId: string; teamId?: string | null; scoutYear: string; columns: string[] }) {
  return apiClient.post('/reports/roster', data, { responseType: 'blob' })
}

export function generateBulkCards(unitId: string) {
  return apiClient.get(`/reports/bulk-cards/${unitId}`, { responseType: 'blob' })
}

export function generateExport(data: { unitId: string; teamId?: string | null; scoutYear: string; columns: string[]; format: string }) {
  return apiClient.post('/reports/export', data, { responseType: 'blob' })
}
