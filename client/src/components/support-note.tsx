import { LifeBuoy } from 'lucide-react'

// A small "in case of trouble, write to us" help line shown on the login + inscription pages.
// The address comes from the demande.support_email setting (configurable). Renders nothing when empty.
export function SupportNote({ email, className = '' }: { email?: string | null; className?: string }) {
  if (!email) return null
  return (
    <div className={`mt-6 flex items-start justify-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground ${className}`}>
      <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span>
        Un problème de connexion ou d'inscription&nbsp;? Écrivez-nous à{' '}
        <a href={`mailto:${email}`} className="font-medium text-primary underline-offset-2 hover:underline">
          {email}
        </a>
      </span>
    </div>
  )
}
