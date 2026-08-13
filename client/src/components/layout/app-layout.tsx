import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Toaster } from 'sonner'
import { Sidebar, MobileSidebar } from './sidebar'
import { Header } from './header'
import { SessionWarning } from '@/components/shared/session-warning'
import { RentreeOverduePopup } from '@/components/rentree/overdue-popup'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuthStore } from '@/stores/auth-store'
import { useMaintenance } from '@/services/maintenance-service'
import { MaintenancePage } from '@/components/shared/maintenance-page'
import { ForcePasswordChange } from '@/components/auth/force-password-change'

// ROLE: authenticated app shell — sidebar + header around the routed <Outlet>.
// Used as the layout route wrapping every signed-in page. Mounts the global
// Sonner <Toaster>, the idle session-expiry warning, the once-per-session
// rentrée-overdue reminder, and the Tooltip provider so they're present on all inner pages.
export function AppLayout() {
  // The app scrolls INSIDE <main> (not the window), and <main> lives in this persistent layout — so
  // React Router swaps the page but the container keeps its old scrollTop, landing you mid/bottom of the
  // new page (clamped to its shorter height). Reset the scroll container to the top on every navigation.
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 })
  }, [pathname])

  // Maintenance kill-switch: when the whole site or the "membres" module is off, everyone but the super-admin
  // (who needs access to turn it back off) sees the maintenance page. The super-admin sees a warning banner.
  const user = useAuthStore((s) => s.user)
  const { data: maint } = useMaintenance()
  const inMaintenance = !!maint && (maint.site || maint.membres)
  if (inMaintenance && !user?.isSuperAdmin) return <MaintenancePage message={maint?.message} />

  // Forced first-login password change: block the entire app (no sidebar/routes) until the user sets their own
  // password. Applies to temp/imported/leader-reset accounts (mustChangePassword); those who activated via the
  // email link already set their password (flag cleared) and never see this.
  if (user?.mustChangePassword) return <ForcePasswordChange />

  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={300}>
    <div className="flex h-screen">
      <Sidebar />
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
