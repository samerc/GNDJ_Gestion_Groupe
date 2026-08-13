import { useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useSettingValue } from '@/services/settings-service'
import {
  usePassagesByUnit,
  usePassageStatus,
  useProposePassage,
  useBulkProposePassage,
  useDeletePassage,
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
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { ArrowRightLeft, Check, Trash2, Users, ArrowRight, LogOut, Search, ArrowUpDown, Pencil } from 'lucide-react'
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

// Bucket a row for the status filter: no proposal yet ("todo"), leaving, or its passage status.
function rowState(row: MemberRow): string {
  if (!row.passage) return 'todo'
  if (row.passage.isLeaving) return 'leaving'
  return row.passage.status.toLowerCase()
}

// "Passage annuel" — chef d'unité (CU) screen. Lists the CU's active members for the upcoming scout year so
// the CU can submit a passage line for each: "Pas de changement", "Proposer" a move (équipe/fonction or up
// to a higher unit via the parcours scout), or "Quitte le groupe". Single + bulk proposals. Only visible
// while the CG has OPENED the passage process; otherwise shows a closed-state card. CG reviews/finalizes
// elsewhere. Renders as a card list on mobile, a full table on desktop.
export default function PassagePage() {
  const { user } = useAuthStore()
  const passageScoutYear = useSettingValue('passage.scout_year') ?? '2026-2027'
  const unitId = user?.unitAccess[0]?.unitId ?? ''
  const unitName = user?.unitAccess[0]?.unitName ?? ''

  const { data: passageStatus, isLoading: statusLoading } = usePassageStatus(passageScoutYear)
  const { data: passages, isLoading: passagesLoading } = usePassagesByUnit(unitId, passageScoutYear)
  const { data: membersData, isLoading: membersLoading } = useMembers({ unitId, pageSize: 500 })
  const { data: assignmentsData } = useAssignments({ unitId, isActive: true, pageSize: 500 })
  const { data: unitsData } = useUnits({ isActive: true, pageSize: 100 })
  const { data: rolesData } = useFunctionalRoles()

  const proposeMutation = useProposePassage()
  const bulkProposeMutation = useBulkProposePassage()
  const deleteMutation = useDeletePassage()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [proposeDialogOpen, setProposeDialogOpen] = useState(false)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [bulkMode, setBulkMode] = useState<'same' | 'move'>('same')
  const [editingMember, setEditingMember] = useState<MemberRow | null>(null)
  const [deletingPassage, setDeletingPassage] = useState<PassageDto | null>(null)

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
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Passage annuel</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <ArrowRightLeft className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-lg font-medium text-muted-foreground">Le processus de passage n'est pas encore ouvert</p>
            <p className="text-sm text-muted-foreground">Contactez la Maîtrise de Groupe pour démarrer le passage.</p>
          </CardContent>
        </Card>
      </div>
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

  const openBulk = (mode: 'same' | 'move') => {
    setBulkMode(mode)
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
  // "Pas de changement" rather than "Approuvé".
  const statusBadge = (passage: PassageDto) => {
    if (passage.isLeaving) return <Badge className="bg-orange-600">Quitte le groupe{passage.status === 'Approved' ? ' ✓' : passage.status === 'Rejected' ? ' ✗' : ''}</Badge>
    switch (passage.status) {
      case 'Approved': return <Badge className="bg-green-600">{passage.proposedUnitId === passage.currentUnitId && passage.proposedRoleName === passage.currentRoleName ? 'Pas de changement' : 'Approuvé'}</Badge>
      case 'Rejected': return <Badge variant="destructive">Rejeté</Badge>
      case 'Finalized': return <Badge className="bg-blue-600">Finalisé</Badge>
      default: return <Badge variant="secondary">En attente</Badge>
    }
  }

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

  // One-click "Quitte le groupe": flags the member as leaving; always needs CG review (becomes alumni on finalize).
  const handleLeaving = async (row: MemberRow) => {
    try {
      await proposeMutation.mutateAsync({
        memberId: row.memberId, scoutYear: passageScoutYear,
        proposedUnitId: row.currentUnitId, proposedTeamId: row.currentTeamId,
        proposedRoleId: row.currentRoleId, cuNotes: null, isLeaving: true,
      })
      toast.success('Départ enregistré (en attente de validation)')
      stopEditRow(row.memberId)
    } catch (err) { toast.error(parseApiError(err)) }
  }

  // Proposition cell/section — shared by the desktop table and the mobile cards.
  const renderProposition = (row: MemberRow) => {
    // A line can still be changed by the CU until the CG FINALIZES the passage. Approved (incl. auto-approved
    // "no change") + Pending lines are re-openable; Finalized/Rejected are locked.
    const editable = !!row.passage && (row.passage.status === 'Pending' || row.passage.status === 'Approved')
    const showActions = !row.passage || editingRows.has(row.memberId)

    if (!showActions) {
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
            <div className="text-xs text-blue-600">Fonction : {row.passage!.proposedRoleName}</div>
          )}
          <div className="flex items-center gap-2">
            {statusBadge(row.passage!)}
            {editable && (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => startEditRow(row.memberId)}>
                <Pencil className="mr-1 h-3 w-3" />Modifier
              </Button>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800" onClick={() => handleNoChange(row)} disabled={proposeMutation.isPending}>
          <Check className="mr-1 h-3 w-3" />Pas de changement
        </Button>
        <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50 hover:text-blue-800" onClick={() => openPropose(row)}>
          <ArrowRightLeft className="mr-1 h-3 w-3" />Proposer
        </Button>
        <Button size="sm" variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-50 hover:text-orange-800" title="Quitte le groupe" onClick={() => handleLeaving(row)} disabled={proposeMutation.isPending}>
          <LogOut className="mr-1 h-3 w-3" />Quitte le groupe
        </Button>
        {row.passage && (
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => stopEditRow(row.memberId)}>Annuler</Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Passage annuel — {passageScoutYear}</h1>
          <p className="text-sm text-muted-foreground mt-1">{unitName}</p>
        </div>
        <Badge className="bg-green-600 text-sm">Passage ouvert</Badge>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <Card>
          <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 py-3">
            <span className="text-sm font-medium">{selected.size} membre(s) selectionne(s)</span>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button size="sm" variant="outline" onClick={() => openBulk('same')}>
                <Check className="mr-1 h-4 w-4" />Pas de changement
              </Button>
              <Button size="sm" onClick={() => openBulk('move')}>
                <ArrowRight className="mr-1 h-4 w-4" />Deplacer vers...
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
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Rechercher un membre..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-60"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="todo">À proposer</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="approved">Approuvé / Pas de changement</SelectItem>
              <SelectItem value="leaving">Quitte le groupe</SelectItem>
              <SelectItem value="rejected">Rejeté</SelectItem>
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
                  {row.passage && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPropose(row)} title="Modifier"><ArrowRightLeft className="h-3.5 w-3.5" /></Button>
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
                      {row.passage && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPropose(row)} title="Modifier">
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletingPassage(row.passage)} title="Supprimer">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </>
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
              <div className="rounded-md bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-700 flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                {suggestionHint}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Unité de destination</label>
              {(() => {
                // Drive the choices from the parcours scout: stay in the SAME unit (team/function change)
                // or move to a progression target unit (returned by the endpoint even if out of the CU's
                // scope, e.g. Noyau). Fall back to the CU's own units if no parcours is defined.
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
                    // Moving UP the parcours (unité supérieure): a member always starts at the base youth
                    // role (e.g. Éclaireur) — auto-select it and lock the Fonction picker below. Staying in
                    // the same branch: keep the CU's existing choice (unless the type changed).
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
              })()}
            </div>

            {propUnitId === editingMember?.currentUnitId && (
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
            )}
            {propUnitId !== editingMember?.currentUnitId && (
              <p className="text-xs text-muted-foreground rounded-md bg-muted/50 p-2">L'équipe sera assignée par le nouveau chef d'unité après le passage.</p>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Fonction</label>
              {(() => {
                // Only the functions of the selected destination unit's TYPE (e.g. C3 → Compagnie functions,
                // N → Noyau functions), non-archived. This is a MEMBER passage (the parcours is a member
                // parcours), so maîtrise (leadership) functions are excluded. The destination may be out of
                // the CU's scope (e.g. Noyau), so resolve its type from the destinations list first.
                const destTypeId = destinations.find(d => d.unitId === propUnitId)?.unitTypeId ?? units.find(u => u.id === propUnitId)?.unitTypeId
                // Moving UP to a higher unit: only the base youth role is offered (a new arrival always starts
                // at the bottom, e.g. Éclaireur) — the CU can't grant Chef/Second de Patrouille via a passage.
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
              })()}
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
                <div className="space-y-2">
                  <label className="text-sm font-medium">Unite de destination</label>
                  <Select value={propUnitId} onValueChange={(v) => { setPropUnitId(v); setPropTeamId('') }}>
                    <SelectTrigger><SelectValue placeholder="Selectionner une unite" /></SelectTrigger>
                    <SelectContent>
                      {units.map(u => <SelectItem key={u.id} value={u.id}>{u.code} — {u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {propUnitId === unitId ? (
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
                ) : propUnitId && (
                  <p className="text-xs text-muted-foreground rounded-md bg-muted/50 p-2">L'équipe sera assignée par le nouveau chef d'unité après le passage.</p>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Fonction</label>
                  <Select value={propRoleId} onValueChange={setPropRoleId}>
                    <SelectTrigger><SelectValue placeholder="Selectionner une fonction" /></SelectTrigger>
                    <SelectContent>
                      {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
    </div>
  )
}
