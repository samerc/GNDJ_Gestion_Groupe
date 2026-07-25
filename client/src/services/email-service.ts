import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// Email resource: SMTP server config + templates (admin), plus password-flow auth endpoints.
// Query keys: ['smtp-servers'], ['email-templates'].

// SMTP Servers
export interface SmtpServerDto {
  id: string; name: string; host: string; port: number; username: string
  fromEmail: string; fromName: string; useSsl: boolean; isActive: boolean
}

// GET /email/smtp-servers → list of configured SMTP servers.
export function useSmtpServers() {
  return useQuery({ queryKey: ['smtp-servers'], queryFn: () => apiClient.get<SmtpServerDto[]>('/email/smtp-servers').then(r => r.data) })
}

// POST /email/smtp-servers → create; invalidates the list.
export function useCreateSmtpServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; host: string; port: number; username: string; password: string; fromEmail: string; fromName: string; useSsl: boolean; isActive: boolean }) => apiClient.post('/email/smtp-servers', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smtp-servers'] }),
  })
}

// PUT /email/smtp-servers/{id} → update (password optional = keep existing); invalidates the list.
export function useUpdateSmtpServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; host: string; port: number; username: string; password?: string; fromEmail: string; fromName: string; useSsl: boolean; isActive: boolean }) => apiClient.put(`/email/smtp-servers/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smtp-servers'] }),
  })
}

// DELETE /email/smtp-servers/{id} → delete; invalidates the list.
export function useDeleteSmtpServer() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => apiClient.delete(`/email/smtp-servers/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['smtp-servers'] }) })
}

// POST /email/smtp-servers/{id}/test → send a test email; no cache touched.
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

// GET /email/templates → list of all email templates.
export function useEmailTemplates() {
  return useQuery({ queryKey: ['email-templates'], queryFn: () => apiClient.get<EmailTemplateDto[]>('/email/templates').then(r => r.data) })
}

// GET /email/templates/{id} → single template; disabled until id is set.
export function useEmailTemplate(id: string) {
  return useQuery({
    queryKey: ['email-templates', id],
    queryFn: () => apiClient.get<EmailTemplateDto>(`/email/templates/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

// POST /email/templates → create; invalidates the list.
export function useCreateEmailTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; code: string; module: string; subject: string; bodyHtml: string; variables?: string | null; smtpServerId?: string | null; isActive: boolean }) => apiClient.post('/email/templates', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  })
}

// PUT /email/templates/{id} → update; invalidates the list.
export function useUpdateEmailTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; code: string; module: string; subject: string; bodyHtml: string; variables?: string | null; smtpServerId?: string | null; isActive: boolean }) => apiClient.put(`/email/templates/${id}`, { id, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  })
}

// DELETE /email/templates/{id} → delete; invalidates the list.
export function useDeleteEmailTemplate() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => apiClient.delete(`/email/templates/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }) })
}

// Auth
// Result of a forgot-password request: whether the account was found + the masked address(es) the link went to.
export interface ForgotPasswordResult { found: boolean; sentTo: string[] }
// POST /auth/forgot-password → emails a reset token (website = honeypot field). Returns { found, sentTo }.
export function useForgotPassword() {
  return useMutation({
    mutationFn: (data: { email: string; website?: string }) =>
      apiClient.post<ForgotPasswordResult>('/auth/forgot-password', data).then(r => r.data),
  })
}

// POST /auth/forgot-username → self-service access recovery: email your username + a set-password link to an
// address on file for you (own/guardian/primary-contact). Always returns a generic message (anti-enumeration).
export function useForgotUsername() {
  return useMutation({
    mutationFn: (data: { email: string; website?: string }) =>
      apiClient.post<{ message: string }>('/auth/forgot-username', data).then(r => r.data),
  })
}

// POST /auth/reset-password → set new password via emailed token (website = honeypot field).
export function useResetPassword() {
  return useMutation({ mutationFn: (data: { email: string; token: string; newPassword: string; website?: string }) => apiClient.post('/auth/reset-password', data) })
}

// POST /auth/change-password → change own password (validates current); invalidates sessions server-side.
export function useChangePassword() {
  return useMutation({ mutationFn: (data: { currentPassword: string; newPassword: string }) => apiClient.post('/auth/change-password', data) })
}

// POST /auth/sign-out-other-devices → rotate the refresh token so every OTHER device is signed out
// (their session dies within ~15 min). Returns a fresh token pair to keep THIS device signed in.
export function useSignOutOtherDevices() {
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ accessToken: string; refreshToken: string }>('/auth/sign-out-other-devices').then(r => r.data),
  })
}
