import { AlertTriangle } from 'lucide-react'

// A small "in case of trouble, write to us" help line shown on the login + inscription pages.
// The address comes from the demande.support_email setting (configurable). Renders nothing when empty.
// Styled as a warning (amber) so it stands out to a parent/member who's stuck.
export function SupportNote({ email, className = '' }: { email?: string | null; className?: string }) {
  if (!email) return null
  return (
    <div className={`mt-6 flex items-start justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800 ${className}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <span>
        Un problème de connexion ou d'inscription&nbsp;? Écrivez-nous à{' '}
        <a href={`mailto:${email}`} className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950">
          {email}
        </a>
      </span>
    </div>
  )
}
