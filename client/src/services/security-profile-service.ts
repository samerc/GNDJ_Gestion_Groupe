import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// Security profiles resource: permission sets assignable to functional roles (admin). Queries key on ['security-profiles'].

export interface SecurityProfileDto {
  id: string
  name: string
  code: string
  isSystem: boolean
  isGroupLevel: boolean // group-level (all-units) profile — the meaningful "acts as" targets for a delegation
}

export interface ProfileArea { key: string; label: string; level: string } // level: aucun | lecture | complet
export interface SecurityProfileDetailDto {
  id: string
  name: string
  code: string
  description: string | null
  isSystem: boolean
  isGroupLevel: boolean // group-level (all-units) profile — editable by a Chef de Groupe (via the domaine editor)
  permissions: string[]
  roleCount: number
  roleNames: string[] // the fonctions bound to this profile (name + unit-type), for the relift/merge UI
  delegationCount: number // members holding this profile as an "accès délégué" — affected by any change
  areas: ProfileArea[] // per-domaine levels (the "simple" editor view)
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

// PUT /security-profiles/{id}/area-access → set the per-domaine access in place (the "simple" editor). A Chef de
// Groupe may edit a group-level profile (capped); a super-admin any profile. Applies to ALL holders.
export function useSetProfileAreaAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, areaLevels }: { id: string; areaLevels: Record<string, string> }) =>
      apiClient.put(`/security-profiles/${id}/area-access`, { areaLevels }),
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
