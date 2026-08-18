import { Link } from 'react-router'
import { useSidebarStore } from '@/stores/sidebar-store'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'
import { useIsManager, useRoleTheme } from '@/lib/use-is-manager'
import { AdminNav, BrandMark } from './sidebar'
import { UserMenu } from './user-menu'
import { APP_VERSION, BUILD_COMMIT, BUILD_DATE } from '@/lib/app-version'

// ROLE: the single top bar for the authenticated shell.
//  - Mobile (all users): hamburger (opens the drawer) + wordmark + account menu.
//  - Desktop MANAGERS: brand + the horizontal admin nav (AdminNav) + version + account menu — they have no
//    left sidebar, so the header IS their whole nav.
//  - Desktop non-managers: just the account menu on the right (their nav is the left sidebar).
export function Header() {
  const { setMobileOpen } = useSidebarStore()
  const isManager = useIsManager()
  const theme = useRoleTheme()
  const isSuperAdmin = useAuthStore((s) => !!s.user?.isSuperAdmin)

  return (
    // Bar colour reflects the signed-in user's ROLE (member / CU / CG / super-admin) — see useRoleTheme.
    // Applied inline (configurable hex from Settings → Apparence). Item/text styles use white overlays so they
    // work on ANY dark bar colour.
    <header
      style={{ backgroundColor: theme.color }}
      className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/10 px-4 text-white shadow-sm sm:px-6"
    >
      {/* Mobile: hamburger + wordmark (drawer nav lives in MobileSidebar) */}
      <Button variant="ghost" size="icon" className="shrink-0 text-white/80 hover:bg-white/10 hover:text-white lg:hidden" onClick={() => setMobileOpen(true)}>
        <Menu className="h-5 w-5" />
      </Button>
      <span className="text-lg font-bold tracking-tight text-white lg:hidden">GNDJ Scout</span>

      {/* Desktop managers: brand + horizontal nav (no left sidebar for them) */}
      {isManager && (
        <Link to="/dashboard" className="hidden shrink-0 items-center gap-2 lg:flex">
          <BrandMark className="h-8 w-8" />
          <span className="text-[15px] font-bold tracking-tight text-white">GNDJ Scout</span>
        </Link>
      )}
      {isManager && <AdminNav />}

      {/* Right: version (super-admin) + account menu */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {isManager && isSuperAdmin && (
          <Link
            to="/admin/changelog"
            title={`build ${BUILD_COMMIT}${BUILD_DATE ? ` · ${BUILD_DATE}` : ''}`}
            className="hidden px-2 text-[11px] font-medium text-white/50 transition-colors hover:text-white lg:inline"
          >
            v{APP_VERSION}
          </Link>
        )}
        <UserMenu />
      </div>
    </header>
  )
}
