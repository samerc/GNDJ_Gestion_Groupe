// Sessions. Super-admin: every live session (one row per signed-in DEVICE for members/chefs, one per account
// for the parent portal) + force-disconnect. Everyone: "Mes appareils" (own devices + sign one out).
// Keyed on ['sessions'] / ['my-devices'].
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
  userAgent: string | null // member device (browser · OS)
  ipAddress: string | null
  isCurrent: boolean       // the viewer's own current device
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

// POST /sessions/disconnect → end one member device session / a parent account's session (≤15 min).
export function useDisconnectSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { kind: string; id: string }) => apiClient.post('/sessions/disconnect', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}

export interface MyDevice {
  id: string
  userAgent: string | null
  ipAddress: string | null
  createdAt: string
  lastActivityAt: string
  expiresAt: string
  isCurrent: boolean
}

// GET /auth/devices → the signed-in user's own devices (current first). Only fetched while the dialog is open.
export function useMyDevices(enabled: boolean) {
  return useQuery({
    queryKey: ['my-devices'],
    queryFn: () => apiClient.get<MyDevice[]>('/auth/devices').then((r) => r.data),
    enabled,
  })
}

// DELETE /auth/devices/{id} → sign one of my other devices out.
export function useEndMyDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/auth/devices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-devices'] }),
  })
}
