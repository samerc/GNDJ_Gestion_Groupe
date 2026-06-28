import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// Security profiles resource: permission sets assignable to functional roles (admin). Queries key on ['security-profiles'].

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

// GET /security-profiles → list (id/name/code/isSystem).
export function useSecurityProfiles() {
  return useQuery({
    queryKey: ['security-profiles'],
    queryFn: () => apiClient.get<SecurityProfileDto[]>('/security-profiles').then(r => r.data),
  })
}

// GET /security-profiles/{id} → detail incl. permissions[] + roleCount; disabled until id is set.
export function useSecurityProfile(id: string) {
  return useQuery({
    queryKey: ['security-profiles', id],
    queryFn: () => apiClient.get<SecurityProfileDetailDto>(`/security-profiles/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

// PUT /security-profiles/{id}/permissions → replace the permission set; invalidates the list.
export function useUpdateSecurityProfilePermissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: string[] }) =>
      apiClient.put(`/security-profiles/${id}/permissions`, { id, permissions }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['security-profiles'] }),
  })
}

// POST /security-profiles → create a custom profile (code auto-slugged server-side); invalidates the list.
export function useCreateSecurityProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string | null; permissions: string[] }) =>
      apiClient.post<{ id: string }>('/security-profiles', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['security-profiles'] }),
  })
}

// DELETE /security-profiles/{id} → delete (blocked server-side for system/in-use profiles); invalidates the list.
export function useDeleteSecurityProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/security-profiles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['security-profiles'] }),
  })
}
