// The « ? » next to a page title: opens the guide section that explains this page (lib/page-help), picking the first
// section the signed-in user is allowed to read. Renders nothing when the page has no section or nobody is signed in.
import { Link, useLocation } from 'react-router'
import { HelpCircle } from 'lucide-react'
import { Tip } from '@/components/ui/tooltip'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { helpForPath, type HelpAudience } from '@/lib/page-help'
import { headingId } from '@/services/help-service'

export function PageHelpButton() {
  const { pathname } = useLocation()
  const user = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  if (!user) return null

  // Same audience rules as the server (Api/Help/HelpDocs.CanRead).
  const isManager = user.isSuperAdmin || hasPermission(PERMISSIONS.MAITRISE_MANAGE)
  const canRead = (a: HelpAudience) =>
    a === 'member' ? true
      : a === 'cu' ? isManager || hasPermission(PERMISSIONS.MEMBERS_EDIT)
        : a === 'cg' ? isManager
          : user.isSuperAdmin

  const help = helpForPath(pathname).find((h) => canRead(h.audience))
  if (!help) return null

  return (
    <Tip content={`Aide : ${help.section}`}>
      <Link to={`/aide/${help.guide}#${headingId(help.section)}`} aria-label={`Aide : ${help.section}`}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <HelpCircle className="h-5 w-5" />
      </Link>
    </Tip>
  )
}
