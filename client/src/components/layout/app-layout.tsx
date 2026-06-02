import { Outlet } from 'react-router'
import { Sidebar, MobileSidebar } from './sidebar'
import { Header } from './header'

export function AppLayout() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <MobileSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
