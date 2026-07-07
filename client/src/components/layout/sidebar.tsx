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
  Camera,
  Key,
  ListPlus,
  CreditCard,
  Mail,
  Settings2,
  ChevronsLeft,
  ChevronsRight,
  X,
  Receipt,
  Route,
  Compass,
  Inbox,
  Newspaper,
  CalendarDays,
  BarChart3,
  Crown,
  MapPin,
  ListChecks,
  Tent,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePendingDemandeCount } from '@/services/demande-admin-service'

function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-lg bg-gradient-to-br from-sidebar-primary to-accent text-white shadow-sm ring-1 ring-white/10',
        className
      )}
    >
      <Compass className="h-[55%] w-[55%]" strokeWidth={2.2} />
    </div>
  )
}

// Admin/super admin nav
const adminNavItems = [
  { path: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard, permission: null },
  { path: '/members', label: 'Membres', icon: Users, permission: PERMISSIONS.MEMBERS_VIEW },
  { path: '/units', label: 'Unités', icon: Building2, permission: PERMISSIONS.UNITS_VIEW },
  { path: '/rentree', label: 'Rentrée scoute', icon: ListChecks, permission: null },
]

// Unit leader nav — "Mon unité" and "Documents" only visible to CU (members.edit permission)
const leaderNavItems = [
  { path: '/my-profile', label: 'Ma fiche', icon: Users, permission: null },
  { path: '/my-documents', label: 'Mes documents', icon: FileText, permission: null },
  { path: '/dashboard', label: 'Mon unité', icon: Building2, permission: PERMISSIONS.MEMBERS_EDIT },
  { path: '/unit-documents', label: 'Documents', icon: FileText, permission: PERMISSIONS.DOCUMENTS_APPROVE },
  { path: '/passage', label: 'Passage des membres', icon: ArrowRightLeft, permission: PERMISSIONS.PASSAGE_PROPOSE },
  { path: '/photo-session', label: 'Session photo', icon: Camera, permission: PERMISSIONS.MEMBERS_EDIT },
  { path: '/camp', label: 'Camp BP', icon: Tent, permission: PERMISSIONS.CAMP_GRADE },
  { path: '/rentree', label: 'Rentrée scoute', icon: ListChecks, permission: null },
]

type AdminGroup = {
  label: string
  items: { path: string; label: string; icon: React.ComponentType<{ className?: string }>; permission: string }[]
}

const adminGroups: AdminGroup[] = [
  {
    label: 'Données scouts',
    items: [
      { path: '/admin/associations', label: 'Associations', icon: Landmark, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
      { path: '/admin/unit-types', label: "Types d'unité", icon: FolderTree, permission: PERMISSIONS.UNIT_TYPES_MANAGE },
      { path: '/admin/roles', label: 'Fonctions', icon: Shield, permission: PERMISSIONS.ROLES_MANAGE },
      { path: '/admin/progression', label: 'Progression scoute', icon: Star, permission: PERMISSIONS.PROGRESSION_MANAGE },
      { path: '/admin/document-types', label: 'Types de documents', icon: FileText, permission: PERMISSIONS.DOCUMENT_TYPES_VIEW },
      { path: '/admin/progression-path', label: 'Parcours scouts', icon: Route, permission: PERMISSIONS.UNIT_TYPES_MANAGE },
      { path: '/admin/custom-fields', label: 'Champs personnalisés', icon: ListPlus, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
    ],
  },
  {
    label: 'Gestion',
    items: [
      { path: '/maitrises', label: 'Maîtrises', icon: Crown, permission: PERMISSIONS.MAITRISE_MANAGE },
      { path: '/admin/group-access', label: 'Accès maîtrise', icon: ShieldCheck, permission: PERMISSIONS.ROLES_MANAGE_GROUP },
      { path: '/admin/cities', label: 'Villes', icon: MapPin, permission: PERMISSIONS.MAITRISE_MANAGE },
      { path: '/admin/rentree-template', label: 'Modèle de rentrée', icon: ListChecks, permission: PERMISSIONS.RENTREE_MANAGE },
      { path: '/admin/camps', label: 'Camp BP', icon: Tent, permission: PERMISSIONS.CAMP_MANAGE },
      { path: '/admin/passage-validation', label: 'Validation passages', icon: ArrowRightLeft, permission: PERMISSIONS.PASSAGE_MANAGE },
      { path: '/admin/demandes', label: "Demandes d'inscription", icon: Inbox, permission: PERMISSIONS.DEMANDE_VIEW },
      { path: '/admin/demande-stats', label: 'Statistiques demandes', icon: BarChart3, permission: PERMISSIONS.DEMANDE_VIEW },
      { path: '/admin/cotisations', label: 'Cotisations', icon: Receipt, permission: PERMISSIONS.COTISATIONS_VIEW },
      { path: '/admin/card-designer', label: 'Carte membre', icon: CreditCard, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
      { path: '/admin/report-templates', label: 'Rapports', icon: FileText, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
    ],
  },
  {
    label: 'Site public',
    items: [
      { path: '/admin/news', label: 'Actualités', icon: Newspaper, permission: PERMISSIONS.CONTENT_MANAGE },
      { path: '/admin/events', label: 'Agenda', icon: CalendarDays, permission: PERMISSIONS.CONTENT_MANAGE },
      { path: '/admin/pages', label: 'Pages', icon: FileText, permission: PERMISSIONS.CONTENT_MANAGE },
      { path: '/admin/site-texts', label: 'Textes du site', icon: FileText, permission: PERMISSIONS.CONTENT_MANAGE },
    ],
  },
  {
    label: 'Administration',
    items: [
      { path: '/admin/security-profiles', label: 'Profils de sécurité', icon: ShieldCheck, permission: PERMISSIONS.ROLES_VIEW },
      { path: '/admin/email-settings', label: 'Email / SMTP', icon: Mail, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
      { path: '/admin/api-keys', label: 'Clés API', icon: Key, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
      { path: '/admin/audit-logs', label: 'Journal d\'audit', icon: ScrollText, permission: PERMISSIONS.AUDIT_VIEW },
      { path: '/admin/settings', label: 'Paramètres', icon: Settings2, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
    ],
  },
]

// Shared nav body for both the desktop <Sidebar> and the mobile drawer.
// Decides which nav set to show and filters every link by the current user's permissions.
function NavContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const location = useLocation()
  const { hasPermission, user } = useAuthStore()
  // Pending-demande badge count — only fetched when the user can see demandes.
  const { data: pendingDemandes } = usePendingDemandeCount(hasPermission(PERMISSIONS.DEMANDE_VIEW))

  // Super admin sees admin nav, others see leader nav
  // Managers = super-admins and Chefs de Groupe (group-level). They get the admin nav + groups,
  // each filtered to the permissions they actually hold, so a CG sees only the pages they can reach.
  const isManager = !!user?.isSuperAdmin || hasPermission(PERMISSIONS.MAITRISE_MANAGE)
  const navItems = isManager ? adminNavItems : leaderNavItems
  const visibleNav = navItems.filter((item) => !item.permission || hasPermission(item.permission))
  const visibleAdminGroups = isManager
    ? adminGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => hasPermission(item.permission)),
        }))
        .filter((group) => group.items.length > 0)
    : []

  const renderLink = (item: { path: string; label: string; icon: React.ComponentType<{ className?: string }>; permission: string | null }, isActive: boolean) => {
    const Icon = item.icon
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={onNavigate}
        className={cn(
          'group/nav relative flex items-center rounded-md text-sm transition-all duration-150',
          collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2',
          isActive
            ? 'bg-sidebar-accent font-semibold text-white shadow-sm before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-accent before:content-[""]'
            : 'font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-white'
        )}
      >
        <Icon className={cn('h-4 w-4 shrink-0 transition-colors', isActive ? 'text-accent' : 'text-sidebar-foreground/60 group-hover/nav:text-white')} />
        {!collapsed && <span>{item.label}</span>}
        {!collapsed && item.path === '/admin/demandes' && (pendingDemandes ?? 0) > 0 && (
          <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">{pendingDemandes}</span>
        )}
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

      {visibleAdminGroups.map((group) => (
        <div key={group.label}>
          {!collapsed ? (
            <div className="pt-5 pb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/45">
              {group.label}
            </div>
          ) : (
            <div className="pt-3 pb-1">
              <div className="mx-auto h-px w-6 bg-sidebar-border" />
            </div>
          )}
          {group.items.map((item) => renderLink(item, location.pathname === item.path))}
        </div>
      ))}
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
        collapsed ? 'justify-center px-2' : 'px-4'
      )}>
        <Link to="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
          <BrandMark className="h-9 w-9 shrink-0" />
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-bold tracking-tight text-white">GNDJ Scout</span>
              <span className="text-[11px] font-medium text-sidebar-foreground/55">Gestion de groupe</span>
            </div>
          )}
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
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-9 w-9" />
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-bold tracking-tight text-white">GNDJ Scout</span>
              <span className="text-[11px] font-medium text-sidebar-foreground/55">Gestion de groupe</span>
            </div>
          </div>
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
