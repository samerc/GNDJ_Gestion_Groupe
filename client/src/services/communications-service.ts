// CG communications: list leader recipients + send an email template to selected leaders. Keyed on
// ['communications', ...]. Authenticated apiClient; every endpoint requires maitrise.manage server-side.
import { useMutation, useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface LeaderRecipient {
  memberId: string
  fullName: string
  units: string
  contactEmail: string | null
  hasAccount: boolean
  hasLoggedIn: boolean
}

export interface SendLeaderMessageResult {
  sent: number
  noEmail: number
  noEmailNames: string[]
  // Only relevant for an activation-link template: recipients with no login account (can't get a set-password link).
  noAccount: number
  noAccountNames: string[]
}

// GET /communications/leaders → leaders (active maîtrise assignment), optional unit + never-logged-in filters.
export function useLeaderRecipients(unitId: string | undefined, neverLoggedInOnly: boolean) {
  return useQuery({
    queryKey: ['communications', 'leaders', unitId ?? '', neverLoggedInOnly],
    queryFn: () => apiClient
      .get<LeaderRecipient[]>('/communications/leaders', { params: { unitId: unitId || undefined, neverLoggedInOnly } })
      .then((r) => r.data),
  })
}

// POST /communications/send → queue the chosen template to the selected leaders (via the durable outbox).
export function useSendLeaderMessage() {
  return useMutation({
    mutationFn: (data: { templateCode: string; memberIds: string[] }) =>
      apiClient.post<SendLeaderMessageResult>('/communications/send', data).then((r) => r.data),
  })
}
