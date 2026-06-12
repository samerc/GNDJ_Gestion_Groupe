import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface ReportTemplateDto {
  id: string
  name: string
  description: string
  reportType: string
  format: string
  columnsJson: string
  isActive: boolean
  displayOrder: number
  createdAt: string
}

export interface ReportTemplateFormData {
  name: string
  description: string
  reportType: string
  format: string
  columnsJson: string
  isActive: boolean
  displayOrder: number
}

export function useReportTemplates(activeOnly = false) {
  return useQuery({
    queryKey: ['report-templates', { activeOnly }],
    queryFn: () => apiClient.get<ReportTemplateDto[]>('/report-templates', { params: { activeOnly } }).then(r => r.data),
  })
}

export function useCreateReportTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ReportTemplateFormData) => apiClient.post('/report-templates', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report-templates'] }),
  })
}

export function useUpdateReportTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: ReportTemplateFormData & { id: string }) =>
      apiClient.put(`/report-templates/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report-templates'] }),
  })
}

export function useDeleteReportTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/report-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report-templates'] }),
  })
}
