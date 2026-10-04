import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Search, Home, Users, Star, Clock, Contact } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { useMembers, useSearchParents } from '@/services/member-service'
import { getRecentMembers, getFavoriteMembers, type RecentMember } from '@/lib/recent-members'
import { useDebounce } from '@/hooks/use-debounce'
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command'
import { Tip } from '@/components/ui/tooltip'
import { adminGroups, adminNavItems, leaderNavItems, type NavLink } from './nav-items'

// Accent- + case-insensitive normalize (so "coti" matches "Cotisations", "rentree" matches "Rentrée").
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Jump-to destinations = the same pages, labels, icons and permission gates as the menu (nav-items.ts), so the
// palette never offers a page the menu hides (or names it differently). "Accueil" (the role-aware home) first.
interface Dest { label: string; path: string; icon: React.ComponentType<{ className?: string }>; perm: string | null }
function buildDestinations(isManager: boolean): Dest[] {
  const links: NavLink[] = isManager
    ? [...adminNavItems, ...adminGroups.flatMap((g) => g.items)]
    : leaderNavItems.filter((i) => i.path !== '/dashboard')
  const seen = new Set<string>()
  const out: Dest[] = [{ label: 'Accueil', path: '/dashboard', icon: Home, perm: null }]
  for (const l of links) {
    if (seen.has(l.path)) continue
    seen.add(l.path)
    out.push({ label: l.label, path: l.path, icon: l.icon, perm: l.permission })
  }
  return out
}

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
  // Same "manager" rule as the menu (sidebar NavContent): they get the admin pages, others the leader pages.
  const isManager = !!user?.isSuperAdmin || hasPermission(PERMISSIONS.MAITRISE_MANAGE) || !!user?.unitAccess.some((u) => u.isGroupLevel)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const debounced = useDebounce(query.trim(), 300)

  // Favorites + recently-viewed members (per-device localStorage), snapshotted when the palette opens (loaded in
  // the open handlers, not an effect). Shown as quick jump-back groups while the query is empty.
  const [favorites, setFavorites] = useState<RecentMember[]>([])
  const [recent, setRecent] = useState<RecentMember[]>([])
  const openPalette = () => {
    if (canSearchMembers) { setFavorites(getFavoriteMembers()); setRecent(getRecentMembers()) }
    setOpen(true)
  }
  const showQuick = canSearchMembers && !debounced // favorites/recents only make sense with no active query
  const recentFiltered = recent.filter((r) => !favorites.some((f) => f.id === r.id)) // don't list a member twice

  // Member search — only when a leader typed ≥2 chars and the palette is open. Server-side, accent-insensitive.
  const searchable = canSearchMembers && open && debounced.length >= 2
  const { data: memberData, isFetching } = useMembers({ search: searchable ? debounced : '', pageSize: 8 })
  const members = searchable ? (memberData?.items ?? []) : []

  // Parent search — same trigger. Finds a parent by name/email/phone and returns their CHILDREN, so a leader
  // can identify whose child a mother is (e.g. she emails without naming the child). Each result jumps to the child.
  const { data: parentData, isFetching: parentsFetching } = useSearchParents(searchable ? debounced : '', searchable)
  const parents = searchable ? (parentData ?? []) : []

  // Nav destinations visible to this user, filtered by the typed query.
  const dests = useMemo(() => {
    const visible = buildDestinations(isManager).filter((d) => !d.perm || hasPermission(d.perm))
    if (!debounced) return visible
    const q = norm(debounced)
    return visible.filter((d) => norm(d.label).includes(q))
  }, [debounced, hasPermission, isManager])

  // Ctrl/⌘-K toggles the palette from anywhere. `openRef` keeps the handler's view of open current without
  // re-subscribing on every toggle; favorites/recents are loaded in the handler (an event, not an effect).
  const openRef = useRef(false)
  useEffect(() => { openRef.current = open }, [open])
  useEffect(() => {
    if (!isLeader) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (openRef.current) { setOpen(false); return }
        if (canSearchMembers) { setFavorites(getFavoriteMembers()); setRecent(getRecentMembers()) }
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isLeader, canSearchMembers])

  if (!isLeader) return null

  const go = (path: string) => { setOpen(false); setQuery(''); navigate(path) }

  return (
    <>
      {/* Header trigger: a compact magnifying-glass icon (saves space); click opens the full search dialog (Ctrl/⌘-K). */}
      <Tip content="Rechercher (Ctrl+K)">
        <button
          type="button"
          onClick={openPalette}
          aria-label="Rechercher (Ctrl+K)"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Search className="h-4 w-4" />
        </button>
      </Tip>

      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={canSearchMembers ? 'Rechercher un membre, un parent ou une page…' : 'Rechercher une page…'}
        />
        <CommandList>
          <CommandEmpty>
            {canSearchMembers && debounced.length >= 2 && (isFetching || parentsFetching) ? 'Recherche…' : 'Aucun résultat.'}
          </CommandEmpty>

          {/* Quick jump-back (no query): favorites then recents. */}
          {showQuick && favorites.length > 0 && (
            <CommandGroup heading="Favoris">
              {favorites.map((m) => (
                <CommandItem key={`fav-${m.id}`} value={`fav-${m.id}`} onSelect={() => go(`/members/${m.id}`)}>
                  <Star className="fill-amber-400 text-amber-400" />
                  <span className="flex-1 truncate">{m.name}</span>
                  {m.unit && <span className="truncate text-xs text-muted-foreground">{m.unit}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {showQuick && recentFiltered.length > 0 && (
            <CommandGroup heading="Récemment consultés">
              {recentFiltered.map((m) => (
                <CommandItem key={`recent-${m.id}`} value={`recent-${m.id}`} onSelect={() => go(`/members/${m.id}`)}>
                  <Clock className="text-muted-foreground" />
                  <span className="flex-1 truncate">{m.name}</span>
                  {m.unit && <span className="truncate text-xs text-muted-foreground">{m.unit}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

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

          {/* Parents: each row is a CHILD (that's what you're after), with the matched parent as context. */}
          {parents.length > 0 && (
            <CommandGroup heading="Enfants d'un parent">
              {parents.map((p) => (
                <CommandItem key={`parent-${p.guardianId}-${p.memberId}`} value={`parent-${p.guardianId}-${p.memberId}`} onSelect={() => go(`/members/${p.memberId}`)}>
                  <Contact className="text-muted-foreground" />
                  <span className="flex-1 truncate">
                    {p.memberName}
                    <span className="text-xs text-muted-foreground"> · enfant de {p.guardianName}</span>
                  </span>
                  {p.unitName && <span className="truncate text-xs text-muted-foreground">{p.unitName}</span>}
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
