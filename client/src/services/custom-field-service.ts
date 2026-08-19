// Custom fields resource: admin-defined member fields (text/number/select/boolean) + per-member values.
// Queries key on ['custom-fields', ...].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// Who may fill a custom field: Member (youth themselves + leaders), UnitLeader (chef d'unité + CG),
// or GroupLeader (chef de groupe only). Reading is unaffected.
export type CustomFieldEditableBy = 'Member' | 'UnitLeader' | 'GroupLeader'

export interface CustomFieldDto {
  id: string
  name: string
  code: string
  fieldType: string // text, number, select, boolean
  options: string | null // JSON array for select
  displayOrder: number
  isActive: boolean
  showOnCard: boolean
  editableBy: CustomFieldEditableBy
  valueCount: number
}

export interface CustomFieldListDto {
  id: string
  name: string
  code: string
  fieldType: string
  options: string | null
  showOnCard: boolean
  editableBy: CustomFieldEditableBy
}

export interface MemberCustomFieldValueDto {
  id: string
  customFieldId: string
  fieldName: string
  fieldCode: string
  fieldType: string
  fieldOptions: string | null
  value: string
}

// GET /custom-fields — all field definitions for the admin page. Keyed ['custom-fields'].
export function useCustomFields() {
  return useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => apiClient.get<CustomFieldDto[]>('/custom-fields').then(r => r.data),
  })
}

// GET /custom-fields/active — slim active fields for rendering on member forms.
export function useActiveCustomFields() {
  return useQuery({
    queryKey: ['custom-fields', 'active'],
    queryFn: () => apiClient.get<CustomFieldListDto[]>('/custom-fields/active').then(r => r.data),
  })
}

// GET /custom-fields/member/{id} — a member's field values. Keyed ['custom-fields','member',memberId].
export function useMemberCustomFieldValues(memberId: string) {
  return useQuery({
    queryKey: ['custom-fields', 'member', memberId],
    queryFn: () => apiClient.get<MemberCustomFieldValueDto[]>(`/custom-fields/member/${memberId}`).then(r => r.data),
    enabled: !!memberId,
  })
}

// POST /custom-fields — define a new field. Invalidates ['custom-fields'].
export function useCreateCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; code: string; fieldType: string; options?: string | null; displayOrder: number; isActive: boolean; showOnCard: boolean; editableBy: CustomFieldEditableBy }) =>
      apiClient.post('/custom-fields', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }),
  })
}

// PUT /custom-fields/{id} — edit a field definition.
export function useUpdateCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; code: string; fieldType: string; options?: string | null; displayOrder: number; isActive: boolean; showOnCard: boolean; editableBy: CustomFieldEditableBy }) =>
      apiClient.put(`/custom-fields/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }),
  })
}

// DELETE /custom-fields/{id} — remove a field definition.
export function useDeleteCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/custom-fields/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }),
  })
}

// PUT /custom-fields/member/{memberId}/{fieldId} — upsert one field value. Invalidates the member's values.
export function useSetMemberCustomFieldValue(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { customFieldId: string; value: string }) =>
      apiClient.put(`/custom-fields/member/${memberId}/${data.customFieldId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields', 'member', memberId] }),
  })
}

// DELETE /custom-fields/values/{id} — clear one member's field value.
export function useDeleteMemberCustomFieldValue(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/custom-fields/values/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields', 'member', memberId] }),
  })
}

// ── Member self-service (Ma fiche): set/clear one's OWN value — server allows only Member-editable fields ──
// PUT /my-profile/custom-fields/{fieldId} — upsert own value (auth-only, own member resolved server-side).
export function useSetMyCustomFieldValue(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { customFieldId: string; value: string }) =>
      apiClient.put(`/my-profile/custom-fields/${data.customFieldId}`, { value: data.value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields', 'member', memberId] }),
  })
}

// DELETE /my-profile/custom-fields/{fieldId} — clear own value.
export function useDeleteMyCustomFieldValue(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (customFieldId: string) => apiClient.delete(`/my-profile/custom-fields/${customFieldId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields', 'member', memberId] }),
  })
}
