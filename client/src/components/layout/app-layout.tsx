import { Outlet } from 'react-router'
import { Toaster } from 'sonner'
import { Sidebar, MobileSidebar } from './sidebar'
import { Header } from './header'
import { SessionWarning } from '@/components/shared/session-warning'
import { RentreeOverduePopup } from '@/components/rentree/overdue-popup'

export function AppLayout() {
  return (
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
  )
}
