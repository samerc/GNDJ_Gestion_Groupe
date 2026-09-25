import { Link } from 'react-router'
import { HomeLink } from './home-link'
import { useSidebarStore } from '@/stores/sidebar-store'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'
import { useIsManager, useRoleTheme } from '@/lib/use-is-manager'
import { AdminNav, BrandMark } from './sidebar'
import { UserMenu } from './user-menu'
import { NotificationBell } from './notification-bell'
import { CommandPalette } from './command-palette'
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
      // iOS safe area: with viewport-fit=cover + apple black-translucent status bar, the standalone app draws
      // UNDER the notch/Dynamic Island. Grow the bar by the top inset and pad the row down below it, so the
      // hamburger/brand stay reachable and the colour fills up to the screen edge. env() = 0 off iOS (no change).
      className="sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] items-center gap-3 border-b border-white/10 px-4 pt-[env(safe-area-inset-top)] text-white shadow-sm sm:px-6"
    >
      {/* Mobile: hamburger + wordmark (drawer nav lives in MobileSidebar) */}
      <Button variant="ghost" size="icon" className="shrink-0 text-white/80 hover:bg-white/10 hover:text-white lg:hidden" onClick={() => setMobileOpen(true)}>
        <Menu className="h-5 w-5" />
      </Button>
      {/* Mobile: the wordmark is the home link (→ role-aware /dashboard = "Accueil"). */}
      <HomeLink title="Accueil" className="text-lg font-bold tracking-tight text-white lg:hidden">GNDJ Scout</HomeLink>

      {/* Desktop managers: brand + horizontal nav (no left sidebar for them). The brand is the "Accueil" home
          link — clicking the logo opens the group dashboard, so it needs no dedicated menu button. */}
      {isManager && (
        <HomeLink title="Accueil" className="hidden shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/10 lg:flex">
          <BrandMark className="h-8 w-8" />
          <span className="text-[15px] font-bold tracking-tight text-white">GNDJ Scout</span>
        </HomeLink>
      )}
      {isManager && <AdminNav />}

      {/* Right: version (super-admin) + account menu */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {/* Global quick-search (Ctrl/⌘-K) — leaders only; self-gates + returns null otherwise. */}
        <CommandPalette />
        {isManager && isSuperAdmin && (
          <Link
            to="/admin/changelog"
            title={`build ${BUILD_COMMIT}${BUILD_DATE ? ` · ${BUILD_DATE}` : ''}`}
            className="hidden px-2 text-[11px] font-medium text-white/50 transition-colors hover:text-white lg:inline"
          >
            v{APP_VERSION}
          </Link>
        )}
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  )
}
