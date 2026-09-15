// Custom fields resource: admin-defined member fields (text/number/select/boolean) + per-member values.
// Queries key on ['custom-fields', ...].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// Who may fill a custom field: Member (youth themselves + leaders), UnitLeader (chef d'unité + CG),
// or GroupLeader (chef de groupe only). Reading is unaffected.
export type CustomFieldEditableBy = 'Member' | 'UnitLeader' | 'GroupLeader'

// Targeting — which members the field APPEARS for (applicability) and who may VIEW its value. Kept in sync
// with the backend CustomFieldTargeting. "all" everywhere = the previous behaviour (global field, everyone views).
export type CustomFieldRole = 'all' | 'maitrise' | 'youth'
export type CustomFieldScope = 'all' | 'unitType' | 'unit'
export type CustomFieldVisibleTo = 'all' | 'leaders' | 'groupLeaders'

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
  appliesToRole: CustomFieldRole
  appliesToScope: CustomFieldScope
  appliesToUnitTypeId: string | null
  appliesToUnitId: string | null
  visibleTo: CustomFieldVisibleTo
  valueCount: number
}

// The payload shared by create + update (targeting included). displayOrder is set on create (append to end)
// and thereafter managed by the reorder endpoint — there's no manual number field anymore.
export interface CustomFieldInput {
  name: string; code: string; fieldType: string; options?: string | null; displayOrder: number
  isActive: boolean; showOnCard: boolean; editableBy: CustomFieldEditableBy
  appliesToRole: CustomFieldRole; appliesToScope: CustomFieldScope
  appliesToUnitTypeId: string | null; appliesToUnitId: string | null; visibleTo: CustomFieldVisibleTo
}

// One custom field as it applies to a specific member (targeting + visibility already applied server-side),
// with the member's stored value merged in (value null when unset). Drives the member "Infos" tab + Ma fiche.
export interface MemberCustomFieldDto {
  fieldId: string
  name: string
  code: string
  fieldType: string
  options: string | null
  editableBy: CustomFieldEditableBy
  valueId: string | null
  value: string | null
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
export function useCustomFields(enabled = true) {
  return useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => apiClient.get<CustomFieldDto[]>('/custom-fields').then(r => r.data),
    enabled,
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

// GET /custom-fields/member/{id}/applicable — the fields that APPLY to this member and the caller may VIEW,
// with values merged. Drives the "Infos complémentaires" tab + Ma fiche. Sub-key of the member key so the
// set/delete-value mutations (which invalidate ['custom-fields','member',id]) also refresh it.
export function useMemberApplicableCustomFields(memberId: string) {
  return useQuery({
    queryKey: ['custom-fields', 'member', memberId, 'applicable'],
    queryFn: () => apiClient.get<MemberCustomFieldDto[]>(`/custom-fields/member/${memberId}/applicable`).then(r => r.data),
    enabled: !!memberId,
  })
}

// POST /custom-fields — define a new field. Invalidates ['custom-fields'].
export function useCreateCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CustomFieldInput) => apiClient.post('/custom-fields', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }),
  })
}

// PUT /custom-fields/{id} — edit a field definition.
export function useUpdateCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: CustomFieldInput & { id: string }) =>
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

// PUT /custom-fields/reorder — drag-and-drop order (DisplayOrder = position).
export function useReorderCustomFields() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) => apiClient.put('/custom-fields/reorder', { orderedIds }),
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
