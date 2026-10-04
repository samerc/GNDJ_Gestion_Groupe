import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'

// "← Toutes les actualités"-style link back to a public list page. One look for every public detail page
// (article, event, resource, unit, CMS page), in both the normal and the not-found states.
export function PublicBackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> {label}
    </Link>
  )
}
