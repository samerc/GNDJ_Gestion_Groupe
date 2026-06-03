import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface SecurityProfileDto {
  id: string
  name: string
  code: string
  isSystem: boolean
}

export interface SecurityProfileDetailDto {
  id: string
  name: string
  code: string
  description: string | null
  isSystem: boolean
  permissions: string[]
  roleCount: number
}

export function useSecurityProfiles() {
  return useQuery({
    queryKey: ['security-profiles'],
    queryFn: () => apiClient.get<SecurityProfileDto[]>('/security-profiles').then(r => r.data),
  })
}

export function useSecurityProfile(id: string) {
  return useQuery({
    queryKey: ['security-profiles', id],
    queryFn: () => apiClient.get<SecurityProfileDetailDto>(`/security-profiles/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useUpdateSecurityProfilePermissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: string[] }) =>
      apiClient.put(`/security-profiles/${id}/permissions`, { id, permissions }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['security-profiles'] }),
  })
}
