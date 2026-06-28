import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// Report templates resource: CG-defined saved report configs (CU generates from them). Queries key on ['report-templates'].

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

// GET /report-templates → list; activeOnly filters to enabled templates.
export function useReportTemplates(activeOnly = false) {
  return useQuery({
    queryKey: ['report-templates', { activeOnly }],
    queryFn: () => apiClient.get<ReportTemplateDto[]>('/report-templates', { params: { activeOnly } }).then(r => r.data),
  })
}

// POST /report-templates → create; invalidates the list.
export function useCreateReportTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ReportTemplateFormData) => apiClient.post('/report-templates', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report-templates'] }),
  })
}

// PUT /report-templates/{id} → update; invalidates the list.
export function useUpdateReportTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: ReportTemplateFormData & { id: string }) =>
      apiClient.put(`/report-templates/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report-templates'] }),
  })
}

// DELETE /report-templates/{id} → delete; invalidates the list.
export function useDeleteReportTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/report-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report-templates'] }),
  })
}
