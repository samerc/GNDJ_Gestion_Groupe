// Navigation definitions shared by the sidebar / top bar (sidebar.tsx) and the Ctrl-K command palette, so the
// same page always has the same label, icon and permission gate everywhere.
import { PERMISSIONS } from '@/lib/constants'
import {
  Users, Building2, ShieldCheck, FolderTree, FileText, ScrollText, ArrowRightLeft, Camera, Settings2,
  Receipt, FileWarning, Route, Inbox, Send, Newspaper, CalendarDays, CalendarCheck, Library, BarChart3,
  Crown, ListChecks, Tent, ClipboardList, Trash2, AlertTriangle, LayoutGrid, Archive, MessageSquare, UserPlus,
  CalendarClock, Activity, BookOpen, User, FolderOpen, Briefcase, Award, Mail, Bell, FolderCheck,
} from 'lucide-react'

// Admin/super admin nav
// Personal links every member has — shown to EVERYONE, managers included (a CG/ACG is still a member with
// their own fiche, documents and trombinoscope history). Previously these lived only in leaderNavItems, so a
// manager (who gets adminNavItems instead) had no "Ma fiche" link at all.
export const personalNavItems = [
  { path: '/my-profile', label: 'Ma fiche', icon: User, permission: null },
  { path: '/my-documents', label: 'Mes documents', icon: FolderOpen, permission: null },
  { path: '/calendrier', label: 'Calendrier', icon: CalendarDays, permission: null },
  { path: '/my-trombinoscope', label: 'Trombinoscope', icon: Users, permission: null },
  { path: '/aide', label: 'Aide', icon: BookOpen, permission: null },
]

// Ungrouped, pinned at the very top for managers — the handful of pages opened daily. Everything else lives
// in a collapsible group below (accordion), so the sidebar opens as a short list instead of a ~39-link wall.
// NOTE: the group overview (/dashboard) is NOT pinned here — it's the "Accueil" home page, reached by clicking
// the GNDJ brand (header + sidebar logo both link to /dashboard), so it needs no dedicated menu button.
export const adminNavItems = [
  // The Rentrée checklist — the app's guided startup workflow that launches every other tool — is pinned so a
  // manager lands next to their actual to-do list.
  { path: '/rentree', label: 'Rentrée scoute', icon: ListChecks, permission: null },
  { path: '/members', label: 'Membres', icon: Users, permission: PERMISSIONS.MEMBERS_VIEW },
  // The group calendar (also in everyone's personal links).
  { path: '/calendrier', label: 'Calendrier', icon: CalendarDays, permission: null },
  // Camp BP is placed dynamically in NavContent: in the Configuration group when no camp is active (where the
  // CG sets one up), and promoted to the main menu — for everyone with access — once a camp is active.
]

// Unit leader nav — "Mon unité" and "Documents" only visible to CU (members.edit permission)
export const leaderNavItems = [
  { path: '/dashboard', label: 'Mon unité', icon: Building2, permission: PERMISSIONS.MEMBERS_EDIT },
  { path: '/organiser', label: 'Organiser mon unité', icon: LayoutGrid, permission: PERMISSIONS.MEMBERS_EDIT },
  { path: '/change-requests', label: 'Modifications à valider', icon: ClipboardList, permission: PERMISSIONS.MEMBERS_EDIT },
  { path: '/unit-documents', label: 'Documents & cotisations', icon: FolderCheck, permission: PERMISSIONS.DOCUMENTS_APPROVE },
  { path: '/attendance', label: 'Réunions & absences', icon: CalendarCheck, permission: PERMISSIONS.ATTENDANCE_MANAGE },
  { path: '/passage', label: 'Passage des membres', icon: ArrowRightLeft, permission: PERMISSIONS.PASSAGE_PROPOSE },
  { path: '/photo-session', label: 'Session photo', icon: Camera, permission: PERMISSIONS.MEMBERS_EDIT },
  { path: '/camp', label: 'Camp BP', icon: Tent, permission: PERMISSIONS.CAMP_GRADE },
  // Rentrée = a leader checklist; regular youth members have no tasks, so gate it on members.edit
  // (leaders) like "Mon unité" rather than showing it to everyone.
  { path: '/rentree', label: 'Rentrée scoute', icon: ListChecks, permission: PERMISSIONS.MEMBERS_EDIT },
  // Report builder — a CU builds + generates unit-scoped reports (managers get it in the admin nav instead).
  { path: '/admin/report-templates', label: 'Modèles de rapports', icon: FileText, permission: PERMISSIONS.MEMBERS_EDIT },
]

// A nav link. `section` groups links INSIDE a dropdown/accordion under a small sub-header (used by the merged
// "Configuration" drawer to separate Structure / Système / Paramètres); links without a section render flat.
export type NavLink = { path: string; label: string; icon: React.ComponentType<{ className?: string }>; permission: string | null; section?: string }
export type AdminGroup = {
  label: string
  items: NavLink[]
}

// Task-focused groups (was a single 14-item "Gestion" junk drawer). Each renders as a collapsible accordion
// section — collapsed by default, the group holding the current route auto-expands. Ordered roughly by how
// often a manager reaches for them: day-to-day follow-up first, rarely-touched configuration/system last.
export const adminGroups: AdminGroup[] = [
  {
    // Everything about the enrollment demandes lives here, in the order of the campaign workflow:
    // review → stats → applicant accounts → archive → rejection-reason config.
    label: 'Demandes',
    items: [
      { path: '/admin/demandes', label: 'Demandes', icon: Inbox, permission: PERMISSIONS.DEMANDE_VIEW },
      { path: '/admin/demande-stats', label: 'Statistiques', icon: BarChart3, permission: PERMISSIONS.DEMANDE_VIEW },
      { path: '/admin/demande-accounts', label: 'Comptes d\'inscription', icon: ShieldCheck, permission: PERMISSIONS.DEMANDE_VIEW },
      { path: '/admin/demande-duplicates', label: 'Doublons de demandes', icon: Users, permission: PERMISSIONS.DEMANDE_MANAGE },
      { path: '/admin/demande-archives', label: 'Archives des demandes', icon: Archive, permission: PERMISSIONS.DEMANDE_VIEW },
      // Motifs de refus moved into Paramètres → Inscriptions tab (CG-editable there).
    ],
  },
  {
    // Ongoing follow-up that isn't demande-specific (member changes, passages, cotisations, doc reminders).
    label: 'Suivi',
    items: [
      // Rentrée scoute promoted to the pinned top nav (see adminNavItems) — no longer listed here.
      { path: '/change-requests', label: 'Modifications à valider', icon: ClipboardList, permission: PERMISSIONS.MEMBERS_EDIT },
      { path: '/admin/passage-validation', label: 'Validation des passages', icon: ArrowRightLeft, permission: PERMISSIONS.PASSAGE_MANAGE },
      { path: '/attendance', label: 'Réunions & absences', icon: CalendarCheck, permission: PERMISSIONS.ATTENDANCE_MANAGE },
      { path: '/admin/cotisations', label: 'Cotisations', icon: Receipt, permission: PERMISSIONS.COTISATIONS_VIEW },
      { path: '/admin/documents-suivi', label: 'Suivi des documents', icon: FileWarning, permission: PERMISSIONS.MAITRISE_MANAGE },
      // Per-unit document matrix (same grid as a CU's "Documents", with a unit picker) for the CG/super-admin.
      { path: '/unit-documents', label: 'Documents & cotisations', icon: FolderCheck, permission: PERMISSIONS.MAITRISE_MANAGE },
      { path: '/admin/data-quality', label: 'Qualité des données', icon: ShieldCheck, permission: PERMISSIONS.MAITRISE_MANAGE },
    ],
  },
  {
    label: 'Unités & maîtrise',
    items: [
      { path: '/units', label: 'Unités', icon: Building2, permission: PERMISSIONS.UNITS_VIEW },
      { path: '/organiser', label: 'Organiser une unité', icon: LayoutGrid, permission: PERMISSIONS.MAITRISE_MANAGE },
      { path: '/maitrises', label: 'Maîtrises', icon: Crown, permission: PERMISSIONS.MAITRISE_MANAGE },
      { path: '/admin/member-groups', label: 'Groupes', icon: Users, permission: PERMISSIONS.MAITRISE_MANAGE },
      { path: '/admin/siblings', label: 'Fratries', icon: Users, permission: PERMISSIONS.MAITRISE_MANAGE },
      { path: '/admin/zero-day-assignments', label: 'Affectations à dater', icon: CalendarClock, permission: PERMISSIONS.MAITRISE_MANAGE },
      { path: '/admin/communications-acces', label: 'Emails aux chefs', icon: Send, permission: PERMISSIONS.MAITRISE_MANAGE },
      { path: '/admin/send-notification', label: 'Envoyer une notification', icon: Bell, permission: PERMISSIONS.MAITRISE_MANAGE },
      { path: '/admin/missing-logins', label: 'Comptes manquants', icon: UserPlus, permission: PERMISSIONS.MEMBERS_RESET_PASSWORD },
    ],
  },
  {
    label: 'Site public',
    items: [
      { path: '/admin/contact-messages', label: 'Messages de contact', icon: MessageSquare, permission: PERMISSIONS.CONTENT_MANAGE },
      { path: '/admin/news', label: 'Actualités', icon: Newspaper, permission: PERMISSIONS.CONTENT_MANAGE },
      { path: '/admin/events', label: 'Agenda', icon: CalendarDays, permission: PERMISSIONS.CONTENT_MANAGE },
      { path: '/admin/resources', label: 'Ressources', icon: Library, permission: PERMISSIONS.CONTENT_MANAGE },
      { path: '/admin/pages', label: 'Pages', icon: FileText, permission: PERMISSIONS.CONTENT_MANAGE },
      // Accueil & pied de page (textes du site) → Paramètres (Accueil & pied de page tab). Route still works.
    ],
  },
  {
    // ONE "Configuration" drawer — the old "Configuration" + "Système" groups merged (Option C hybrid). The
    // daily groups above are untouched; everything administrative/set-and-forget now lives behind this single
    // entry, split by `section` into sub-headers: Structure & données / Système & sécurité / Paramètres (the hub).
    label: 'Configuration',
    items: [
      // Paramètres (the settings hub) pinned at the TOP of the drawer — CG-reachable (the page filters to the
      // categories a CG may edit). No `section` so it renders as the prominent first item above the sub-groups.
      { path: '/admin/settings', label: 'Paramètres', icon: Settings2, permission: PERMISSIONS.MAITRISE_MANAGE },
      // --- Structure & données ---
      // Associations / Champs personnalisés / Carte membre are set-and-forget → reached from the Paramètres page.
      { path: '/admin/unit-types', label: "Types d'unité", icon: FolderTree, permission: PERMISSIONS.UNIT_TYPES_MANAGE, section: 'Structure & données' },
      { path: '/admin/roles', label: 'Fonctions', icon: Briefcase, permission: PERMISSIONS.ROLES_MANAGE, section: 'Structure & données' },
      { path: '/admin/progression-path', label: 'Parcours scouts', icon: Route, permission: PERMISSIONS.UNIT_TYPES_MANAGE, section: 'Structure & données' },
      { path: '/admin/progression', label: 'Progression scoute', icon: Award, permission: PERMISSIONS.PROGRESSION_MANAGE, section: 'Structure & données' },
      { path: '/admin/report-templates', label: 'Modèles de rapports', icon: FileText, permission: PERMISSIONS.MEMBERS_EDIT, section: 'Structure & données' },
      // Types de documents → Paramètres (Documents tab); Listes → Paramètres (Listes tab). Routes still work.
      // (Camp BP is NOT here — it's appended to the "Unités & maîtrise" group when no camp is active, and
      //  promoted to the main menu once a camp is active. See NavContent / AdminNav.)
      // --- Système & sécurité ---
      { path: '/admin/roles-access', label: 'Accès & permissions', icon: ShieldCheck, permission: PERMISSIONS.MAITRISE_MANAGE, section: 'Système & sécurité' },
      // Email / SMTP → Paramètres (onglet Email / SMTP). Route still works.
      { path: '/admin/email-outbox', label: 'File d\'emails', icon: Mail, permission: PERMISSIONS.ASSOCIATIONS_MANAGE, section: 'Système & sécurité' },
      // Clés API → Paramètres (Clés API tab). Route still works.
      { path: '/admin/audit-logs', label: 'Journal d\'audit', icon: ScrollText, permission: PERMISSIONS.AUDIT_VIEW, section: 'Système & sécurité' },
      { path: '/admin/error-log', label: 'Journal des erreurs', icon: AlertTriangle, permission: PERMISSIONS.ASSOCIATIONS_MANAGE, section: 'Système & sécurité' },
      { path: '/admin/system', label: 'Système', icon: Activity, permission: PERMISSIONS.ASSOCIATIONS_MANAGE, section: 'Système & sécurité' },
      { path: '/admin/sessions', label: 'Sessions actives', icon: Users, permission: PERMISSIONS.ASSOCIATIONS_MANAGE, section: 'Système & sécurité' },
      { path: '/admin/deleted-members', label: 'Corbeille', icon: Trash2, permission: PERMISSIONS.MEMBERS_DELETE, section: 'Système & sécurité' },
      // Apparence → Paramètres (Apparence tab). Route still works.
    ],
  },
]

// Demandes placement follows the demande period. While it's running (inscriptions open, or demandes not yet
// closed with "Clôturer les demandes") the full Demandes group is shown. Once closed, its pages are empty —
// only the archive still holds anything — so the group is hidden and "Archives des demandes" moves into
// Configuration (Structure & données) until inscriptions are reopened. `active` undefined (status not loaded
// yet / no demande.view) keeps the normal layout.
export function placeDemandes(groups: AdminGroup[], active: boolean | undefined): AdminGroup[] {
  if (active !== false) return groups
  return groups
    .filter((g) => g.label !== 'Demandes')
    .map((g) => {
      if (g.label !== 'Configuration') return g
      const items = [...g.items]
      // Insert after the last "Structure & données" link so it sits with the other reference pages.
      let at = -1
      items.forEach((it, i) => { if (it.section === 'Structure & données') at = i })
      items.splice(at + 1, 0, { path: '/admin/demande-archives', label: 'Archives des demandes', icon: Archive, permission: PERMISSIONS.DEMANDE_VIEW, section: 'Structure & données' })
      return { ...g, items }
    })
}

