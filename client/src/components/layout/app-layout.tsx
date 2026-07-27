import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Toaster } from 'sonner'
import { Sidebar, MobileSidebar } from './sidebar'
import { Header } from './header'
import { SessionWarning } from '@/components/shared/session-warning'
import { RentreeOverduePopup } from '@/components/rentree/overdue-popup'
import { TooltipProvider } from '@/components/ui/tooltip'

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
        <main ref={mainRef} className="flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
    </TooltipProvider>
  )
}
