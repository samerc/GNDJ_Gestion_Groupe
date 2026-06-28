import type { AxiosError } from 'axios'
import type { ApiError } from '@/types/api'

// Turn any thrown API error into a user-facing French message, in priority order:
// field validation errors → single error → problem-details title → network/HTTP-status fallback.
export function parseApiError(err: unknown): string {
  const axiosError = err as AxiosError<ApiError>
  const data = axiosError.response?.data

  // Validation errors (field-level)
  if (data?.errors) {
    const messages = Object.entries(data.errors)
      .map(([_field, msgs]) => (msgs as string[]).join(' '))
      .filter(Boolean)
    if (messages.length > 0) return messages.join(' ')
  }

  // Single error message
  if (data?.error) return data.error

  // Title from problem details
  if (data?.title) return data.title

  // Network or unknown error
  if (axiosError.message === 'Network Error') return 'Impossible de contacter le serveur. Vérifiez votre connexion.'
  if (axiosError.response?.status === 403) return 'Vous n\'avez pas les permissions nécessaires pour cette action.'
  if (axiosError.response?.status === 404) return 'Élément introuvable.'

  return 'Une erreur inattendue est survenue. Veuillez réessayer.'
}
