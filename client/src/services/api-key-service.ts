import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// API keys resource: scoped external-integration keys (admin). Queries key on ['api-keys'].

export interface ApiKeyDto {
  id: string
  name: string
  keyPrefix: string
  scopes: string
  memberId: string | null
  memberName: string | null
  isActive: boolean
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

export interface ApiKeyCreatedDto {
  id: string
  key: string
}

// GET /api-keys → list (prefix only, never the full key).
export function useApiKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiClient.get<ApiKeyDto[]>('/api-keys').then(r => r.data),
  })
}

// POST /api-keys → create; returns the plaintext key ONCE (shown to copy). Invalidates the list.
export function useCreateApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; scopes: string; memberId?: string | null; expiresAt?: string | null }) =>
      apiClient.post<ApiKeyCreatedDto>('/api-keys', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })
}

// PUT /api-keys/{id}/toggle → flip active state; invalidates the list.
export function useToggleApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.put(`/api-keys/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })
}

// DELETE /api-keys/{id} → delete; invalidates the list.
export function useDeleteApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })
}
