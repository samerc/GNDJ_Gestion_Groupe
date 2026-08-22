import { Link, useLocation } from 'react-router'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useRoleTheme } from '@/lib/use-is-manager'
import { useSidebarStore } from '@/stores/sidebar-store'
import { PERMISSIONS } from '@/lib/constants'
import {
  Users,
  Building2,
  LayoutDashboard,
  Shield,
  ShieldCheck,
  FolderTree,
  FileText,
  Star,
  ScrollText,
  ArrowRightLeft,
  Camera,
  Key,
  Mail,
  Settings2,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronRight,
  X,
  Receipt,
  FileWarning,
  Route,
  Compass,
  Inbox,
  Send,
  Newspaper,
  CalendarDays,
  CalendarCheck,
  Library,
  BarChart3,
  MailCheck,
  Megaphone,
  Crown,
  List,
  ListChecks,
  Tent,
  ClipboardList,
  Trash2,
  Image as ImageIcon,
  AlertTriangle,
  LayoutGrid,
  Archive,
  Ban,
  Palette,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { usePendingDemandeCount } from '@/services/demande-admin-service'
import { usePendingChangeRequestsCount } from '@/services/change-request-service'
import { APP_VERSION, BUILD_COMMIT, BUILD_DATE } from '@/lib/app-version'

export function BrandMark({ className }: { className?: string }) {
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
// Personal links every member has — shown to EVERYONE, managers included (a CG/ACG is still a member with
// their own fiche, documents and trombinoscope history). Previously these lived only in leaderNavItems, so a
// manager (who gets adminNavItems instead) had no "Ma fiche" link at all.
const personalNavItems = [
  { path: '/my-profile', label: 'Ma fiche', icon: Users, permission: null },
  { path: '/my-documents', label: 'Mes documents', icon: FileText, permission: null },
  { path: '/my-trombinoscope', label: 'Trombinoscope', icon: ImageIcon, permission: null },
]

// Ungrouped, pinned at the very top for managers — the handful of pages opened daily. Everything else lives
// in a collapsible group below (accordion), so the sidebar opens as a short list instead of a ~39-link wall.
const adminNavItems = [
  { path: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard, permission: null },
  { path: '/members', label: 'Membres', icon: Users, permission: PERMISSIONS.MEMBERS_VIEW },
]

// Unit leader nav — "Mon unité" and "Documents" only visible to CU (members.edit permission)
const leaderNavItems = [
  { path: '/dashboard', label: 'Mon unité', icon: Building2, permission: PERMISSIONS.MEMBERS_EDIT },
  { path: '/organiser', label: 'Organiser mon unité', icon: LayoutGrid, permission: PERMISSIONS.MEMBERS_EDIT },
  { path: '/change-requests', label: 'Demandes de modification', icon: ClipboardList, permission: PERMISSIONS.MEMBERS_EDIT },
  { path: '/unit-documents', label: 'Documents', icon: FileText, permission: PERMISSIONS.DOCUMENTS_APPROVE },
  { path: '/attendance', label: 'Séances', icon: CalendarCheck, permission: PERMISSIONS.ATTENDANCE_MANAGE },
  { path: '/passage', label: 'Passage des membres', icon: ArrowRightLeft, permission: PERMISSIONS.PASSAGE_PROPOSE },
  { path: '/photo-session', label: 'Session photo', icon: Camera, permission: PERMISSIONS.MEMBERS_EDIT },
  { path: '/camp', label: 'Camp BP', icon: Tent, permission: PERMISSIONS.CAMP_GRADE },
  // Rentrée = a leader checklist; regular youth members have no tasks, so gate it on members.edit
  // (leaders) like "Mon unité" rather than showing it to everyone.
  { path: '/rentree', label: 'Rentrée scoute', icon: ListChecks, permission: PERMISSIONS.MEMBERS_EDIT },
]

type AdminGroup = {
  label: string
  items: { path: string; label: string; icon: React.ComponentType<{ className?: string }>; permission: string | null }[]
}

// Task-focused groups (was a single 14-item "Gestion" junk drawer). Each renders as a collapsible accordion
// section — collapsed by default, the group holding the current route auto-expands. Ordered roughly by how
// often a manager reaches for them: day-to-day follow-up first, rarely-touched configuration/system last.
const adminGroups: AdminGroup[] = [
  {
    // Everything about the enrollment demandes lives here, in the order of the campaign workflow:
    // review → stats → applicant accounts → archive → rejection-reason config.
    label: 'Demandes',
    items: [
      { path: '/admin/demandes', label: 'Demandes', icon: Inbox, permission: PERMISSIONS.DEMANDE_VIEW },
      { path: '/admin/demande-stats', label: 'Statistiques', icon: BarChart3, permission: PERMISSIONS.DEMANDE_VIEW },
      { path: '/admin/demande-accounts', label: 'Comptes d\'inscription', icon: MailCheck, permission: PERMISSIONS.DEMANDE_VIEW },
      { path: '/admin/demande-archives', label: 'Archives', icon: Archive, permission: PERMISSIONS.DEMANDE_VIEW },
      { path: '/admin/rejection-reasons', label: 'Motifs de refus', icon: Ban, permission: PERMISSIONS.DEMANDE_MANAGE },
    ],
  },
  {
    // Ongoing follow-up that isn't demande-specific (member changes, passages, cotisations, doc reminders).
    label: 'Suivi',
    items: [
      { path: '/change-requests', label: 'Demandes de modification', icon: ClipboardList, permission: PERMISSIONS.MEMBERS_EDIT },
      { path: '/admin/passage-validation', label: 'Validation passages', icon: ArrowRightLeft, permission: PERMISSIONS.PASSAGE_MANAGE },
      { path: '/attendance', label: 'Séances & absences', icon: CalendarCheck, permission: PERMISSIONS.ATTENDANCE_MANAGE },
      { path: '/admin/cotisations', label: 'Cotisations', icon: Receipt, permission: PERMISSIONS.COTISATIONS_VIEW },
      { path: '/admin/document-reminders', label: 'Relance documents', icon: FileWarning, permission: PERMISSIONS.MAITRISE_MANAGE },
    ],
  },
  {
    label: 'Unités & maîtrise',
    items: [
      { path: '/units', label: 'Unités', icon: Building2, permission: PERMISSIONS.UNITS_VIEW },
      { path: '/organiser', label: 'Organiser une unité', icon: LayoutGrid, permission: PERMISSIONS.MAITRISE_MANAGE },
      { path: '/maitrises', label: 'Maîtrises', icon: Crown, permission: PERMISSIONS.MAITRISE_MANAGE },
      { path: '/admin/group-access', label: 'Accès maîtrise', icon: ShieldCheck, permission: PERMISSIONS.ROLES_MANAGE_GROUP },
      { path: '/admin/send-access', label: 'Envoyer les accès', icon: Key, permission: PERMISSIONS.MEMBERS_RESET_PASSWORD },
      { path: '/admin/communications', label: 'Message aux chefs', icon: Megaphone, permission: PERMISSIONS.MAITRISE_MANAGE },
    ],
  },
  {
    label: 'Camp & rentrée',
    items: [
      { path: '/rentree', label: 'Rentrée scoute', icon: ListChecks, permission: null },
      { path: '/admin/rentree-template', label: 'Modèle de rentrée', icon: ListChecks, permission: PERMISSIONS.RENTREE_MANAGE },
      { path: '/admin/camps', label: 'Camp BP', icon: Tent, permission: PERMISSIONS.CAMP_MANAGE },
    ],
  },
  {
    label: 'Configuration',
    items: [
      // Associations are set-and-forget (they never change) → not in the nav; reachable from the Paramètres page.
      { path: '/admin/unit-types', label: "Types d'unité", icon: FolderTree, permission: PERMISSIONS.UNIT_TYPES_MANAGE },
      { path: '/admin/roles', label: 'Fonctions', icon: Shield, permission: PERMISSIONS.ROLES_MANAGE },
      { path: '/admin/progression-path', label: 'Parcours scouts', icon: Route, permission: PERMISSIONS.UNIT_TYPES_MANAGE },
      { path: '/admin/progression', label: 'Progression scoute', icon: Star, permission: PERMISSIONS.PROGRESSION_MANAGE },
      { path: '/admin/document-types', label: 'Types de documents', icon: FileText, permission: PERMISSIONS.DOCUMENT_TYPES_VIEW },
      { path: '/admin/lists', label: 'Listes', icon: List, permission: PERMISSIONS.MAITRISE_MANAGE },
      // Champs personnalisés + Carte membre are set-and-forget → moved to the Paramètres page (see settings.tsx).
      { path: '/admin/report-templates', label: 'Rapports', icon: FileText, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
    ],
  },
  {
    label: 'Site public',
    items: [
      { path: '/admin/news', label: 'Actualités', icon: Newspaper, permission: PERMISSIONS.CONTENT_MANAGE },
      { path: '/admin/events', label: 'Agenda', icon: CalendarDays, permission: PERMISSIONS.CONTENT_MANAGE },
      { path: '/admin/resources', label: 'Ressources', icon: Library, permission: PERMISSIONS.CONTENT_MANAGE },
      { path: '/admin/pages', label: 'Pages', icon: FileText, permission: PERMISSIONS.CONTENT_MANAGE },
      { path: '/admin/site-texts', label: 'Textes du site', icon: FileText, permission: PERMISSIONS.CONTENT_MANAGE },
    ],
  },
  {
    label: 'Système',
    items: [
      { path: '/admin/security-profiles', label: 'Profils de sécurité', icon: ShieldCheck, permission: PERMISSIONS.ROLES_VIEW },
      { path: '/admin/email-settings', label: 'Email / SMTP', icon: Mail, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
      { path: '/admin/email-outbox', label: 'File d\'emails', icon: Send, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
      { path: '/admin/api-keys', label: 'Clés API', icon: Key, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
      { path: '/admin/audit-logs', label: 'Journal d\'audit', icon: ScrollText, permission: PERMISSIONS.AUDIT_VIEW },
      { path: '/admin/error-log', label: 'Journal des erreurs', icon: AlertTriangle, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
      { path: '/admin/deleted-members', label: 'Corbeille', icon: Trash2, permission: PERMISSIONS.MEMBERS_DELETE },
      { path: '/admin/appearance', label: 'Apparence', icon: Palette, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
      { path: '/admin/settings', label: 'Paramètres', icon: Settings2, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
    ],
  },
]

// Shared nav body for both the desktop <Sidebar> and the mobile drawer.
// Decides which nav set to show and filters every link by the current user's permissions.
function NavContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const location = useLocation()
  const { hasPermission, user } = useAuthStore()
  // Accordion open/closed state (persisted). The group containing the current route auto-expands.
  const { openGroups, toggleGroup } = useSidebarStore()
  // Pending-demande badge count — only fetched when the user can see demandes.
  const { data: pendingDemandes } = usePendingDemandeCount(hasPermission(PERMISSIONS.DEMANDE_VIEW))
  // Pending member-change-request badge — only fetched when the user can review them (members.edit).
  const { data: pendingChanges } = usePendingChangeRequestsCount(hasPermission(PERMISSIONS.MEMBERS_EDIT))

  // Super admin sees admin nav, others see leader nav
  // Managers = super-admins and Chefs de Groupe (group-level). They get the admin nav + groups,
  // each filtered to the permissions they actually hold, so a CG sees only the pages they can reach.
  // Managers (super-admin / Chef de Groupe / Assistant Chef de Groupe — any group-level role) get the admin
  // nav; individual items still filter by the user's own permissions, so an ACG only sees what they can reach.
  const isManager = !!user?.isSuperAdmin || hasPermission(PERMISSIONS.MAITRISE_MANAGE) || !!user?.unitAccess.some(u => u.isGroupLevel)
  // Personal links first (Ma fiche / Mes documents / Trombinoscope) for EVERYONE, then the role-specific nav.
  const navItems = [...personalNavItems, ...(isManager ? adminNavItems : leaderNavItems)]
  const visibleNav = navItems.filter((item) => !item.permission || hasPermission(item.permission))
  // A chef d'équipe (leads a team) who is otherwise a read-only youth has no attendance.manage permission, so
  // the "Séances" link above is filtered out — add it explicitly so they can fill their team's présences.
  if (user?.leadsTeam && !visibleNav.some((i) => i.path === '/attendance')) {
    visibleNav.push({ path: '/attendance', label: 'Séances', icon: CalendarCheck, permission: null })
  }
  const visibleAdminGroups = isManager
    ? adminGroups
        .map((group) => ({
          ...group,
          // null permission = visible to every manager (e.g. Rentrée scoute checklist).
          items: group.items.filter((item) => !item.permission || hasPermission(item.permission)),
        }))
        .filter((group) => group.items.length > 0)
    : []

  // Pending badges (demandes / change-requests) roll up onto a COLLAPSED group's header so a manager never
  // misses actionable items just because the section is folded away.
  const groupPending = (group: AdminGroup) =>
    group.items.reduce((sum, i) => {
      if (i.path === '/admin/demandes') return sum + (pendingDemandes ?? 0)
      if (i.path === '/change-requests') return sum + (pendingChanges ?? 0)
      return sum
    }, 0)

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
            ? 'bg-white/15 font-semibold text-white shadow-sm before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-white before:content-[""]'
            : 'font-medium text-white/70 hover:bg-white/10 hover:text-white'
        )}
      >
        <Icon className={cn('h-4 w-4 shrink-0 transition-colors', isActive ? 'text-white' : 'text-white/60 group-hover/nav:text-white')} />
        {!collapsed && <span>{item.label}</span>}
        {!collapsed && item.path === '/admin/demandes' && (pendingDemandes ?? 0) > 0 && (
          <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-900">{pendingDemandes}</span>
        )}
        {!collapsed && item.path === '/change-requests' && (pendingChanges ?? 0) > 0 && (
          <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-900">{pendingChanges}</span>
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

      {visibleAdminGroups.map((group) => {
        const activeInGroup = group.items.some((i) => i.path === location.pathname)
        // Icon-only sidebar: always show items (no room for accordion headers). Expanded: open if the user
        // opened it OR it holds the active route.
        const isOpen = collapsed || activeInGroup || !!openGroups[group.label]
        const pending = groupPending(group)
        return (
          <div key={group.label}>
            {!collapsed ? (
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className="mt-4 flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45 transition-colors hover:bg-white/10 hover:text-white/70"
              >
                {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                <span>{group.label}</span>
                {!isOpen && pending > 0 && (
                  <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-900">{pending}</span>
                )}
              </button>
            ) : (
              <div className="pt-3 pb-1">
                <div className="mx-auto h-px w-6 bg-white/15" />
              </div>
            )}
            {isOpen && group.items.map((item) => renderLink(item, location.pathname === item.path))}
          </div>
        )
      })}
    </nav>
  )
}

export function Sidebar() {
  const { collapsed, toggle } = useSidebarStore()
  const theme = useRoleTheme() // chrome colour by role (CU / member here — managers have no sidebar)
  // The version number is a private maintainer entry point to the changelog — shown to the super-admin only.
  const isSuperAdmin = useAuthStore((s) => !!s.user?.isSuperAdmin)
  const showVersion = !collapsed && isSuperAdmin

  return (
    <aside
      style={{ backgroundColor: theme.color }}
      className={cn(
        'hidden shrink-0 flex-col border-r border-white/10 text-white transition-all duration-200 lg:flex',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex h-16 items-center border-b border-white/10',
        collapsed ? 'justify-center px-2' : 'px-4'
      )}>
        <Link to="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
          <BrandMark className="h-9 w-9 shrink-0" />
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-bold tracking-tight text-white">GNDJ Scout</span>
              <span className="text-[11px] font-medium text-white/55">Gestion de groupe</span>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-auto py-3">
        <NavContent collapsed={collapsed} />
      </div>

      {/* Version (super-admin only) + collapse toggle */}
      <div className={cn(
        'flex items-center border-t border-white/10 p-2',
        collapsed ? 'justify-center' : showVersion ? 'justify-between' : 'justify-end'
      )}>
        {showVersion && (
          <Link
            to="/admin/changelog"
            title={`build ${BUILD_COMMIT}${BUILD_DATE ? ` · ${BUILD_DATE}` : ''}`}
            className="px-2 text-[11px] font-medium text-white/40 transition-colors hover:text-white/70"
          >
            v{APP_VERSION}
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
  )
}

export function MobileSidebar() {
  const { mobileOpen, setMobileOpen } = useSidebarStore()
  const theme = useRoleTheme() // drawer colour by role (used by everyone on mobile, incl. managers)

  if (!mobileOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        onClick={() => setMobileOpen(false)}
      />
      {/* Drawer */}
      <aside style={{ backgroundColor: theme.color }} className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col text-white lg:hidden">
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-9 w-9" />
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-bold tracking-tight text-white">GNDJ Scout</span>
              <span className="text-[11px] font-medium text-white/55">Gestion de groupe</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(false)}
            className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10"
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

// Horizontal admin nav for MANAGERS on desktop — the daily pinned links as direct buttons + one dropdown per
// admin group (pending badges roll up onto the group trigger). Rendered INSIDE the header (single top bar);
// hidden below lg (managers use the mobile hamburger drawer = MobileSidebar there). Brand + account menu live
// in the header around it.
export function AdminNav() {
  const location = useLocation()
  const { hasPermission } = useAuthStore()
  const { data: pendingDemandes } = usePendingDemandeCount(hasPermission(PERMISSIONS.DEMANDE_VIEW))
  const { data: pendingChanges } = usePendingChangeRequestsCount(hasPermission(PERMISSIONS.MEMBERS_EDIT))

  const pinned = adminNavItems.filter((i) => !i.permission || hasPermission(i.permission))
  const groups = adminGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || hasPermission(i.permission)) }))
    .filter((g) => g.items.length > 0)

  // Actionable badge count for a nav path (pending demandes / change-requests), and the group's rolled-up total.
  const badgeFor = (path: string) =>
    path === '/admin/demandes' ? (pendingDemandes ?? 0) : path === '/change-requests' ? (pendingChanges ?? 0) : 0
  const groupBadge = (g: AdminGroup) => g.items.reduce((s, i) => s + badgeFor(i.path), 0)
  const isActive = (path: string) => location.pathname === path

  const badge = (n: number) => n > 0 && <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold leading-none text-slate-900">{n}</span>

  return (
    <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto lg:flex">
      {/* Daily pinned links */}
      {pinned.map((item) => {
        const Icon = item.icon
        return (
          <Link key={item.path} to={item.path}
            className={cn('flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/40',
              isActive(item.path) ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white')}>
            <Icon className="h-4 w-4" />{item.label}
          </Link>
        )
      })}

      {/* One dropdown per admin group */}
      {groups.map((group) => {
        const activeInGroup = group.items.some((i) => i.path === location.pathname)
        return (
          <DropdownMenu key={group.label}>
            <DropdownMenuTrigger asChild>
              <button type="button"
                className={cn('flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/40 data-[state=open]:bg-white/15',
                  activeInGroup ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white')}>
                {group.label}
                {badge(groupBadge(group))}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.path)
                return (
                  <DropdownMenuItem key={item.path} asChild className={cn(active && 'bg-primary/10 focus:bg-primary/15')}>
                    <Link to={item.path} className={cn('flex items-center gap-2', active ? 'font-semibold text-primary' : '')}>
                      {/* Active item gets a left accent bar + filled row so the current page stands out clearly. */}
                      <span className={cn('h-4 w-1 shrink-0 rounded-full', active ? 'bg-primary' : 'bg-transparent')} />
                      <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'opacity-70')} />
                      <span className="flex-1">{item.label}</span>
                      {badge(badgeFor(item.path))}
                    </Link>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      })}
    </nav>
  )
}
