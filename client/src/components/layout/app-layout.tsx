import { Outlet } from 'react-router'
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
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
    </TooltipProvider>
  )
}
