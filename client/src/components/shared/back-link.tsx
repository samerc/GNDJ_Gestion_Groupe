import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'

// Small "back" link for pages reached from another page rather than the sidebar (e.g. the config pages
// opened from the Paramètres header), so the user isn't stranded with no way back.
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  )
}
