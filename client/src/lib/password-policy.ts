// Configurable password-complexity policy (from GET /auth/password-policy) + client-side checks. One source of
// truth with the server (the same policy validates server-side), so the set/change/reset-password screens show
// exactly what will be accepted. Anonymous endpoint (the reset/activation pages are pre-login).
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface PasswordPolicy {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireDigit: boolean
  requireSpecial: boolean
}

export function usePasswordPolicy() {
  return useQuery({
    queryKey: ['password-policy'],
    queryFn: () => apiClient.get<PasswordPolicy>('/auth/password-policy').then((r) => r.data),
    staleTime: 5 * 60 * 1000, // rarely changes; cache 5 min
  })
}

// Builds the list of (label, satisfied) rules for a password against a policy.
export function checkPassword(password: string, policy: PasswordPolicy) {
  const rules: { label: string; ok: boolean }[] = [
    { label: `Au moins ${policy.minLength} caractères`, ok: password.length >= policy.minLength },
  ]
  if (policy.requireUppercase) rules.push({ label: 'Une lettre majuscule', ok: /[A-Z]/.test(password) })
  if (policy.requireLowercase) rules.push({ label: 'Une lettre minuscule', ok: /[a-z]/.test(password) })
  if (policy.requireDigit) rules.push({ label: 'Un chiffre', ok: /[0-9]/.test(password) })
  if (policy.requireSpecial) rules.push({ label: 'Un caractère spécial', ok: /[^A-Za-z0-9]/.test(password) })
  return rules
}

// True when a password satisfies every rule of the policy (used to gate the submit button).
export function passwordMeetsPolicy(password: string, policy: PasswordPolicy | undefined) {
  if (!policy) return password.length >= 8 // sensible fallback until the policy loads
  return checkPassword(password, policy).every((r) => r.ok)
}
