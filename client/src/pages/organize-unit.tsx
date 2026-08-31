import { useMemo, useState } from 'react'
import { DndContext, DragOverlay, useDraggable, useDroppable, pointerWithin, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { useUnits } from '@/services/unit-service'
import { PERMISSIONS } from '@/lib/constants'
import { parseApiError } from '@/lib/error-utils'
import { cn } from '@/lib/utils'
import {
  useUnitOrganization, useMovePlacements,
  type OrgMember, type OrgRole,
} from '@/services/organization-service'
import { MemberPhoto } from '@/components/shared/member-photo'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { GripVertical, ArrowRightLeft, Users, Crown, Search, X, ChevronDown, ChevronRight, Check } from 'lucide-react'

// Accent/case-insensitive normalize for the member search box.
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

// A "column" here is just a team of the unit, plus a virtual "Sans équipe" (teamId null) — used both to
// group the vertical list and as the destinations in the move popup.
interface Team { id: string | null; name: string; isMaitrise: boolean }

// "Organiser mon unité" — the CU roster board (Mode A: live roster tidy). A vertical list grouped by team;
// move members with the row's ⇄ button, by checking several + the bulk bar, or by dragging a name to the
// center drop zone — all open the same popup (choose team + fonction). Every change edits the member's
// EXISTING active assignment in place (a correction, not history — the passage rolls members forward).
export default function OrganizeUnitPage() {
  const user = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const isGroupManager = hasPermission(PERMISSIONS.MAITRISE_MANAGE)

  // Unit picker: a CU's own led units; a group manager (CG/ACG/super-admin) gets the full active-units list.
  const leaderUnits = (user?.unitAccess ?? []).filter((u) => u.isLeader && !u.isGroupLevel)
  const { data: allUnits } = useUnits({ isActive: true, pageSize: 200 })
  const unitOptions = useMemo(
    () =>
      isGroupManager
        ? (allUnits?.items ?? []).map((u) => ({ unitId: u.id, unitName: u.name }))
        : leaderUnits.map((u) => ({ unitId: u.unitId, unitName: u.unitName })),
    [isGroupManager, allUnits, leaderUnits],
  )

  const [selectedUnit, setSelectedUnit] = useState('')
  const unitId = selectedUnit || unitOptions[0]?.unitId || ''

  const { data: org, isLoading } = useUnitOrganization(unitId)
  const moveMutation = useMovePlacements(unitId)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // UI state
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set()) // checked member ids
  const [dragName, setDragName] = useState<string | null>(null)
  const [popupTargets, setPopupTargets] = useState<OrgMember[] | null>(null) // members the move popup will move

  // Reset per-unit UI when switching units (render-phase).
  const [prevUnit, setPrevUnit] = useState(unitId)
  if (unitId !== prevUnit) {
    setPrevUnit(unitId)
    setSelected(new Set())
    setCollapsed(new Set())
    setPopupTargets(null)
    setDragName(null)
  }

  const teams: Team[] = useMemo(() => {
    if (!org) return []
    return [
      ...org.teams.map((t) => ({ id: t.id as string | null, name: t.name, isMaitrise: t.isMaitrise })),
      { id: null, name: 'Sans équipe', isMaitrise: false },
    ]
  }, [org])

  const q = norm(search.trim())
  const membersOf = (teamId: string | null) =>
    (org?.members ?? []).filter((m) => m.teamId === teamId && (!q || norm(`${m.firstName} ${m.lastName}`).includes(q)))

  const selectedMembers = useMemo(() => (org?.members ?? []).filter((m) => selected.has(m.memberId)), [org, selected])

  const toggleSelect = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleTeam = (key: string) =>
    setCollapsed((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })

  // Perform the move for the popup's targets → applies one (team, fonction) to all of them.
  const applyMove = async (targets: OrgMember[], teamId: string | null, roleId: string) => {
    try {
      await moveMutation.mutateAsync(targets.map((t) => ({ assignmentId: t.assignmentId, teamId, functionalRoleId: roleId })))
      toast.success(targets.length > 1 ? `${targets.length} membres déplacés` : 'Membre déplacé')
      setPopupTargets(null)
      setSelected(new Set())
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDragName(null)
    const m = (e.active.data.current as { member: OrgMember })?.member
    if (!m || e.over?.id !== 'center-drop') return
    // If the dragged member is part of a multi-selection, move the whole selection; else just this one.
    if (selected.has(m.memberId) && selected.size > 1) setPopupTargets(selectedMembers)
    else setPopupTargets([m])
  }

  if (!user) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Organiser mon unité</h1>
          <p className="text-sm text-muted-foreground">
            Déplacez un membre avec le bouton <ArrowRightLeft className="inline h-3.5 w-3.5" />, en cochant plusieurs, ou en glissant un nom au centre. Enregistré immédiatement.
          </p>
        </div>
        {unitOptions.length > 1 && (
          <Select value={unitId} onValueChange={setSelectedUnit}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Choisir une unité" /></SelectTrigger>
            <SelectContent>
              {unitOptions.map((u) => <SelectItem key={u.unitId} value={u.unitId}>{u.unitName}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {!unitId ? (
        <EmptyState icon={Users} title="Aucune unité" description="Vous ne dirigez aucune unité à organiser." />
      ) : isLoading || !org ? (
        <LoadingSpinner variant="table" />
      ) : (
        <>
          {/* Toolbar: search + fold/unfold all */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Rechercher un membre…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 pr-8" />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Effacer">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setCollapsed(collapsed.size > 0 ? new Set() : new Set(teams.map((t) => t.id ?? 'none')))}>
              {collapsed.size > 0 ? 'Tout déplier' : 'Tout replier'}
            </Button>
          </div>

          {/* Bulk selection bar */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 px-3 py-2">
              <span className="text-sm font-medium">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
              <Button size="sm" onClick={() => setPopupTargets(selectedMembers)}>
                <ArrowRightLeft className="mr-1 h-4 w-4" />Déplacer la sélection
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Effacer</Button>
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={(e) => { const m = (e.active.data.current as { member: OrgMember })?.member; setDragName(m ? `${m.firstName} ${m.lastName}` : null) }}
            onDragEnd={onDragEnd}
          >
            <div className="overflow-hidden rounded-lg border">
              {teams.map((team) => {
                const members = membersOf(team.id)
                if (q && members.length === 0) return null
                const key = team.id ?? 'none'
                const isCollapsed = !q && collapsed.has(key)
                return (
                  <div key={key} className="border-b last:border-b-0">
                    <button type="button" onClick={() => toggleTeam(key)}
                      className={cn('flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40', team.isMaitrise && 'bg-primary/5')}>
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        {team.isMaitrise && <Crown className="h-3.5 w-3.5 text-primary" />}
                        {team.name}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">{members.length}</span>
                    </button>
                    {!isCollapsed && (
                      <ul>
                        {members.length === 0 ? (
                          <li className="px-3 py-3 text-center text-xs text-muted-foreground">Aucun membre</li>
                        ) : (
                          members.map((m) => (
                            <MemberRow key={m.assignmentId} m={m} checked={selected.has(m.memberId)} onCheck={() => toggleSelect(m.memberId)} onMove={() => setPopupTargets([m])} />
                          ))
                        )}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Center drop zone — appears while dragging a name; dropping opens the move popup. */}
            <CenterDropZone visible={!!dragName} />
            <DragOverlay>
              {dragName ? <div className="rounded-md border bg-background px-2.5 py-1.5 text-sm font-medium shadow-lg">{dragName}</div> : null}
            </DragOverlay>
          </DndContext>
        </>
      )}

      {/* Move popup — single or multi, keyed so it re-seeds per target set. */}
      {popupTargets && (
        <MovePopup
          key={popupTargets.map((t) => t.assignmentId).join(',')}
          targets={popupTargets}
          teams={teams}
          roles={org?.roles ?? []}
          busy={moveMutation.isPending}
          onClose={() => setPopupTargets(null)}
          onApply={(teamId, roleId) => applyMove(popupTargets, teamId, roleId)}
        />
      )}
    </div>
  )
}

// ─── One member row (checkbox + drag handle + photo + name + fonction + ⇄) ───
function MemberRow({ m, checked, onCheck, onMove }: {
  m: OrgMember
  checked: boolean
  onCheck: () => void
  onMove: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `m-${m.assignmentId}`, data: { member: m } })
  return (
    <li ref={setNodeRef} className={cn('flex items-center gap-2.5 border-t px-3 py-3 first:border-t-0 hover:bg-muted/20 sm:gap-2 sm:py-2', isDragging && 'opacity-40', checked && 'bg-primary/5')}>
      <input type="checkbox" checked={checked} onChange={onCheck} className="h-5 w-5 shrink-0 rounded border-input accent-primary sm:h-4 sm:w-4" aria-label="Sélectionner" />
      <button type="button" className="cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing" {...listeners} {...attributes} title="Glisser vers le centre">
        <GripVertical className="h-5 w-5 sm:h-4 sm:w-4" />
      </button>
      <MemberPhoto memberId={m.memberId} name={`${m.firstName} ${m.lastName}`} photoPath={m.photoPath} size={34} />
      {/* Name + role side by side (role right after the name, not pushed to the far right) so the fonction is
          easy to read next to who it belongs to — especially on wide screens. Role hidden on small screens. */}
      <div className="flex min-w-0 flex-1 items-baseline gap-x-2">
        <span className="min-w-0 truncate text-[15px] font-medium sm:text-sm">{m.firstName} {m.lastName}</span>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">· {m.functionalRoleName}</span>
      </div>
      <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 sm:h-8 sm:w-8" onClick={onMove} title="Déplacer">
        <ArrowRightLeft className="h-5 w-5 sm:h-4 sm:w-4" />
      </Button>
    </li>
  )
}

// ─── The center drop target that lights up during a drag ───
function CenterDropZone({ visible }: { visible: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'center-drop' })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'pointer-events-none fixed left-1/2 top-1/2 z-50 flex h-40 w-72 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border-2 border-dashed text-center text-sm font-medium transition-opacity',
        visible ? 'opacity-100' : 'opacity-0',
        isOver ? 'border-primary bg-primary/10 text-primary' : 'border-muted-foreground/40 bg-background/95 text-muted-foreground',
      )}
    >
      <span className="flex flex-col items-center gap-1">
        <ArrowRightLeft className="h-6 w-6" />
        Déposer ici pour déplacer
      </span>
    </div>
  )
}

// ─── Move popup: pick a team (+ fonction) and apply to all targets ───
function MovePopup({ targets, teams, roles, busy, onClose, onApply }: {
  targets: OrgMember[]
  teams: Team[]
  roles: OrgRole[]
  busy: boolean
  onClose: () => void
  onApply: (teamId: string | null, roleId: string) => void
}) {
  const multi = targets.length > 1
  // Seed the team: the shared team if they all match ('none' = Sans équipe); else nothing selected ('').
  const sameTeam = targets.every((t) => t.teamId === targets[0].teamId)
  const [teamVal, setTeamVal] = useState<string>(sameTeam ? (targets[0].teamId ?? 'none') : '')
  // Seed the fonction: shared fonction if they all match; else the unit's default/base role.
  const sameRole = targets.every((t) => t.functionalRoleId === targets[0].functionalRoleId)
  const defaultRole = roles.find((r) => r.isDefault)?.id ?? roles[0]?.id ?? ''
  const [roleId, setRoleId] = useState<string>(sameRole ? targets[0].functionalRoleId : defaultRole)

  // Show the current role even if archived / not in the active list (single target).
  const roleOptions = !multi && !roles.some((r) => r.id === targets[0].functionalRoleId)
    ? [{ id: targets[0].functionalRoleId, name: `${targets[0].functionalRoleName} (archivée)`, rank: 0, isMaitrise: false, isDefault: false }, ...roles]
    : roles

  const title = multi ? `Déplacer — ${targets.length} membres` : `Déplacer ${targets[0].firstName} ${targets[0].lastName}`
  const names = multi ? targets.map((t) => `${t.firstName} ${t.lastName}`).join(', ') : null

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {names && <p className="text-xs text-muted-foreground">{names}</p>}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Équipe</label>
            <div className="grid grid-cols-2 gap-1.5">
              {teams.map((t) => {
                const val = t.id ?? 'none'
                const active = teamVal === val
                return (
                  <button key={val} type="button" onClick={() => setTeamVal(val)}
                    className={cn('flex items-center justify-between rounded-md border px-2.5 py-2 text-left text-sm', active ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-muted/40')}>
                    <span className="truncate">{t.name}</span>
                    {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Fonction</label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {roleOptions.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button disabled={busy || teamVal === '' || !roleId} onClick={() => onApply(teamVal === 'none' ? null : teamVal, roleId)}>
            <ArrowRightLeft className="mr-1 h-4 w-4" />Déplacer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
