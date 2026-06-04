import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface CustomFieldDto {
  id: string
  name: string
  code: string
  fieldType: string // text, number, select, boolean
  options: string | null // JSON array for select
  displayOrder: number
  isActive: boolean
  showOnCard: boolean
  valueCount: number
}

export interface CustomFieldListDto {
  id: string
  name: string
  code: string
  fieldType: string
  options: string | null
  showOnCard: boolean
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

export function useCustomFields() {
  return useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => apiClient.get<CustomFieldDto[]>('/custom-fields').then(r => r.data),
  })
}

export function useActiveCustomFields() {
  return useQuery({
    queryKey: ['custom-fields', 'active'],
    queryFn: () => apiClient.get<CustomFieldListDto[]>('/custom-fields/active').then(r => r.data),
  })
}

export function useMemberCustomFieldValues(memberId: string) {
  return useQuery({
    queryKey: ['custom-fields', 'member', memberId],
    queryFn: () => apiClient.get<MemberCustomFieldValueDto[]>(`/custom-fields/member/${memberId}`).then(r => r.data),
    enabled: !!memberId,
  })
}

export function useCreateCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; code: string; fieldType: string; options?: string | null; displayOrder: number; isActive: boolean; showOnCard: boolean }) =>
      apiClient.post('/custom-fields', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }),
  })
}

export function useUpdateCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; code: string; fieldType: string; options?: string | null; displayOrder: number; isActive: boolean; showOnCard: boolean }) =>
      apiClient.put(`/custom-fields/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }),
  })
}

export function useDeleteCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/custom-fields/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }),
  })
}

export function useSetMemberCustomFieldValue(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { customFieldId: string; value: string }) =>
      apiClient.put(`/custom-fields/member/${memberId}/${data.customFieldId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields', 'member', memberId] }),
  })
}

export function useDeleteMemberCustomFieldValue(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/custom-fields/values/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields', 'member', memberId] }),
  })
}
