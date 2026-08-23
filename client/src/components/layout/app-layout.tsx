import { useLayoutEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Toaster } from 'sonner'
import { Sidebar, MobileSidebar } from './sidebar'
import { useIsManager } from '@/lib/use-is-manager'
import { Header } from './header'
import { SessionWarning } from '@/components/shared/session-warning'
import { RentreeOverduePopup } from '@/components/rentree/overdue-popup'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuthStore } from '@/stores/auth-store'
import { useMaintenance } from '@/services/maintenance-service'
import { MaintenancePage } from '@/components/shared/maintenance-page'
import { ForcePasswordChange } from '@/components/auth/force-password-change'
import { LeaderContactVerification } from '@/components/auth/leader-contact-verification'

// ROLE: authenticated app shell — sidebar + header around the routed <Outlet>.
// Used as the layout route wrapping every signed-in page. Mounts the global
// Sonner <Toaster>, the idle session-expiry warning, the once-per-session
// rentrée-overdue reminder, and the Tooltip provider so they're present on all inner pages.
export function AppLayout() {
  // The app scrolls INSIDE <main> (not the window), and <main> lives in this persistent layout — so
  // React Router swaps the page but the container keeps its old scrollTop, landing you mid/bottom of the
  // new page. Reset it to the top on every navigation.
  // useLayoutEffect (NOT useEffect) so the reset runs synchronously BEFORE the browser paints: when both the
  // old and new page are tall and the new page renders instantly (cached data), a post-paint useEffect would
  // let the browser show one frame of the new page at the OLD scroll position (its bottom) before snapping to
  // the top — a visible "landed at the bottom" flash. Resetting pre-paint eliminates it. Also nudge the window
  // (belt-and-suspenders for any page that scrolls the document instead of <main>).
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 })
    window.scrollTo({ top: 0, left: 0 })
  }, [pathname])

  // Maintenance kill-switch: when the whole site or the "membres" module is off, everyone but the super-admin
  // (who needs access to turn it back off) sees the maintenance page. The super-admin sees a warning banner.
  const user = useAuthStore((s) => s.user)
  const isManager = useIsManager()
  const { data: maint } = useMaintenance()
  const inMaintenance = !!maint && (maint.site || maint.membres)
  if (inMaintenance && !user?.isSuperAdmin) return <MaintenancePage message={maint?.message} />

  // Forced first-login password change: block the entire app (no sidebar/routes) until the user sets their own
  // password. Applies to temp/imported/leader-reset accounts (mustChangePassword); those who activated via the
  // email link already set their password (flag cleared) and never see this.
  if (user?.mustChangePassword) return <ForcePasswordChange />

  // Leader first-login step (AFTER the password): confirm your personal contact details (email + phone). Many
  // leaders were youth with a parent's on file; block the app once until they confirm/correct them.
  if (user?.needsContactVerification) return <LeaderContactVerification />

  // Managers get a horizontal top menubar (desktop) instead of the long left sidebar — the grouped admin nav
  // fits better as dropdowns and frees the width for the data-dense tables. Non-managers keep the left sidebar.
  // On mobile, everyone uses the hamburger drawer (MobileSidebar); AdminTopNav is desktop-only (hidden < lg).
  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={300}>
    <div className="flex h-screen">
      {!isManager && <Sidebar />}
      <MobileSidebar />
      <Toaster richColors position="top-center" />
      <SessionWarning />
      <RentreeOverduePopup />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        {inMaintenance && (
          <div className="bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
            Mode maintenance actif ({maint?.site ? 'tout le site' : 'espace membres'}) — seuls les super-administrateurs ont accès. Désactivez-le dans Paramètres.
          </div>
        )}
        <main ref={mainRef} className="flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
    </TooltipProvider>
  )
}
