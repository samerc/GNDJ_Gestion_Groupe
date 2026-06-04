import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

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

export function useApiKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiClient.get<ApiKeyDto[]>('/api-keys').then(r => r.data),
  })
}

export function useCreateApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; scopes: string; memberId?: string | null; expiresAt?: string | null }) =>
      apiClient.post<ApiKeyCreatedDto>('/api-keys', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })
}

export function useToggleApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.put(`/api-keys/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })
}

export function useDeleteApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })
}
