import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Search, LayoutDashboard, Users, Inbox, ClipboardList, ArrowRightLeft, CalendarCheck, Receipt,
  FileWarning, Building2, Crown, Star, ListChecks, Newspaper, MessageSquare, Settings2, ScrollText,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { useMembers } from '@/services/member-service'
import { useDebounce } from '@/hooks/use-debounce'
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command'
import type { LucideIcon } from 'lucide-react'

// Accent- + case-insensitive normalize (so "coti" matches "Cotisations", "rentree" matches "Rentrée").
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Curated jump-to destinations (flat), each gated by a permission (null = any leader). Mirrors the main nav —
// enough to reach the frequent pages fast without duplicating the whole sidebar tree.
interface Dest { label: string; path: string; icon: LucideIcon; perm: string | null }
const DESTINATIONS: Dest[] = [
  { label: 'Tableau de bord', path: '/dashboard', icon: LayoutDashboard, perm: null },
  { label: 'Membres', path: '/members', icon: Users, perm: PERMISSIONS.MEMBERS_EDIT },
  { label: 'Rentrée scoute', path: '/rentree', icon: ListChecks, perm: PERMISSIONS.RENTREE_MANAGE },
  { label: 'Demandes d\'inscription', path: '/admin/demandes', icon: Inbox, perm: PERMISSIONS.DEMANDE_VIEW },
  { label: 'Modifications à valider', path: '/change-requests', icon: ClipboardList, perm: PERMISSIONS.MEMBERS_EDIT },
  { label: 'Validation passages', path: '/admin/passage-validation', icon: ArrowRightLeft, perm: PERMISSIONS.PASSAGE_MANAGE },
  { label: 'Réunions & absences', path: '/attendance', icon: CalendarCheck, perm: PERMISSIONS.ATTENDANCE_MANAGE },
  { label: 'Cotisations', path: '/admin/cotisations', icon: Receipt, perm: PERMISSIONS.MAITRISE_MANAGE },
  { label: 'Suivi documents', path: '/admin/documents-suivi', icon: FileWarning, perm: PERMISSIONS.MAITRISE_MANAGE },
  { label: 'Unités', path: '/units', icon: Building2, perm: PERMISSIONS.UNITS_VIEW },
  { label: 'Maîtrises', path: '/maitrises', icon: Crown, perm: PERMISSIONS.MAITRISE_MANAGE },
  { label: 'Progression scoute', path: '/admin/progression', icon: Star, perm: PERMISSIONS.PROGRESSION_MANAGE },
  { label: 'Messages de contact', path: '/admin/contact-messages', icon: MessageSquare, perm: PERMISSIONS.CONTENT_MANAGE },
  { label: 'Actualités (site public)', path: '/admin/news', icon: Newspaper, perm: PERMISSIONS.CONTENT_MANAGE },
  { label: 'Journal d\'audit', path: '/admin/audit-logs', icon: ScrollText, perm: PERMISSIONS.AUDIT_VIEW },
  { label: 'Paramètres', path: '/admin/settings', icon: Settings2, perm: PERMISSIONS.MAITRISE_MANAGE },
]

// Global quick-search / command palette (Ctrl/⌘-K). Renders a compact trigger in the header + the dialog.
// Leaders only (CU and above): a regular member has no admin pages to jump to and can't search other members
// (the members endpoint requires members.edit — a youth would get nothing). Self-contained: owns open state,
// the hotkey, and does its OWN filtering (cmdk shouldFilter=false) so async member results aren't re-filtered.
export function CommandPalette() {
  const navigate = useNavigate()
  const { hasPermission, user } = useAuthStore()
  const canSearchMembers = !!user?.isSuperAdmin || hasPermission(PERMISSIONS.MEMBERS_EDIT)
  // Leader = can edit members OR is a manager (CG/ACG/super-admin). Only they get the palette.
  const isLeader = canSearchMembers || hasPermission(PERMISSIONS.MAITRISE_MANAGE)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const debounced = useDebounce(query.trim(), 300)

  // Member search — only when a leader typed ≥2 chars and the palette is open. Server-side, accent-insensitive.
  const searchable = canSearchMembers && open && debounced.length >= 2
  const { data: memberData, isFetching } = useMembers({ search: searchable ? debounced : '', pageSize: 8 })
  const members = searchable ? (memberData?.items ?? []) : []

  // Nav destinations visible to this user, filtered by the typed query.
  const dests = useMemo(() => {
    const visible = DESTINATIONS.filter((d) => !d.perm || hasPermission(d.perm) || user?.isSuperAdmin)
    if (!debounced) return visible
    const q = norm(debounced)
    return visible.filter((d) => norm(d.label).includes(q))
  }, [debounced, hasPermission, user?.isSuperAdmin])

  // Ctrl/⌘-K toggles the palette from anywhere.
  useEffect(() => {
    if (!isLeader) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isLeader])

  if (!isLeader) return null

  const go = (path: string) => { setOpen(false); setQuery(''); navigate(path) }

  return (
    <>
      {/* Header trigger: full pill on desktop, icon-only on small screens. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Rechercher"
        className="flex shrink-0 items-center gap-2 rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white px-2 py-1.5 lg:w-56 lg:justify-start lg:border lg:border-white/20 lg:bg-white/5"
      >
        <Search className="h-4 w-4" />
        <span className="hidden lg:inline text-sm text-white/60">Rechercher…</span>
        <kbd className="ml-auto hidden rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white/50 lg:inline">Ctrl K</kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={canSearchMembers ? 'Rechercher un membre ou une page…' : 'Rechercher une page…'}
        />
        <CommandList>
          <CommandEmpty>
            {canSearchMembers && debounced.length >= 2 && isFetching ? 'Recherche…' : 'Aucun résultat.'}
          </CommandEmpty>

          {members.length > 0 && (
            <CommandGroup heading="Membres">
              {members.map((m) => (
                <CommandItem key={m.id} value={`member-${m.id}`} onSelect={() => go(`/members/${m.id}`)}>
                  <Users className="text-muted-foreground" />
                  <span className="flex-1 truncate">{m.firstName} {m.lastName}</span>
                  {m.unitName && <span className="truncate text-xs text-muted-foreground">{m.unitName}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {dests.length > 0 && (
            <CommandGroup heading="Aller à">
              {dests.map((d) => {
                const Icon = d.icon
                return (
                  <CommandItem key={d.path} value={`nav-${d.path}`} onSelect={() => go(d.path)}>
                    <Icon className="text-muted-foreground" />
                    <span className="flex-1">{d.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}
        </CommandList>
        <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          <CommandShortcut className="ml-0">Ctrl K</CommandShortcut> pour ouvrir · Entrée pour choisir
        </div>
      </CommandDialog>
    </>
  )
}
