import { useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useSettingValue } from '@/services/settings-service'
import {
  usePassagesByUnit,
  usePassageStatus,
  useProposePassage,
  useBulkProposePassage,
  useDeletePassage,
  usePassageUnitStatus,
  useSubmitPassageUnit,
  type PassageDto,
} from '@/services/passage-service'
import { useMembers } from '@/services/member-service'
import { useAssignments } from '@/services/assignment-service'
import { useUnits } from '@/services/unit-service'
import { useTeams, teamsForSelect } from '@/services/team-service'
import { useFunctionalRoles } from '@/services/role-service'
import apiClient from '@/lib/api-client'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLeaderUnits } from '@/hooks/use-leader-units'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LeaverContactDialog } from '@/components/passage/leaver-contact-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { SearchInput } from '@/components/shared/search-input'
import { ArrowRightLeft, Check, Trash2, Users, ArrowRight, LogOut, ArrowUpDown, Pencil, LayoutGrid, Lock, Flag, ShieldAlert } from 'lucide-react'
import { Callout } from '@/components/shared/callout'
import { useNavigate } from 'react-router'
import { cn, computeAge } from '@/lib/utils'
import { toast } from 'sonner'

// One allowed move target for a member, from the parcours scout: kind 'same' = stay in the branch
// (équipe/fonction change), kind 'up' = a progression target unit (unité supérieure).
interface PassageDestination {
  unitId: string
  unitCode: string
  unitName: string
  unitTypeId: string
  unitTypeName: string
  kind: 'same' | 'up'
  reason: string
}

interface MemberRow {
  memberId: string
  memberName: string
  cardNumber: string | null
  dateOfBirth: string | null
  age: number | null
  currentUnitId: string
  currentUnitName: string
  currentUnitCode: string
  currentTeamName: string | null
  currentRoleName: string
  currentRoleId: string
  currentTeamId: string | null
  passage: PassageDto | null
}


type SortCol = 'name' | 'age' | 'unit' | 'team' | 'role' | 'status'

// Bucket a row for the status filter: no proposal yet ("todo"), changed by the CG, leaving, or its status.
function rowState(row: MemberRow): string {
  if (!row.passage) return 'todo'
  if (row.passage.cgModified) return 'modified'
  if (row.passage.finalIsLeaving ?? row.passage.isLeaving) return 'leaving'
  return row.passage.status.toLowerCase()
}

// "Passage annuel" — chef d'unité (CU) screen. Lists the CU's active members for the upcoming scout year so
// the CU can submit a passage line for each: "Pas de changement", "Proposer" a move (équipe/fonction or up
// to a higher unit via the parcours scout), or "Quitte le groupe". Lines staying in the unit and departures
// are accepted automatically; a move to another unit waits for the CG, who may change it (the CU then sees the
// CG's decision + reason and can no longer edit that line). When every member has a line the CU clicks
// "Terminer le passage de l'unité": the whole unit is then locked for them (only the CG changes it). Only
// visible while the CG has OPENED the passage process. Card list on mobile, table on desktop.
export default function PassagePage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const passageScoutYear = useSettingValue('passage.scout_year') ?? '2026-2027'
  // Units this leader runs (CU/ACU). A CU leading >1 unit gets a picker below; before, the page was hardcoded
  // to unitAccess[0] so a multi-unit CU could only ever act on their first unit.
  const leaderUnits = useLeaderUnits()
  const [selectedUnit, setSelectedUnit] = useState('')
  const unitId = selectedUnit || leaderUnits[0]?.unitId || user?.unitAccess[0]?.unitId || ''
  const unitName = leaderUnits.find(u => u.unitId === unitId)?.unitName
    ?? user?.unitAccess.find(u => u.unitId === unitId)?.unitName ?? ''

  const { data: passageStatus, isLoading: statusLoading } = usePassageStatus(passageScoutYear)
  const { data: passages, isLoading: passagesLoading } = usePassagesByUnit(unitId, passageScoutYear)
  const { data: membersData, isLoading: membersLoading } = useMembers({ unitId, pageSize: 500 })
  const { data: assignmentsData } = useAssignments({ unitId, isActive: true, pageSize: 500 })
  const { data: unitsData } = useUnits({ isActive: true, pageSize: 100 })
  const { data: rolesData } = useFunctionalRoles()

  const proposeMutation = useProposePassage()
  const bulkProposeMutation = useBulkProposePassage()
  const deleteMutation = useDeletePassage()
  const submitUnitMutation = useSubmitPassageUnit()
  const { data: unitStatus } = usePassageUnitStatus(unitId, passageScoutYear)
  // Finished by the CU: the unit is locked for them (the CG plans per unit); only the CG changes it now.
  const unitLocked = !!unitStatus?.submitted
  const [confirmSubmit, setConfirmSubmit] = useState(false)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [proposeDialogOpen, setProposeDialogOpen] = useState(false)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [bulkMode, setBulkMode] = useState<'same' | 'move'>('same')
  const [editingMember, setEditingMember] = useState<MemberRow | null>(null)
  const [deletingPassage, setDeletingPassage] = useState<PassageDto | null>(null)
  // Members being marked "Quitte le groupe" — a queue the CU steps through one leaver-contact dialog at a time
  // (single "Quitte le groupe" = a queue of one; bulk = all selected members). leaveIndex is the current one.
  const [leaveQueue, setLeaveQueue] = useState<MemberRow[]>([])
  const [leaveIndex, setLeaveIndex] = useState(0)

  // Rows the CU has re-opened to change a proposal that's not yet finalized (see renderProposition).
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set())
  const startEditRow = (id: string) => setEditingRows(s => new Set(s).add(id))
  const stopEditRow = (id: string) => setEditingRows(s => { const n = new Set(s); n.delete(id); return n })

  // Search / filter / sort for the member table
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortCol>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Form state for propose dialog
  const [propUnitId, setPropUnitId] = useState('')
  const [propTeamId, setPropTeamId] = useState<string>('')
  const [propRoleId, setPropRoleId] = useState('')
  const [propNotes, setPropNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [suggestionHint, setSuggestionHint] = useState<string | null>(null)
  const [destinations, setDestinations] = useState<PassageDestination[]>([])

  const units = unitsData?.items ?? []
  const roles = rolesData ?? []

  // Teams of the destination unit currently chosen in the propose dialog (only relevant when staying in-unit).
  const { data: teamsData } = useTeams({ unitId: propUnitId || undefined, pageSize: 100 })
  const teams = teamsForSelect(teamsData?.items) // Maîtrise first, then the rest

  // Join members with their active assignment (current unit/team/role) and any existing passage proposal.
  const memberRows: MemberRow[] = useMemo(() => {
    const members = membersData?.items ?? []
    const assignments = assignmentsData?.items ?? []
    const passageMap = new Map((passages ?? []).map(p => [p.memberId, p]))
    // Resolve unit short-codes (e.g. "C3") from the loaded units list — the assignment DTO only has the name.
    const unitCodeById = new Map((unitsData?.items ?? []).map(u => [u.id, u.code]))

    return members.map(m => {
      const assignment = assignments.find(a => a.memberId === m.id)
      const cuId = assignment?.unitId ?? unitId
      return {
        memberId: m.id,
        memberName: `${m.firstName} ${m.lastName}`,
        cardNumber: m.cardNumber,
        dateOfBirth: m.dateOfBirth,
        age: computeAge(m.dateOfBirth),
        currentUnitId: cuId,
        currentUnitName: assignment?.unitName ?? unitName,
        currentUnitCode: unitCodeById.get(cuId) ?? assignment?.unitName ?? unitName,
        currentTeamName: assignment?.teamName ?? null,
        currentRoleName: assignment?.functionalRoleName ?? '-',
        currentRoleId: assignment?.functionalRoleId ?? '',
        currentTeamId: assignment?.teamId ?? null,
        passage: passageMap.get(m.id) ?? null,
      }
    })
  }, [membersData, assignmentsData, passages, unitsData, unitId, unitName])

  // Apply the search box, the status filter, and the active column sort.
  const displayRows = useMemo(() => {
    let rows = memberRows
    const q = search.trim().toLowerCase()
    if (q) rows = rows.filter(r => r.memberName.toLowerCase().includes(q) || (r.cardNumber?.toLowerCase().includes(q) ?? false))
    if (statusFilter !== 'all') rows = rows.filter(r => rowState(r) === statusFilter)
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      switch (sortBy) {
        case 'age': return ((a.age ?? 999) - (b.age ?? 999)) * dir
        case 'unit': return a.currentUnitCode.localeCompare(b.currentUnitCode) * dir
        case 'team': return (a.currentTeamName ?? 'zzz').localeCompare(b.currentTeamName ?? 'zzz') * dir
        case 'role': return a.currentRoleName.localeCompare(b.currentRoleName) * dir
        case 'status': return rowState(a).localeCompare(rowState(b)) * dir
        default: return a.memberName.localeCompare(b.memberName) * dir
      }
    })
  }, [memberRows, search, statusFilter, sortBy, sortDir])

  const isLoading = statusLoading || passagesLoading || membersLoading

  if (isLoading) return <LoadingSpinner variant="table" />

  // Gate: the CU can only act while the CG has opened the passage process for this year.
  if (!passageStatus?.isOpen) {
    return (
      <Page>
        <PageHeader title="Passage annuel" icon={ArrowRightLeft} />
        <Card>
          <CardContent className="py-4">
            <EmptyState
              icon={ArrowRightLeft}
              title="Le processus de passage n'est pas encore ouvert"
              description="Contactez la Maîtrise de Groupe pour démarrer le passage."
            />
          </CardContent>
        </Card>
      </Page>
    )
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Select-all operates on the currently VISIBLE (filtered/searched) rows.
  const toggleAll = () => {
    const ids = displayRows.map(m => m.memberId)
    const allSelected = ids.length > 0 && ids.every(id => selected.has(id))
    setSelected(allSelected ? new Set() : new Set(ids))
  }

  const toggleSort = (col: SortCol) => {
    if (sortBy === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(col); setSortDir('asc') }
  }

  // Clickable sortable column header.
  const sortTh = (col: SortCol, label: string) => (
    <th className="px-3 py-2 text-left font-medium">
      <button type="button" onClick={() => toggleSort(col)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        <ArrowUpDown className={cn('h-3 w-3', sortBy === col ? 'opacity-80' : 'opacity-30')} />
      </button>
    </th>
  )

  // The base youth role of a unit type = the fonction a new arrival gets (e.g. Meute → Louveteau,
  // Troupe → Éclaireur): the explicit "défaut pour les nouveaux membres" role, else the lowest-rank
  // non-archived, non-maîtrise one. Used when a member moves UP the parcours — they start at the bottom.
  const baseRoleForType = (type: string | undefined | null) => {
    const list = roles.filter(r => !r.isArchived && !r.isMaitrise && (type ? r.unitTypeId === type : true))
    return list.find(r => r.isDefaultForNewMembers) ?? [...list].sort((a, b) => a.rank - b.rank)[0]
  }

  const openPropose = async (row: MemberRow) => {
    setEditingMember(row)
    setPropTeamId(row.passage?.proposedTeamId ?? row.currentTeamId ?? '')
    setPropRoleId(row.passage?.proposedRoleName ? roles.find(r => r.name === row.passage?.proposedRoleName)?.id ?? row.currentRoleId : row.currentRoleId)
    setPropNotes(row.passage?.cuNotes ?? '')
    setFormError('')
    setSuggestionHint(null)

    // Load the allowed destinations from the parcours scout (current branch + progression targets).
    setDestinations([])
    try {
      const { data: dests } = await apiClient.get<PassageDestination[]>(`/unit-type-progressions/destinations/${row.memberId}`)
      setDestinations(dests ?? [])
      const up = (dests ?? []).filter(d => d.kind === 'up')
      if (up.length > 0) setSuggestionHint(`Parcours scout : ${up.map(d => d.unitTypeName).join(', ')} (unité supérieure)`)
    } catch { /* destinations are optional */ }

    // Default the destination to the member's current unit (changement d'équipe/fonction); the CU can
    // switch to the unité supérieure from the grouped dropdown.
    setPropUnitId(row.passage?.proposedUnitId ?? row.currentUnitId)

    setProposeDialogOpen(true)
  }

  const handlePropose = async () => {
    if (!editingMember || !propUnitId || !propRoleId) {
      setFormError('Veuillez remplir tous les champs obligatoires.')
      return
    }
    try {
      await proposeMutation.mutateAsync({
        memberId: editingMember.memberId,
        scoutYear: passageScoutYear,
        proposedUnitId: propUnitId,
        proposedTeamId: propTeamId || null,
        proposedRoleId: propRoleId,
        cuNotes: propNotes || null,
      })
      toast.success('Proposition enregistrée')
      stopEditRow(editingMember.memberId)
      setProposeDialogOpen(false)
    } catch (err) {
      setFormError(parseApiError(err))
    }
  }

  const openBulk = async (mode: 'same' | 'move') => {
    setBulkMode(mode)
    setDestinations([])
    if (mode === 'same') {
      // For "no change", we'll use the first selected member's current unit
      const firstSelected = memberRows.find(m => selected.has(m.memberId))
      if (firstSelected) {
        setPropUnitId(firstSelected.currentUnitId)
        setPropRoleId(firstSelected.currentRoleId)
        setPropTeamId(firstSelected.currentTeamId ?? '')
      }
    } else {
      setPropUnitId('')
      setPropTeamId('')
      setPropRoleId('')
      // Load the parcours destinations so the bulk "Déplacer vers…" picker matches the single-member
      // dialog (Même branche / Unité supérieure) instead of listing every unit + every function. All
      // selected members are in the same unit, so they share the same branch/progression targets — fetch
      // for the first one.
      const firstSelected = memberRows.find(m => selected.has(m.memberId))
      if (firstSelected) {
        try {
          const { data: dests } = await apiClient.get<PassageDestination[]>(`/unit-type-progressions/destinations/${firstSelected.memberId}`)
          setDestinations(dests ?? [])
        } catch { /* destinations are optional — falls back to all units */ }
      }
    }
    setPropNotes('')
    setFormError('')
    setBulkDialogOpen(true)
  }

  const handleBulk = async () => {
    if (!propUnitId || !propRoleId) {
      setFormError('Veuillez remplir tous les champs obligatoires.')
      return
    }
    try {
      const result = await bulkProposeMutation.mutateAsync({
        memberIds: Array.from(selected),
        scoutYear: passageScoutYear,
        proposedUnitId: propUnitId,
        proposedTeamId: propTeamId || null,
        proposedRoleId: propRoleId,
        cuNotes: propNotes || null,
      })
      toast.success(`${result.count} proposition(s) enregistree(s)`)
      setBulkDialogOpen(false)
      setSelected(new Set())
    } catch (err) {
      setFormError(parseApiError(err))
    }
  }

  const handleBulkDelete = async () => {
    const passagesToDelete = memberRows.filter(m => selected.has(m.memberId) && m.passage).map(m => m.passage!)
    let count = 0
    for (const p of passagesToDelete) {
      try {
        await deleteMutation.mutateAsync(p.id)
        count++
      } catch { /* skip */ }
    }
    if (count > 0) toast.success(`${count} proposition(s) supprimée(s)`)
    setSelected(new Set())
  }

  const handleDelete = async () => {
    if (!deletingPassage) return
    try {
      await deleteMutation.mutateAsync(deletingPassage.id)
      toast.success('Proposition supprimée')
      setDeletingPassage(null)
    } catch (err) {
      toast.error(parseApiError(err))
      setDeletingPassage(null)
    }
  }

  // Colored status pill for a proposal; an approved proposal that keeps the same unit+role reads as
  // "Pas de changement" rather than "Accepté".
  const statusBadge = (passage: PassageDto) => {
    if (passage.status === 'Finalized') return <Badge className="bg-blue-600">Publié</Badge>
    if (passage.cgModified) return <Badge className="bg-amber-600 text-white">Modifié par le CG</Badge>
    if (passage.finalIsLeaving ?? passage.isLeaving) return <Badge className="bg-orange-600">Quitte le groupe</Badge>
    switch (passage.status) {
      case 'Approved': return <Badge className="bg-green-600">{passage.proposedUnitId === passage.currentUnitId && passage.proposedRoleName === passage.currentRoleName && (passage.proposedTeamName ?? null) === (passage.currentTeamName ?? null) ? 'Pas de changement' : 'Accepté'}</Badge>
      default: return <Badge className="bg-yellow-500 text-white">En attente du CG</Badge>
    }
  }

  // The CG's decision on a line they changed: "Quitte le groupe" or unit / équipe · fonction.
  const decisionText = (p: PassageDto) =>
    (p.finalIsLeaving ?? p.isLeaving)
      ? 'Quitte le groupe'
      : `${p.finalUnitName ?? p.proposedUnitName}${p.finalTeamName ? ` / ${p.finalTeamName}` : ''} · ${p.finalRoleName ?? p.proposedRoleName}`

  // One-click "Pas de changement": propose keeping the member's current unit/team/role (auto-approved by CG).
  const handleNoChange = async (row: MemberRow) => {
    try {
      await proposeMutation.mutateAsync({
        memberId: row.memberId, scoutYear: passageScoutYear,
        proposedUnitId: row.currentUnitId, proposedTeamId: row.currentTeamId,
        proposedRoleId: row.currentRoleId, cuNotes: null,
      })
      toast.success('Pas de changement enregistré')
      stopEditRow(row.memberId)
    } catch (err) { toast.error(parseApiError(err)) }
  }

  // "Quitte le groupe": open the leaver-contact dialog first (confirm/capture personal email + phone so the
  // group can re-contact them next year), then record the departure. Single member = a queue of one.
  const handleLeaving = (row: MemberRow) => { setLeaveQueue([row]); setLeaveIndex(0) }

  // Bulk "Quitte le groupe": step through the selected members' contact dialogs one at a time.
  const openBulkLeave = () => {
    const rows = memberRows.filter(m => selected.has(m.memberId))
    if (rows.length === 0) return
    setLeaveQueue(rows)
    setLeaveIndex(0)
  }

  const currentLeaver = leaveQueue[leaveIndex] ?? null

  // Advance to the next leaver, or close the wizard when done (clearing the selection for a bulk run).
  const advanceLeave = () => {
    if (leaveIndex + 1 < leaveQueue.length) {
      setLeaveIndex(i => i + 1)
    } else {
      if (leaveQueue.length > 1) setSelected(new Set())
      setLeaveQueue([])
      setLeaveIndex(0)
    }
  }

  // Called by the LeaverContactDialog once the contact is saved: records the leaving passage line (always needs
  // CG review; the member becomes alumni on finalize), then advances. Throws on error so the dialog stays open.
  const submitLeaving = async (notes: string) => {
    if (!currentLeaver) return
    await proposeMutation.mutateAsync({
      memberId: currentLeaver.memberId, scoutYear: passageScoutYear,
      proposedUnitId: currentLeaver.currentUnitId, proposedTeamId: currentLeaver.currentTeamId,
      proposedRoleId: currentLeaver.currentRoleId, cuNotes: notes || null, isLeaving: true,
    })
    toast.success('Départ enregistré')
    stopEditRow(currentLeaver.memberId)
    advanceLeave()
  }

  // A line stays editable by the CU until the unit is finished ("Terminer") — unless the CG changed it (then
  // only the CG can). The pencil (re-opens the three choices) shows only when editable AND not already editing.
  const canChangeRow = (row: MemberRow) =>
    !!row.passage && !unitLocked && !row.passage.cgModified && row.passage.status !== 'Finalized'
  const canEditRow = (row: MemberRow) => canChangeRow(row) && !editingRows.has(row.memberId)

  // Proposition cell/section — shared by the desktop table and the mobile cards.
  const renderProposition = (row: MemberRow) => {
    const showActions = !unitLocked && (!row.passage || editingRows.has(row.memberId))

    if (!row.passage && unitLocked) return <span className="text-xs text-muted-foreground">—</span>

    if (!showActions) {
      const p = row.passage!
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs">{row.passage!.proposedUnitName}</span>
            {row.passage!.proposedTeamName && (
              <span className="text-xs text-muted-foreground">/ {row.passage!.proposedTeamName}</span>
            )}
          </div>
          {row.passage!.proposedRoleName !== row.currentRoleName && (
            <div className="text-xs text-blue-600 dark:text-blue-400">Fonction : {row.passage!.proposedRoleName}</div>
          )}
          <div className="flex items-center gap-2">
            {statusBadge(p)}
          </div>
          {/* The CG's decision (when they changed the proposal) and their reason, if any. */}
          {p.cgModified && (
            <div className="text-xs text-amber-700 dark:text-amber-300">Décision du CG : {decisionText(p)}</div>
          )}
          {p.cgNotes && <div className="text-xs text-muted-foreground italic">Raison : {p.cgNotes}</div>}
        </div>
      )
    }

    return (
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="border-green-300 dark:border-green-800 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/30 hover:text-green-800 dark:hover:text-green-300" onClick={() => handleNoChange(row)} disabled={proposeMutation.isPending}>
          <Check className="mr-1 h-3 w-3" />Pas de changement
        </Button>
        <Button size="sm" variant="outline" className="border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-800 dark:hover:text-blue-300" onClick={() => openPropose(row)}>
          <ArrowRightLeft className="mr-1 h-3 w-3" />Proposer
        </Button>
        <Button size="sm" variant="outline" className="border-orange-300 dark:border-orange-800 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:text-orange-800 dark:hover:text-orange-300" title="Quitte le groupe" onClick={() => handleLeaving(row)} disabled={proposeMutation.isPending}>
          <LogOut className="mr-1 h-3 w-3" />Quitte le groupe
        </Button>
        {row.passage && (
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => stopEditRow(row.memberId)}>Annuler</Button>
        )}
      </div>
    )
  }

  // Destination (unité) <Select> shared by the single + bulk propose dialogs. Driven by the member's
  // parcours scout: "Même branche" (équipe/fonction change) vs "Unité supérieure" (progression target);
  // falls back to all active units if no parcours is defined. Selecting an "up" unit locks the fonction
  // to the base youth role of that type.
  const renderDestinationSelect = () => {
    const sameUnits = destinations.filter(d => d.kind === 'same')
    const upUnits = destinations.filter(d => d.kind === 'up')
    const hasParcours = destinations.length > 0
    const changeRoleForType = (newType: string | undefined) => {
      const roleType = roles.find(r => r.id === propRoleId)?.unitTypeId
      if (roleType != null && roleType !== newType) setPropRoleId('')
    }
    return (
      <Select value={propUnitId} onValueChange={(v) => {
        setPropUnitId(v); setPropTeamId('')
        const dest = destinations.find(d => d.unitId === v)
        const newType = dest?.unitTypeId ?? units.find(u => u.id === v)?.unitTypeId
        // Moving UP the parcours (unité supérieure): a member always starts at the base youth role
        // (e.g. Éclaireur) — auto-select it and lock the Fonction picker. Staying in the same branch:
        // keep the CU's existing choice (unless the type changed).
        if (dest?.kind === 'up') setPropRoleId(baseRoleForType(newType)?.id ?? '')
        else changeRoleForType(newType)
      }}>
        <SelectTrigger><SelectValue placeholder="Sélectionner une unité" /></SelectTrigger>
        <SelectContent>
          {hasParcours ? (
            <>
              {sameUnits.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Même branche — changement d'équipe / fonction</SelectLabel>
                  {sameUnits.map(d => <SelectItem key={d.unitId} value={d.unitId}>{d.unitCode} — {d.unitName}</SelectItem>)}
                </SelectGroup>
              )}
              {upUnits.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Unité supérieure (parcours scout)</SelectLabel>
                  {upUnits.map(d => <SelectItem key={d.unitId} value={d.unitId}>{d.unitCode} — {d.unitName}</SelectItem>)}
                </SelectGroup>
              )}
            </>
          ) : (
            units.map(u => <SelectItem key={u.id} value={u.id}>{u.code} — {u.name}</SelectItem>)
          )}
        </SelectContent>
      </Select>
    )
  }

  // Fonction <Select> shared by both dialogs. Offers only the non-archived, non-maîtrise functions of the
  // destination unit's TYPE (this is a member passage). Moving UP the parcours locks it to the base youth role.
  const renderFonctionSelect = () => {
    const destTypeId = destinations.find(d => d.unitId === propUnitId)?.unitTypeId ?? units.find(u => u.id === propUnitId)?.unitTypeId
    const isUp = destinations.some(d => d.unitId === propUnitId && d.kind === 'up')
    let fnRoles = roles.filter(r => !r.isArchived && !r.isMaitrise && (destTypeId ? r.unitTypeId === destTypeId : true))
    if (isUp) {
      const base = baseRoleForType(destTypeId)
      fnRoles = base ? [base] : []
    }
    return (
      <Select value={propRoleId} onValueChange={setPropRoleId} disabled={isUp}>
        <SelectTrigger><SelectValue placeholder="Sélectionner une fonction" /></SelectTrigger>
        <SelectContent>
          {fnRoles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }

  // Équipe block, shown only when the destination unit == the member's current unit (staying in-unit);
  // a cross-unit move leaves team assignment to the new CU.
  const renderTeamBlock = (currentUnitId: string) => (
    propUnitId === currentUnitId ? (
      <div className="space-y-2">
        <label className="text-sm font-medium">Équipe</label>
        <Select value={propTeamId || '_none'} onValueChange={(v) => setPropTeamId(v === '_none' ? '' : v)}>
          <SelectTrigger><SelectValue placeholder="Aucune équipe" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">Aucune équipe</SelectItem>
            {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    ) : propUnitId ? (
      <p className="text-xs text-muted-foreground rounded-md bg-muted/50 p-2">L'équipe sera assignée par le nouveau chef d'unité après le passage.</p>
    ) : null
  )

  return (
    <Page>
      <PageHeader
        title={`Passage annuel — ${passageScoutYear}`}
        icon={ArrowRightLeft}
        description={leaderUnits.length > 1 ? undefined : unitName}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/organiser')} title="Basculer vers le plan de l'unité (glisser-déposer)">
              <LayoutGrid className="mr-1.5 h-4 w-4" />Plan de l'unité
            </Button>
            {unitLocked ? (
              <Badge variant="secondary"><Lock className="mr-1 h-3 w-3" />Unité terminée</Badge>
            ) : (
              <Button size="sm" onClick={() => setConfirmSubmit(true)} disabled={!unitStatus || unitStatus.missingLines > 0}
                title={unitStatus && unitStatus.missingLines > 0 ? `${unitStatus.missingLines} membre(s) sans proposition` : undefined}>
                <Flag className="mr-1.5 h-4 w-4" />Terminer le passage de l'unité
              </Button>
            )}
          </>
        }
      />
      {leaderUnits.length > 1 && (
        <Select value={unitId} onValueChange={setSelectedUnit}>
          <SelectTrigger className="h-9 w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            {leaderUnits.map(u => <SelectItem key={u.unitId} value={u.unitId}>{u.unitName}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {unitLocked ? (
        <Callout tone="info" icon={Lock}>
          Vous avez terminé le passage de l'unité{unitStatus?.submittedAt ? ` le ${new Date(unitStatus.submittedAt).toLocaleDateString('fr-FR')}` : ''}.
          Seule la Maîtrise de Groupe peut encore modifier les lignes. Vous verrez ici ses décisions et leurs raisons.
        </Callout>
      ) : unitStatus && unitStatus.missingLines > 0 ? (
        <Callout tone="warning">
          {unitStatus.missingLines} membre(s) n'ont pas encore de proposition. Quand chaque membre en a une, cliquez sur
          « Terminer le passage de l'unité ».
        </Callout>
      ) : null}
      {memberRows.some(r => r.passage?.cgModified) && (
        <Callout tone="warning" icon={ShieldAlert}>
          La Maîtrise de Groupe a modifié {memberRows.filter(r => r.passage?.cgModified).length} proposition(s) — voir « Décision du CG » dans la liste.
        </Callout>
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && !unitLocked && (
        <Card>
          <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 py-3">
            <span className="text-sm font-medium">{selected.size} membre(s) selectionne(s)</span>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button size="sm" className="bg-green-600 text-white hover:bg-green-700" onClick={() => openBulk('same')}>
                <Check className="mr-1 h-4 w-4" />Pas de changement
              </Button>
              <Button size="sm" onClick={() => openBulk('move')}>
                <ArrowRight className="mr-1 h-4 w-4" />Deplacer vers...
              </Button>
              <Button size="sm" className="bg-orange-600 text-white hover:bg-orange-700" onClick={openBulkLeave}>
                <LogOut className="mr-1 h-4 w-4" />Quitte le groupe
              </Button>
              <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
                <Trash2 className="mr-1 h-4 w-4" />Supprimer la proposition
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {memberRows.length === 0 ? (
        <EmptyState icon={Users} title="Aucun membre" description="Aucun membre actif dans cette unite." />
      ) : (
        <>
        {/* Search box + status filter (apply to both the desktop table and the mobile cards) */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un membre..." className="flex-1" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-60"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="todo">À proposer</SelectItem>
              <SelectItem value="pending">En attente du CG</SelectItem>
              <SelectItem value="approved">Accepté / Pas de changement</SelectItem>
              <SelectItem value="modified">Modifié par le CG</SelectItem>
              <SelectItem value="leaving">Quitte le groupe</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Mobile: one card per member (the desktop table is too wide for a phone) */}
        <div className="space-y-2 md:hidden">
          <div className="flex items-center justify-between px-1">
            <button type="button" className="text-xs text-primary underline" onClick={toggleAll}>
              {displayRows.length > 0 && displayRows.every(r => selected.has(r.memberId)) ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
            <span className="text-xs text-muted-foreground">{displayRows.length} membre(s)</span>
          </div>
          {displayRows.map(row => (
            <Card key={row.memberId}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1 shrink-0" checked={selected.has(row.memberId)} onChange={() => toggleSelect(row.memberId)} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium leading-tight">{row.memberName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {[row.cardNumber, row.age !== null ? `${row.age} ans` : null].filter(Boolean).join(' · ')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.currentUnitCode}{row.currentTeamName ? ` · ${row.currentTeamName}` : ''} · {row.currentRoleName}
                    </div>
                  </div>
                  {row.passage && canChangeRow(row) && (
                    <div className="flex gap-1 shrink-0">
                      {canEditRow(row) && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditRow(row.memberId)}><Pencil className="h-3.5 w-3.5" /></Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletingPassage(row.passage)} title="Supprimer"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  )}
                </div>
                <div className="pl-6">{renderProposition(row)}</div>
                {row.passage?.cuNotes && <div className="pl-6 text-xs text-muted-foreground">{row.passage.cuNotes}</div>}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Desktop: full table */}
        <div className="rounded-lg border overflow-x-auto hidden md:block">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={displayRows.length > 0 && displayRows.every(r => selected.has(r.memberId))}
                    onChange={toggleAll}
                  />
                </th>
                {sortTh('name', 'Membre')}
                {sortTh('age', 'Âge')}
                {sortTh('unit', 'Unité')}
                {sortTh('team', 'Équipe')}
                {sortTh('role', 'Fonction')}
                {sortTh('status', 'Proposition')}
                <th className="px-3 py-2 text-left font-medium">Notes</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, idx) => (
                <tr key={row.memberId} className={`border-b hover:bg-muted/20 ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(row.memberId)}
                      onChange={() => toggleSelect(row.memberId)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{row.memberName}</div>
                    {row.cardNumber && <div className="text-xs text-muted-foreground">{row.cardNumber}</div>}
                  </td>
                  <td className="px-3 py-2">{row.age !== null ? `${row.age} ans` : '-'}</td>
                  <td className="px-3 py-2">{row.currentUnitCode}</td>
                  <td className="px-3 py-2">{row.currentTeamName ?? '-'}</td>
                  <td className="px-3 py-2">{row.currentRoleName}</td>
                  <td className="px-3 py-2">
                    {renderProposition(row)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[150px] truncate">
                    {row.passage?.cuNotes ?? ''}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {canEditRow(row) && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditRow(row.memberId)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {row.passage && canChangeRow(row) && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletingPassage(row.passage)} title="Supprimer">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {displayRows.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-muted-foreground">Aucun membre ne correspond.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Propose Dialog (single member) */}
      <Dialog open={proposeDialogOpen} onOpenChange={setProposeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Proposer un passage — {editingMember?.memberName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {formError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}

            {suggestionHint && (
              <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-2.5 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                {suggestionHint}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Unité de destination</label>
              {renderDestinationSelect()}
            </div>

            {renderTeamBlock(editingMember?.currentUnitId ?? '')}

            <div className="space-y-2">
              <label className="text-sm font-medium">Fonction</label>
              {renderFonctionSelect()}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Input
                value={propNotes}
                onChange={e => setPropNotes(e.target.value)}
                placeholder="Notes pour la Maîtrise de Groupe..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProposeDialogOpen(false)}>Annuler</Button>
            <Button onClick={handlePropose} disabled={proposeMutation.isPending}>
              {proposeMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Propose Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkMode === 'same' ? 'Pas de changement' : 'Deplacer vers...'}
              {' — '}{selected.size} membre(s)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {formError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}

            {bulkMode === 'move' && (
              <>
                {/* Same parcours-driven pickers as the single-member dialog (Même branche / Unité
                    supérieure), not the full unit + function lists. All selected members are in this unit. */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Unité de destination</label>
                  {renderDestinationSelect()}
                </div>

                {renderTeamBlock(unitId)}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Fonction</label>
                  {renderFonctionSelect()}
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Input
                value={propNotes}
                onChange={e => setPropNotes(e.target.value)}
                placeholder="Notes pour la Maîtrise de Groupe..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleBulk} disabled={bulkProposeMutation.isPending}>
              {bulkProposeMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leaver contact dialog — confirm/capture personal email + phone before recording a departure. When
          several members are marked leaving at once, the CU steps through one dialog per member. */}
      <LeaverContactDialog
        open={!!currentLeaver}
        onOpenChange={o => { if (!o) { setLeaveQueue([]); setLeaveIndex(0) } }}
        memberId={currentLeaver?.memberId ?? null}
        memberName={currentLeaver?.memberName ?? ''}
        onConfirm={submitLeaving}
        progress={leaveQueue.length > 1 ? { current: leaveIndex + 1, total: leaveQueue.length } : undefined}
        onSkip={leaveQueue.length > 1 ? advanceLeave : undefined}
      />

      {/* Finish the unit's passage — locks it for the CU */}
      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="Terminer le passage de l'unité"
        description="Une fois terminé, vous ne pourrez plus modifier les lignes de votre unité : la Maîtrise de Groupe fait ses calculs par unité. Toute modification ultérieure sera faite par le CG. Continuer ?"
        confirmLabel="Terminer"
        loading={submitUnitMutation.isPending}
        onConfirm={async () => {
          try {
            await submitUnitMutation.mutateAsync({ unitId, scoutYear: passageScoutYear })
            toast.success("Passage de l'unité terminé")
          } catch (err) { toast.error(parseApiError(err)) }
          setConfirmSubmit(false)
        }}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deletingPassage}
        onOpenChange={() => setDeletingPassage(null)}
        title="Supprimer la proposition"
        description="Etes-vous sur de vouloir supprimer cette proposition de passage ?"
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </Page>
  )
}
