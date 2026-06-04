import { Link, useLocation } from 'react-router'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useSidebarStore } from '@/stores/sidebar-store'
import { PERMISSIONS } from '@/lib/constants'
import {
  Users,
  Building2,
  LayoutDashboard,
  Shield,
  ShieldCheck,
  Landmark,
  FolderTree,
  FileText,
  Star,
  ScrollText,
  ArrowRightLeft,
  Key,
  ListPlus,
  CreditCard,
  Settings2,
  ChevronsLeft,
  ChevronsRight,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// Admin/super admin nav
const adminNavItems = [
  { path: '/', label: 'Tableau de bord', icon: LayoutDashboard, permission: null },
  { path: '/members', label: 'Membres', icon: Users, permission: PERMISSIONS.MEMBERS_VIEW },
  { path: '/units', label: 'Unités', icon: Building2, permission: PERMISSIONS.UNITS_VIEW },
]

// Unit leader nav — "Mon unité" and "Documents" only visible to CU (units.edit permission)
const leaderNavItems = [
  { path: '/my-profile', label: 'Ma fiche', icon: Users, permission: null },
  { path: '/', label: 'Mon unité', icon: Building2, permission: PERMISSIONS.UNITS_EDIT },
  { path: '/unit-documents', label: 'Documents', icon: FileText, permission: PERMISSIONS.DOCUMENTS_APPROVE },
  { path: '/passage', label: 'Passage des membres', icon: ArrowRightLeft, permission: PERMISSIONS.PASSAGE_PROPOSE },
]

const adminItems = [
  { path: '/admin/roles', label: 'Fonctions', icon: Shield, permission: PERMISSIONS.ROLES_VIEW },
  { path: '/admin/associations', label: 'Associations', icon: Landmark, permission: PERMISSIONS.ASSOCIATIONS_VIEW },
  { path: '/admin/unit-types', label: "Types d'unité", icon: FolderTree, permission: PERMISSIONS.UNIT_TYPES_VIEW },
  { path: '/admin/document-types', label: 'Types de documents', icon: FileText, permission: PERMISSIONS.DOCUMENT_TYPES_VIEW },
  { path: '/admin/progression', label: 'Progression scoute', icon: Star, permission: PERMISSIONS.PROGRESSION_MANAGE },
  { path: '/admin/passage-validation', label: 'Validation passages', icon: ArrowRightLeft, permission: PERMISSIONS.PASSAGE_MANAGE },
  { path: '/admin/custom-fields', label: 'Champs personnalisés', icon: ListPlus, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
  { path: '/admin/card-designer', label: 'Carte membre', icon: CreditCard, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
  { path: '/admin/api-keys', label: 'Clés API', icon: Key, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
  { path: '/admin/security-profiles', label: 'Profils de sécurité', icon: ShieldCheck, permission: PERMISSIONS.ROLES_MANAGE },
  { path: '/admin/audit-logs', label: 'Journal d\'audit', icon: ScrollText, permission: PERMISSIONS.AUDIT_VIEW },
  { path: '/admin/settings', label: 'Paramètres', icon: Settings2, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
]

function NavContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const location = useLocation()
  const { hasPermission, user } = useAuthStore()

  // Super admin sees admin nav, others see leader nav
  const navItems = user?.isSuperAdmin ? adminNavItems : leaderNavItems
  const visibleNav = navItems.filter((item) => !item.permission || hasPermission(item.permission))
  const visibleAdmin = user?.isSuperAdmin ? adminItems.filter((item) => hasPermission(item.permission)) : []

  const renderLink = (item: { path: string; label: string; icon: React.ComponentType<{ className?: string }>; permission: string | null }, isActive: boolean) => {
    const Icon = item.icon
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={onNavigate}
        className={cn(
          'group/nav relative flex items-center rounded-md text-sm font-medium transition-colors',
          collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
        {collapsed && (
          <span className="pointer-events-none absolute left-full ml-2 rounded-md bg-foreground px-2 py-1 text-xs text-background opacity-0 shadow-md transition-opacity group-hover/nav:opacity-100 whitespace-nowrap z-50">
            {item.label}
          </span>
        )}
      </Link>
    )
  }

  return (
    <nav className={cn('space-y-1', collapsed ? 'px-2' : 'px-3')}>
      {visibleNav.map((item) => renderLink(item, location.pathname === item.path))}

      {visibleAdmin.length > 0 && (
        <>
          {!collapsed ? (
            <div className="pt-4 pb-2 px-3 text-xs font-semibold uppercase text-sidebar-foreground/50">
              Administration
            </div>
          ) : (
            <div className="pt-3 pb-1">
              <div className="mx-auto h-px w-6 bg-sidebar-border" />
            </div>
          )}
          {visibleAdmin.map((item) => renderLink(item, location.pathname === item.path))}
        </>
      )}
    </nav>
  )
}

export function Sidebar() {
  const { collapsed, toggle } = useSidebarStore()

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 lg:flex',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex h-16 items-center border-b border-sidebar-border',
        collapsed ? 'justify-center px-2' : 'px-5'
      )}>
        <Link to="/" className="text-sidebar-foreground font-bold truncate">
          {collapsed ? 'GS' : 'GNDJ Scout'}
        </Link>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-auto py-3">
        <NavContent collapsed={collapsed} />
      </div>

      {/* Collapse toggle */}
      <div className={cn(
        'border-t border-sidebar-border p-2',
        collapsed ? 'flex justify-center' : 'flex justify-end'
      )}>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          className="h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
  )
}

export function MobileSidebar() {
  const { mobileOpen, setMobileOpen } = useSidebarStore()

  if (!mobileOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        onClick={() => setMobileOpen(false)}
      />
      {/* Drawer */}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar lg:hidden">
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
          <span className="text-sidebar-foreground font-bold">GNDJ Scout</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(false)}
            className="h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto py-3">
          <NavContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </div>
      </aside>
    </>
  )
}
