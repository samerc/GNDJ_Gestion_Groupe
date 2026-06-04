import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// SMTP Servers
export interface SmtpServerDto {
  id: string; name: string; host: string; port: number; username: string
  fromEmail: string; fromName: string; useSsl: boolean; isActive: boolean
}

export function useSmtpServers() {
  return useQuery({ queryKey: ['smtp-servers'], queryFn: () => apiClient.get<SmtpServerDto[]>('/email/smtp-servers').then(r => r.data) })
}

export function useCreateSmtpServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; host: string; port: number; username: string; password: string; fromEmail: string; fromName: string; useSsl: boolean; isActive: boolean }) => apiClient.post('/email/smtp-servers', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smtp-servers'] }),
  })
}

export function useUpdateSmtpServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; host: string; port: number; username: string; password?: string; fromEmail: string; fromName: string; useSsl: boolean; isActive: boolean }) => apiClient.put(`/email/smtp-servers/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smtp-servers'] }),
  })
}

export function useDeleteSmtpServer() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => apiClient.delete(`/email/smtp-servers/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['smtp-servers'] }) })
}

export function useTestSmtp() {
  return useMutation({
    mutationFn: (data: { smtpServerId: string; testEmail: string }) => apiClient.post(`/email/smtp-servers/${data.smtpServerId}/test`, data),
  })
}

// Email Templates
export interface EmailTemplateDto {
  id: string; name: string; code: string; module: string; subject: string
  bodyHtml: string; variables: string | null; smtpServerId: string | null
  smtpServerName: string | null; isActive: boolean
}

export function useEmailTemplates() {
  return useQuery({ queryKey: ['email-templates'], queryFn: () => apiClient.get<EmailTemplateDto[]>('/email/templates').then(r => r.data) })
}

export function useEmailTemplate(id: string) {
  return useQuery({
    queryKey: ['email-templates', id],
    queryFn: () => apiClient.get<EmailTemplateDto>(`/email/templates/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useCreateEmailTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; code: string; module: string; subject: string; bodyHtml: string; variables?: string | null; smtpServerId?: string | null; isActive: boolean }) => apiClient.post('/email/templates', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  })
}

export function useUpdateEmailTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; code: string; module: string; subject: string; bodyHtml: string; variables?: string | null; smtpServerId?: string | null; isActive: boolean }) => apiClient.put(`/email/templates/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  })
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => apiClient.delete(`/email/templates/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }) })
}

// Auth
export function useForgotPassword() {
  return useMutation({ mutationFn: (data: { email: string }) => apiClient.post('/auth/forgot-password', data) })
}

export function useResetPassword() {
  return useMutation({ mutationFn: (data: { email: string; token: string; newPassword: string }) => apiClient.post('/auth/reset-password', data) })
}

export function useChangePassword() {
  return useMutation({ mutationFn: (data: { currentPassword: string; newPassword: string }) => apiClient.post('/auth/change-password', data) })
}
