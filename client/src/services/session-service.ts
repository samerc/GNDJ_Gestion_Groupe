// Active-sessions resource (super-admin). Lists accounts with a live session (members/chefs + parent portal)
// and force-disconnects one. A "session" = an account with a non-expired rotating refresh token (one per
// account — no per-device list). Keyed on ['sessions']; auto-refreshed so "en ligne" stays current-ish.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface ActiveSession {
  kind: 'member' | 'applicant'
  id: string
  name: string
  detail: string | null // login / contact email
  loginAt: string | null
  lastActivityAt: string | null
  expiresAt: string | null
  isOnline: boolean
}

export interface ActiveSessions {
  members: ActiveSession[]
  applicants: ActiveSession[]
  onlineWindowMinutes: number
}

// GET /sessions → live member + applicant sessions. Refetches every 30s (presence freshness).
export function useActiveSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiClient.get<ActiveSessions>('/sessions').then((r) => r.data),
    refetchInterval: 30_000,
  })
}

// POST /sessions/disconnect → clear the account's refresh token (access dies within ≤15 min).
export function useDisconnectSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { kind: string; id: string }) => apiClient.post('/sessions/disconnect', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}
