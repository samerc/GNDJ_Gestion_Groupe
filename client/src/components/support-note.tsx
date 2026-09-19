// A small "in case of trouble, write to us" help line shown on the login + inscription pages.
// The address comes from the demande.support_email setting (configurable). Renders nothing when empty.
// Plain text line (no box) so it reads as a light footer link, consistent with the login card.
export function SupportNote({ email, className = '' }: { email?: string | null; className?: string }) {
  if (!email) return null
  return (
    <p className={`text-center text-sm text-muted-foreground ${className}`}>
      Un souci pour vous connecter&nbsp;? Écrivez-nous à{' '}
      <a href={`mailto:${email}`} className="font-medium text-primary underline-offset-2 hover:underline">
        {email}
      </a>
    </p>
  )
}
