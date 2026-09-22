import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { DndContext, DragOverlay, useDraggable, useDroppable, pointerWithin, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { useUnits } from '@/services/unit-service'
import { PERMISSIONS } from '@/lib/constants'
import { parseApiError } from '@/lib/error-utils'
import { cn } from '@/lib/utils'
import apiClient from '@/lib/api-client'
import {
  useUnitOrganization, useMovePlacements,
  type OrgMember, type OrgRole,
} from '@/services/organization-service'
import { useSettingValue } from '@/services/settings-service'
import { usePassageStatus, usePassagesByUnit, useProposePassage, type PassageDto } from '@/services/passage-service'
import { useFunctionalRoles, type FunctionalRoleDto as FunctionalRole } from '@/services/role-service'
import { LeaverContactDialog } from '@/components/passage/leaver-contact-dialog'
import { MemberPhoto } from '@/components/shared/member-photo'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { GripVertical, ArrowRightLeft, Users, Crown, Search, X, ChevronDown, ChevronRight, Check, LogOut, ClipboardList, Table2 } from 'lucide-react'

// One allowed passage move target for a member (parcours scout): kind 'same' = same branch (équipe/fonction
// change), 'up' = a progression target unit (unité supérieure). Matches the passage page's destinations endpoint.
interface PassageDestination {
  unitId: string; unitCode: string; unitName: string
  unitTypeId: string; unitTypeName: string; kind: 'same' | 'up'; reason: string
}

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
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // ── Passage (Mode B) ── When the CG has OPENED the passage, the board becomes a PROPOSAL surface: moves are
  // saved as passage proposals (nothing is applied until the CG finalizes), with branch/quitte options. When
  // passage is closed, the board is a live roster tidy (Mode A) exactly as before.
  const scoutYear = useSettingValue('passage.scout_year') ?? '2026-2027'
  const { data: passageStatus } = usePassageStatus(scoutYear)
  const proposalMode = !!passageStatus?.isOpen && !!unitId
  const { data: unitPassages } = usePassagesByUnit(proposalMode ? unitId : '', scoutYear)
  const { data: allRoles } = useFunctionalRoles()
  const proposeMutation = useProposePassage()
  // memberId → its current passage proposal line (for the row badge + popup seeding).
  const passageByMember = useMemo(
    () => new Map((unitPassages ?? []).map((p) => [p.memberId, p])),
    [unitPassages],
  )
  // Members marked "Quitte le groupe" — a queue stepped through one leaver-contact dialog at a time.
  const [leaveQueue, setLeaveQueue] = useState<OrgMember[]>([])
  const [leaveIndex, setLeaveIndex] = useState(0)
  const [proposalTarget, setProposalTarget] = useState<OrgMember | null>(null) // member the proposal popup edits
  const [generating, setGenerating] = useState(false)

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
    setProposalTarget(null)
    setLeaveQueue([])
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
    // Passage open → dragging to the center opens a proposal for that member (single); else the live move popup.
    if (proposalMode) { setProposalTarget(m); return }
    if (selected.has(m.memberId) && selected.size > 1) setPopupTargets(selectedMembers)
    else setPopupTargets([m])
  }

  // ── Proposal-mode actions (reuse the passage backend: propose single / isLeaving) ──
  // Save one member's passage proposal (unit/team/role, or isLeaving). Nothing applies until the CG finalizes.
  const savePassage = async (data: { memberId: string; proposedUnitId: string; proposedTeamId?: string | null; proposedRoleId: string; isLeaving?: boolean; cuNotes?: string | null }, msg: string) => {
    try {
      await proposeMutation.mutateAsync({ ...data, scoutYear })
      toast.success(msg)
    } catch (err) { toast.error(parseApiError(err)) }
  }
  // "Pas de changement" — propose keeping the member's current unit/team/role (auto-approved by the CG).
  const proposeNoChange = (m: OrgMember) =>
    savePassage({ memberId: m.memberId, proposedUnitId: unitId, proposedTeamId: m.teamId, proposedRoleId: m.functionalRoleId }, 'Pas de changement enregistré')
  // "Quitte le groupe" — open the leaver-contact dialog(s) first, then record the leaving line on confirm.
  const startLeaving = (members: OrgMember[]) => { if (members.length) { setLeaveQueue(members); setLeaveIndex(0); setProposalTarget(null) } }
  const currentLeaver = leaveQueue[leaveIndex] ?? null
  const confirmLeave = async (notes: string) => {
    if (!currentLeaver) return
    await savePassage({ memberId: currentLeaver.memberId, proposedUnitId: unitId, proposedTeamId: currentLeaver.teamId, proposedRoleId: currentLeaver.functionalRoleId, isLeaving: true, cuNotes: notes || null }, 'Départ enregistré')
    advanceLeaver()
  }
  const advanceLeaver = () => {
    if (leaveIndex + 1 < leaveQueue.length) setLeaveIndex((i) => i + 1)
    else { setLeaveQueue([]); setLeaveIndex(0); setSelected(new Set()) }
  }
  // Generate a "Pas de changement" proposal for every active member who has no passage line yet — satisfies the
  // CG's completeness gate in one click (each member keeps their own unit/team/role, so it's one call per member).
  const generateMissing = async () => {
    const missing = (org?.members ?? []).filter((m) => !passageByMember.has(m.memberId))
    if (missing.length === 0) { toast.info('Toutes les lignes sont déjà créées.'); return }
    setGenerating(true)
    // One call per member (each keeps its own unit/team/role — a shared bulk target can't express that).
    const results = await Promise.allSettled(missing.map((m) =>
      apiClient.post('/passages', { memberId: m.memberId, scoutYear, proposedUnitId: unitId, proposedTeamId: m.teamId, proposedRoleId: m.functionalRoleId })))
    setGenerating(false)
    const ok = results.filter((r) => r.status === 'fulfilled').length
    toast.success(`${ok} ligne(s) « Pas de changement » créée(s)${ok < missing.length ? ` · ${missing.length - ok} échec(s)` : ''}`)
    queryClient.invalidateQueries({ queryKey: ['passages'] }) // the raw posts bypass the mutation hook's invalidation
  }

  if (!user) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Organiser mon unité</h1>
          <p className="text-sm text-muted-foreground">
            {proposalMode
              ? <>Passage ouvert : vos changements sont des <b>propositions</b> (rien n'est appliqué avant la validation du chef de groupe).</>
              : <>Déplacez un membre avec le bouton <ArrowRightLeft className="inline h-3.5 w-3.5" />, en cochant plusieurs, ou en glissant un nom au centre. Enregistré immédiatement.</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {proposalMode && (
            <Button variant="outline" size="sm" onClick={() => navigate('/passage')} title="Basculer vers le tableau des passages">
              <Table2 className="mr-1 h-4 w-4" />Vue tableau
            </Button>
          )}
          {unitOptions.length > 1 && (
            <Select value={unitId} onValueChange={setSelectedUnit}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Choisir une unité" /></SelectTrigger>
              <SelectContent>
                {unitOptions.map((u) => <SelectItem key={u.unitId} value={u.unitId}>{u.unitName}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {!unitId ? (
        <EmptyState icon={Users} title="Aucune unité" description="Vous ne dirigez aucune unité à organiser." />
      ) : isLoading || !org ? (
        <LoadingSpinner variant="table" />
      ) : (
        <>
          {/* Passage proposal banner: explains the mode + one-click "generate the missing no-change lines". */}
          {proposalMode && (() => {
            const missing = (org.members ?? []).filter((m) => !passageByMember.has(m.memberId)).length
            return (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/30">
                <ClipboardList className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="text-amber-800 dark:text-amber-200">
                  Mode passage — <b>{(org.members?.length ?? 0) - missing}/{org.members?.length ?? 0}</b> ligne(s) créée(s).
                </span>
                {missing > 0 && (
                  <Button size="sm" variant="outline" className="ml-auto border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40" disabled={generating} onClick={generateMissing}>
                    <Check className="mr-1 h-4 w-4" />Générer les {missing} ligne(s) manquante(s) « Pas de changement »
                  </Button>
                )}
              </div>
            )
          })()}

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

          {/* Bulk selection bar — live moves (Mode A) vs passage proposals (Mode B). */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 px-3 py-2">
              <span className="text-sm font-medium">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
              {proposalMode ? (
                <>
                  <Button size="sm" variant="outline" className="border-green-500 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-950/40"
                    disabled={proposeMutation.isPending} onClick={async () => { for (const m of selectedMembers) await proposeNoChange(m); setSelected(new Set()) }}>
                    <Check className="mr-1 h-4 w-4" />Pas de changement
                  </Button>
                  <Button size="sm" variant="outline" className="border-orange-400 text-orange-700 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-950/40"
                    onClick={() => startLeaving(selectedMembers)}>
                    <LogOut className="mr-1 h-4 w-4" />Quitte le groupe
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => setPopupTargets(selectedMembers)}>
                  <ArrowRightLeft className="mr-1 h-4 w-4" />Déplacer la sélection
                </Button>
              )}
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
                            <MemberRow key={m.assignmentId} m={m} checked={selected.has(m.memberId)} onCheck={() => toggleSelect(m.memberId)}
                              onMove={() => proposalMode ? setProposalTarget(m) : setPopupTargets([m])}
                              proposalMode={proposalMode} proposal={passageByMember.get(m.memberId)} currentUnitId={unitId} />
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

      {/* Move popup (Mode A — live) — single or multi, keyed so it re-seeds per target set. */}
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

      {/* Proposal popup (Mode B — passage). One member; three choices: Pas de changement / Proposer / Quitte. */}
      {proposalTarget && (
        <ProposalPopup
          key={proposalTarget.assignmentId}
          m={proposalTarget}
          currentUnitId={unitId}
          currentUnitName={unitOptions.find((u) => u.unitId === unitId)?.unitName ?? ''}
          teams={teams}
          unitRoles={org?.roles ?? []}
          allRoles={allRoles ?? []}
          existing={passageByMember.get(proposalTarget.memberId)}
          busy={proposeMutation.isPending}
          onClose={() => setProposalTarget(null)}
          onNoChange={() => { proposeNoChange(proposalTarget); setProposalTarget(null) }}
          onLeave={() => startLeaving([proposalTarget])}
          onPropose={async (unitIdDest, teamId, roleId) => {
            await savePassage({ memberId: proposalTarget.memberId, proposedUnitId: unitIdDest, proposedTeamId: teamId, proposedRoleId: roleId }, 'Proposition enregistrée')
            setProposalTarget(null)
          }}
        />
      )}

      {/* Leaver-contact dialog queue (confirm/capture the leaver's personal email + phone before recording). */}
      <LeaverContactDialog
        open={!!currentLeaver}
        onOpenChange={(o) => { if (!o) { setLeaveQueue([]); setLeaveIndex(0) } }}
        memberId={currentLeaver?.memberId ?? null}
        memberName={currentLeaver ? `${currentLeaver.firstName} ${currentLeaver.lastName}` : ''}
        onConfirm={confirmLeave}
        progress={leaveQueue.length > 1 ? { current: leaveIndex + 1, total: leaveQueue.length } : undefined}
        onSkip={leaveQueue.length > 1 ? advanceLeaver : undefined}
      />
    </div>
  )
}

// The passage-proposal badge for a member (Mode B): shows what's proposed for them next year.
function ProposalBadge({ proposal, m, currentUnitId }: { proposal?: PassageDto; m: OrgMember; currentUnitId: string }) {
  const mark = proposal?.status === 'Approved' ? ' ✓' : proposal?.status === 'Rejected' ? ' ✗' : ''
  if (!proposal) return <Badge variant="outline" className="border-amber-400 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">À proposer</Badge>
  if (proposal.isLeaving) return <Badge className="bg-orange-600 text-[10px] hover:bg-orange-600">Quitte{mark}</Badge>
  const noChange = proposal.proposedUnitId === currentUnitId && proposal.proposedRoleName === m.functionalRoleName
  if (noChange) return <Badge className="bg-green-600 text-[10px] hover:bg-green-600">Pas de changement{mark}</Badge>
  return <Badge className="bg-blue-600 text-[10px] hover:bg-blue-600">→ {proposal.proposedUnitCode}{mark}</Badge>
}

// ─── One member row (checkbox + drag handle + photo + name + fonction + [proposal badge] + ⇄) ───
function MemberRow({ m, checked, onCheck, onMove, proposalMode, proposal, currentUnitId }: {
  m: OrgMember
  checked: boolean
  onCheck: () => void
  onMove: () => void
  proposalMode?: boolean
  proposal?: PassageDto
  currentUnitId?: string
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
      {proposalMode && <ProposalBadge proposal={proposal} m={m} currentUnitId={currentUnitId ?? ''} />}
      <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 sm:h-8 sm:w-8" onClick={onMove} title={proposalMode ? 'Proposer un changement' : 'Déplacer'}>
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

// ─── Proposal popup (Mode B): one member's passage choice — Pas de changement / Proposer (destination +
// équipe/fonction, parcours-driven) / Quitte le groupe. Writes a passage PROPOSAL (nothing applies until the CG
// finalizes). Reuses the passage destinations endpoint + base-role-per-type resolution from the passage page. ───
const KEEP_ROLE = '__keep__' // sentinel = keep the member's current fonction

function ProposalPopup({ m, currentUnitId, currentUnitName, teams, unitRoles, allRoles, existing, busy, onClose, onNoChange, onLeave, onPropose }: {
  m: OrgMember
  currentUnitId: string
  currentUnitName: string
  teams: Team[]
  unitRoles: OrgRole[]
  allRoles: FunctionalRole[]
  existing?: PassageDto
  busy: boolean
  onClose: () => void
  onNoChange: () => void
  onLeave: () => void
  onPropose: (unitId: string, teamId: string | null, roleId: string) => void
}) {
  const [destinations, setDestinations] = useState<PassageDestination[]>([])
  // Destination unit: seed to the existing proposal's unit (if any) else the current unit (équipe/fonction change).
  const [destUnitId, setDestUnitId] = useState<string>(existing && !existing.isLeaving ? existing.proposedUnitId : currentUnitId)
  const [teamVal, setTeamVal] = useState<string>((existing?.proposedTeamId ?? m.teamId) ?? 'none')
  const [roleId, setRoleId] = useState<string>(KEEP_ROLE)

  // Base youth role for a destination unit type (default-for-new-members, else lowest rank).
  const baseRole = (typeId: string) => {
    const list = allRoles.filter((r) => r.unitTypeId === typeId && !r.isArchived && !r.isMaitrise)
    return (list.find((r) => r.isDefaultForNewMembers) ?? [...list].sort((a, b) => a.rank - b.rank)[0])?.id ?? ''
  }

  // Load the parcours destinations once (current branch + progression targets). Ensure the current unit is present.
  useEffect(() => {
    let alive = true
    apiClient.get<PassageDestination[]>(`/unit-type-progressions/destinations/${m.memberId}`)
      .then(({ data }) => {
        if (!alive) return
        let dests = data ?? []
        if (!dests.some((d) => d.unitId === currentUnitId))
          dests = [{ unitId: currentUnitId, unitCode: '', unitName: currentUnitName, unitTypeId: '', unitTypeName: '', kind: 'same', reason: '' }, ...dests]
        setDestinations(dests)
        // If the seeded destination is an "up" unit (e.g. reopening an existing proposal), lock a valid base role.
        const d0 = dests.find((d) => d.unitId === destUnitId)
        if (d0?.kind === 'up') setRoleId(baseRole(d0.unitTypeId))
      })
      .catch(() => setDestinations([{ unitId: currentUnitId, unitCode: '', unitName: currentUnitName, unitTypeId: '', unitTypeName: '', kind: 'same', reason: '' }]))
    return () => { alive = false }
    // One-shot load per member: seed off the INITIAL destUnitId; baseRole is a stable pure helper. We intentionally
    // don't re-run when those change (destination changes are handled by changeDest).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.memberId, currentUnitId, currentUnitName])

  const dest = destinations.find((d) => d.unitId === destUnitId)
  const isCurrentUnit = destUnitId === currentUnitId
  const isUp = dest?.kind === 'up'
  const sameDests = destinations.filter((d) => d.kind === 'same')
  const upDests = destinations.filter((d) => d.kind === 'up')

  // Fonction options: an "up" move is locked to the destination type's base role (the receiving CU assigns the
  // real one later); otherwise the destination type's non-archived roles, with a "keep current fonction" option.
  const upRoles = isUp && dest ? allRoles.filter((r) => r.unitTypeId === dest.unitTypeId && !r.isArchived) : []

  // Re-seed team + fonction whenever the destination changes.
  const changeDest = (v: string) => {
    setDestUnitId(v)
    const d = destinations.find((x) => x.unitId === v)
    if (d?.kind === 'up') { setRoleId(baseRole(d.unitTypeId)); setTeamVal('none') }
    else { setRoleId(KEEP_ROLE); setTeamVal((v === currentUnitId ? m.teamId : null) ?? 'none') }
  }

  const roleFinal = () => (roleId === KEEP_ROLE ? m.functionalRoleId : roleId)
  const canApply = !!destUnitId && !!roleFinal()

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Passage — {m.firstName} {m.lastName}</DialogTitle>
        </DialogHeader>

        {/* Quick choices */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="border-green-500 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-950/40" disabled={busy} onClick={onNoChange}>
            <Check className="mr-1 h-4 w-4" />Pas de changement
          </Button>
          <Button size="sm" variant="outline" className="border-orange-400 text-orange-700 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-950/40" onClick={onLeave}>
            <LogOut className="mr-1 h-4 w-4" />Quitte le groupe
          </Button>
        </div>

        <div className="space-y-4 border-t pt-4">
          <p className="text-xs font-medium text-muted-foreground">…ou proposer un changement</p>

          {/* Destination */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Destination</label>
            <Select value={destUnitId} onValueChange={changeDest}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Même branche</SelectLabel>
                  {sameDests.map((d) => <SelectItem key={d.unitId} value={d.unitId}>{d.unitId === currentUnitId ? `${d.unitName || currentUnitName} (équipe / fonction)` : `${d.unitCode} — ${d.unitName}`}</SelectItem>)}
                </SelectGroup>
                {upDests.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Unité supérieure</SelectLabel>
                    {upDests.map((d) => <SelectItem key={d.unitId} value={d.unitId}>{d.unitCode} — {d.unitName}</SelectItem>)}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Team — only when staying in the current unit (a move to another unit: the receiving CU assigns it). */}
          {isCurrentUnit ? (
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
          ) : (
            <p className="text-xs text-muted-foreground">L'équipe sera attribuée par la maîtrise d'accueil.</p>
          )}

          {/* Fonction */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Fonction</label>
            {isUp ? (
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {upRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP_ROLE}>Garder la fonction actuelle ({m.functionalRoleName})</SelectItem>
                  {unitRoles.filter((r) => r.id !== m.functionalRoleId).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button disabled={busy || !canApply} onClick={() => onPropose(destUnitId, isCurrentUnit ? (teamVal === 'none' ? null : teamVal) : null, roleFinal())}>
            <ArrowRightLeft className="mr-1 h-4 w-4" />Enregistrer la proposition
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
