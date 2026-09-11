import { Link } from 'react-router'
import { ChevronLeft } from 'lucide-react'

// A "← Retour aux paramètres" breadcrumb for config pages that are reached from the Paramètres launchpad
// (Email / SMTP, Modèles de rapports, Profils & accès…) so there is always a one-click way back to the hub.
export function BackToSettings() {
  return (
    <Link
      to="/admin/settings"
      className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" />
      Retour aux paramètres
    </Link>
  )
}
