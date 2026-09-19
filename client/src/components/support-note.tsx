import { HelpCircle } from 'lucide-react'

// A small "in case of trouble, write to us" help line shown on the login + inscription pages.
// The address comes from the demande.support_email setting (configurable). Renders nothing when empty.
// Neutral/quiet styling (a muted bordered line, not an amber alarm) so it stays consistent with the login
// card — it's a help hint, not a warning.
export function SupportNote({ email, className = '' }: { email?: string | null; className?: string }) {
  if (!email) return null
  return (
    <div className={`mt-4 flex items-center justify-center gap-2 rounded-lg border bg-muted/30 px-4 py-2.5 text-center text-sm text-muted-foreground ${className}`}>
      <HelpCircle className="h-4 w-4 shrink-0" />
      <span>
        Un souci pour vous connecter&nbsp;? Écrivez-nous à{' '}
        <a href={`mailto:${email}`} className="font-medium text-primary underline underline-offset-2 hover:text-primary/80">
          {email}
        </a>
      </span>
    </div>
  )
}
