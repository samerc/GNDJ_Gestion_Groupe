// CG annual-passage validation screen.
// Audience: Chef de Groupe (passage.manage). Reviews per-member promotion proposals the CUs filed,
// then rolls the whole group forward for a scout year.
// Workflow: CG toggles the passage process open/close → CUs propose changes (handled elsewhere) →
// here the CG reviews each proposal. Status flow per line: Pending → Approved | Rejected, then
// Approved lines become Finalized on finalize (old assignments closed, new ones created).
// Summary cards show totals; the finalize button is gated by a COMPLETENESS check — every active
// member in scope must have a passage line (missingInScope === 0) before finalize is allowed.
import { useState } from 'react'
import { useSettingValue } from '@/services/settings-service'
import {
  useAllPassages,
  usePassageSummary,
  usePassageStatus,
  useTogglePassage,
  useReviewPassage,
  useBulkReviewPassage,
  useFinalizePassages,
  type PassageDto,
} from '@/services/passage-service'
import { useUnits } from '@/services/unit-service'
import { useTeams, teamsForSelect } from '@/services/team-service'
import { useFunctionalRoles } from '@/services/role-service'
import { parseApiError } from '@/lib/error-utils'
import apiClient from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Tip } from '@/components/ui/tooltip'
import {
  ArrowRightLeft,
  ArrowRight,
  Check,
  X,
  Pencil,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { toast } from 'sonner'

// One allowed move target for a member from the parcours scout: kind 'same' = stay in the branch
// (équipe/fonction change), kind 'up' = a progression target unit (unité supérieure). Mirrors the CU page.
interface PassageDestination {
  unitId: string
  unitCode: string
  unitName: string
  unitTypeId: string
  unitTypeName: string
  kind: 'same' | 'up'
  reason: string
}

export default function PassageValidationPage() {
  const passageScoutYear = useSettingValue('passage.scout_year') ?? '2026-2027'
  const [scoutYear, setScoutYear] = useState('2026-2027')
  const [statusFilter, setStatusFilter] = useState<string>('Pending')

  // Sync the selected year to the configured passage year once the setting loads (render-phase reset).
  const [prevPassageYear, setPrevPassageYear] = useState(passageScoutYear)
  if (passageScoutYear !== prevPassageYear) { setPrevPassageYear(passageScoutYear); setScoutYear(passageScoutYear) }
  const [unitFilter, setUnitFilter] = useState<string>('_all')

  const { data: passageStatus, isLoading: statusLoading } = usePassageStatus(scoutYear)
  const { data: summary, isLoading: summaryLoading } = usePassageSummary(scoutYear)
  const { data: passages, isLoading: passagesLoading } = useAllPassages(
    scoutYear,
    statusFilter === '_all' ? undefined : statusFilter,
    unitFilter === '_all' ? undefined : unitFilter,
  )
  const { data: unitsData } = useUnits({ isActive: true, pageSize: 100 })

  const toggleMutation = useTogglePassage()
  const reviewMutation = useReviewPassage()
  const bulkReviewMutation = useBulkReviewPassage()
  const finalizeMutation = useFinalizePassages()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editDialog, setEditDialog] = useState<PassageDto | null>(null)
  const [finalizeDialog, setFinalizeDialog] = useState(false)
  // By default the CG only sees members actually changing unit (or leaving) — the real passages to review.
  // Toggle on to also show members staying in their unit (no change / équipe change).
  const [showSameUnit, setShowSameUnit] = useState(false)
  // Parcours scout destinations for the member being edited (drives the "Unité finale" picker).
  const [destinations, setDestinations] = useState<PassageDestination[]>([])
  // Passage id currently being quick-approved/rejected — so ONLY that row's buttons disable
  // (a shared reviewMutation.isPending would grey every row while one request is in flight).
  const [pendingId, setPendingId] = useState<string | null>(null)

  // Edit form state
  const [editFinalUnitId, setEditFinalUnitId] = useState('')
  const [editFinalTeamId, setEditFinalTeamId] = useState<string>('')
  const [editFinalRoleId, setEditFinalRoleId] = useState('')
  const [editCgNotes, setEditCgNotes] = useState('')
  const [editError, setEditError] = useState('')

  const units = unitsData?.items ?? []
  const { data: rolesData } = useFunctionalRoles()
  const roles = rolesData ?? []
  const { data: teamsData } = useTeams({ unitId: editFinalUnitId || undefined, pageSize: 100 })
  const teams = teamsForSelect(teamsData?.items) // Maîtrise first, then the rest

  const isLoading = statusLoading || summaryLoading || passagesLoading
  const passageList = passages ?? []
  // A true "Pas de changement" = SAME unit AND team AND role (this is what the backend auto-approves).
  // A member changing ÉQUIPE or fonction within the same unit is NOT a no-change — it stays Pending and
  // MUST be reviewed/approved by the CG, else finalize (which only processes Approved lines) skips it and
  // the change is lost. So the default view hides only true no-change members, keeping every real change
  // (unit move, équipe change, fonction change, leaving) visible.
  // isNoChange compares team/role by NAME (the DTO carries names, not ids) — the backend auto-approves by
  // id. To be safe against a name collision that could misclassify a real change, we ALSO require the line
  // to be non-Pending before hiding it: a Pending line always needs CG action, so it is never hidden.
  const isNoChange = (p: PassageDto) =>
    !p.isLeaving
    && p.proposedUnitId === p.currentUnitId
    && (p.proposedTeamName ?? null) === (p.currentTeamName ?? null)
    && p.proposedRoleName === p.currentRoleName
  const isHiddenNoChange = (p: PassageDto) => p.status !== 'Pending' && isNoChange(p)
  const visiblePassages = showSameUnit ? passageList : passageList.filter(p => !isHiddenNoChange(p))
  const noChangeCount = passageList.filter(isHiddenNoChange).length

  // The base youth role of a unit type = the fonction a new arrival gets (explicit "défaut pour les
  // nouveaux membres" role, else the lowest-rank non-archived, non-maîtrise one). Used when a member
  // moves UP the parcours — they start at the bottom.
  const baseRoleForType = (type: string | undefined | null) => {
    const list = roles.filter(r => !r.isArchived && !r.isMaitrise && (type ? r.unitTypeId === type : true))
    return list.find(r => r.isDefaultForNewMembers) ?? [...list].sort((a, b) => a.rank - b.rank)[0]
  }

  const handleToggle = async () => {
    try {
      const newEnabled = !passageStatus?.isOpen
      await toggleMutation.mutateAsync({ enabled: newEnabled, scoutYear })
      toast.success(newEnabled ? 'Passage ouvert' : 'Passage fermé')
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === visiblePassages.length) setSelected(new Set())
    else setSelected(new Set(visiblePassages.map(p => p.id)))
  }

  // Approve as-is: accept the CU's proposed unit/team unchanged (role left to the new CU to assign).
  const quickApprove = async (passage: PassageDto) => {
    setPendingId(passage.id)
    try {
      await reviewMutation.mutateAsync({
        id: passage.id,
        status: 'Approved',
        finalUnitId: passage.proposedUnitId,
        finalTeamId: passage.proposedTeamId,
        finalRoleId: null,
        cgNotes: null,
      })
      toast.success('Passage accepté')
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setPendingId(null)
    }
  }

  const quickReject = async (passage: PassageDto) => {
    setPendingId(passage.id)
    try {
      await reviewMutation.mutateAsync({
        id: passage.id,
        status: 'Rejected',
        cgNotes: null,
      })
      toast.success('Passage rejeté')
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setPendingId(null)
    }
  }

  // Review-and-modify: open the dialog pre-filled with the final values if already set, else the CU proposal.
  // finalRole is stored by name on the DTO, so resolve it back to a role id for the Select. Loads the member's
  // parcours destinations so the CG picks only from the units the member can actually go to (not every unit).
  const openEditDialog = async (passage: PassageDto) => {
    setEditDialog(passage)
    setEditError('')
    setEditCgNotes(passage.cgNotes ?? '')
    setEditFinalTeamId(passage.finalTeamId ?? passage.proposedTeamId ?? '')
    const defaultUnit = passage.finalUnitId ?? passage.proposedUnitId
    setEditFinalUnitId(defaultUnit)

    // Fetch the allowed destinations (current branch + parcours targets) before resolving the role default.
    setDestinations([])
    let dests: PassageDestination[] = []
    try {
      const { data } = await apiClient.get<PassageDestination[]>(`/unit-type-progressions/destinations/${passage.memberId}`)
      dests = data ?? []
      setDestinations(dests)
    } catch { /* destinations optional — falls back to all units */ }

    // Role default: a final role if the CG already set one, else the CU's proposed role — but if the default
    // unit is an "up" parcours target, force the base youth role (a new arrival starts at the bottom, locked).
    const isUp = dests.some(d => d.unitId === defaultUnit && d.kind === 'up')
    if (isUp) {
      const typeId = dests.find(d => d.unitId === defaultUnit)?.unitTypeId ?? units.find(u => u.id === defaultUnit)?.unitTypeId
      setEditFinalRoleId(baseRoleForType(typeId)?.id ?? roles.find(r => r.name === passage.proposedRoleName)?.id ?? '')
    } else {
      setEditFinalRoleId(
        passage.finalRoleName
          ? roles.find(r => r.name === passage.finalRoleName)?.id ?? ''
          : roles.find(r => r.name === passage.proposedRoleName)?.id ?? '',
      )
    }
  }

  const handleEditSubmit = async () => {
    if (!editDialog) return
    try {
      await reviewMutation.mutateAsync({
        id: editDialog.id,
        status: 'Approved',
        finalUnitId: editFinalUnitId || null,
        finalTeamId: editFinalTeamId || null,
        finalRoleId: editFinalRoleId || null,
        cgNotes: editCgNotes || null,
      })
      toast.success('Passage modifié et accepté')
      setEditDialog(null)
    } catch (err) {
      setEditError(parseApiError(err))
    }
  }

  const handleBulkApprove = async () => {
    try {
      const result = await bulkReviewMutation.mutateAsync({
        passageIds: Array.from(selected),
        status: 'Approved',
      })
      toast.success(`${result.count} passage(s) accepté(s)`)
      setSelected(new Set())
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const handleBulkReject = async () => {
    try {
      const result = await bulkReviewMutation.mutateAsync({
        passageIds: Array.from(selected),
        status: 'Rejected',
      })
      toast.success(`${result.count} passage(s) rejeté(s)`)
      setSelected(new Set())
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  // Commit approved passages: close old assignments + create new ones. Scoped to the unit filter
  // (or whole group). Backend only processes Approved lines and flips them Finalized (idempotent).
  const handleFinalize = async () => {
    try {
      const result = await finalizeMutation.mutateAsync({
        scoutYear,
        unitId: unitFilter === '_all' ? null : unitFilter,
      })
      if (result.count > 0) toast.success(`${result.count} passage(s) finalisé(s)`)
      else toast.info('Aucun passage accepté à finaliser (déjà finalisé ?)')
      setFinalizeDialog(false)
    } catch (err) {
      toast.error(parseApiError(err))
      setFinalizeDialog(false)
    }
  }

  const approvedCount = summary?.approved ?? 0
  const pendingCount = summary?.pending ?? 0
  // Members (in the current scope) still missing a passage line — finalize is blocked until 0.
  const missingInScope = unitFilter === '_all'
    ? (summary?.missingLines ?? 0)
    : (summary?.unitSummaries.find(u => u.unitId === unitFilter)?.missingLines ?? 0)
  const canFinalize = approvedCount > 0 && missingInScope === 0

  const statusBadge = (status: string) => {
    switch (status) {
      case 'Approved': return <Badge className="bg-green-600">Accepté</Badge>
      case 'Rejected': return <Badge variant="destructive">Rejeté</Badge>
      case 'Finalized': return <Badge className="bg-blue-600">Finalisé</Badge>
      default: return <Badge variant="secondary">En attente</Badge>
    }
  }

  if (isLoading) return <LoadingSpinner variant="table" />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Validation des passages — {scoutYear}</h1>
        <div className="flex items-center gap-3">
          <Select value={scoutYear} onValueChange={setScoutYear}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['2026-2027', '2025-2026', '2024-2025'].map(y => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant={passageStatus?.isOpen ? 'default' : 'secondary'} className={passageStatus?.isOpen ? 'bg-green-600' : ''}>
            {passageStatus?.isOpen ? 'Ouvert' : 'Fermé'}
          </Badge>
          <Button
            variant={passageStatus?.isOpen ? 'destructive' : 'default'}
            onClick={handleToggle}
            disabled={toggleMutation.isPending}
          >
            {passageStatus?.isOpen ? (
              <><ToggleRight className="mr-1 h-4 w-4" />Fermer le passage</>
            ) : (
              <><ToggleLeft className="mr-1 h-4 w-4" />Ouvrir le passage</>
            )}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary?.totalMembers ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary?.pending ?? 0}</p>
              <p className="text-xs text-muted-foreground">En attente</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary?.approved ?? 0}</p>
              <p className="text-xs text-muted-foreground">Acceptés</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-600">
              <XCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary?.rejected ?? 0}</p>
              <p className="text-xs text-muted-foreground">Rejetés</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={unitFilter} onValueChange={setUnitFilter}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Toutes les unités" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Toutes les unités</SelectItem>
            {units.map(u => <SelectItem key={u.id} value={u.id}>{u.code} — {u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Tous les statuts</SelectItem>
            <SelectItem value="Pending">En attente</SelectItem>
            <SelectItem value="Approved">Accepté</SelectItem>
            <SelectItem value="Rejected">Rejeté</SelectItem>
            <SelectItem value="Finalized">Finalisé</SelectItem>
          </SelectContent>
        </Select>
        {/* Default view = every real change (unit move, équipe/fonction change, leaving); toggle to also
            see the "Pas de changement" members (same unit + équipe + fonction, auto-approved). */}
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={showSameUnit} onChange={e => { setShowSameUnit(e.target.checked); setSelected(new Set()) }} />
          Afficher les membres sans changement
          {noChangeCount > 0 && <Badge variant="secondary" className="ml-1">{noChangeCount}</Badge>}
        </label>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <Card>
          <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 py-3">
            <span className="text-sm font-medium">{selected.size} passage(s) sélectionné(s)</span>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleBulkApprove} disabled={bulkReviewMutation.isPending}>
                <Check className="mr-1 h-4 w-4" />Accepter la sélection
              </Button>
              <Button size="sm" variant="destructive" onClick={handleBulkReject} disabled={bulkReviewMutation.isPending}>
                <X className="mr-1 h-4 w-4" />Rejeter la sélection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {visiblePassages.length === 0 ? (
        <EmptyState
          icon={ArrowRightLeft}
          title="Aucun passage"
          description={
            !showSameUnit && noChangeCount > 0
              ? `Aucun changement à revoir. ${noChangeCount} membre(s) sans changement — cochez la case ci-dessus pour les afficher.`
              : 'Aucune proposition de passage pour cette année scolaire.'
          }
        />
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === visiblePassages.length && visiblePassages.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium">Membre</th>
                <th className="px-3 py-2 text-left font-medium">Unité actuelle</th>
                <th className="px-3 py-2 text-left font-medium">Proposition</th>
                <th className="px-3 py-2 text-left font-medium">Équipe</th>
                <th className="px-3 py-2 text-left font-medium">Fonction</th>
                <th className="px-3 py-2 text-left font-medium">Notes CU</th>
                <th className="px-3 py-2 text-left font-medium">Décision CG</th>
                <th className="px-3 py-2 text-left font-medium">Statut</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {visiblePassages.map((p, idx) => (
                <tr key={p.id} className={`border-b hover:bg-muted/20 ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{p.memberName}</div>
                    {p.cardNumber && <div className="text-xs text-muted-foreground">{p.cardNumber}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-muted-foreground">{p.currentUnitCode}</span>
                  </td>
                  <td className="px-3 py-2">
                    {p.isLeaving ? (
                      <Badge className="bg-orange-600">Quitte le groupe</Badge>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">{p.currentUnitCode}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="font-medium">{p.proposedUnitCode}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{p.proposedTeamName ?? '-'}</td>
                  <td className="px-3 py-2 text-xs">{p.proposedRoleName}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[120px] truncate">{p.cuNotes ?? ''}</td>
                  <td className="px-3 py-2 text-xs">
                    {p.finalUnitName ? (
                      <div>
                        <span className="font-medium">{p.finalUnitCode}</span>
                        {p.finalTeamName && <span className="text-muted-foreground"> / {p.finalTeamName}</span>}
                        {p.cgNotes && <div className="text-muted-foreground mt-0.5">{p.cgNotes}</div>}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{statusBadge(p.status)}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <Tip content="Accepter">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => quickApprove(p)}
                          disabled={pendingId === p.id}
                        >
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        </Button>
                      </Tip>
                      <Tip content="Rejeter">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => quickReject(p)}
                          disabled={pendingId === p.id}
                        >
                          <X className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </Tip>
                      <Tip content="Modifier la décision">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditDialog(p)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </Tip>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Finalize section */}
      <div className="flex flex-col items-end gap-2 pt-4">
        {missingInScope > 0 && (
          <div className="w-full rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <strong>{missingInScope} membre(s) actif(s) sans ligne de passage</strong>
            {unitFilter === '_all' ? ' (toutes unités)' : ' dans cette unité'}.
            {' '}Le passage ne peut pas être finalisé tant que chaque membre n'a pas une décision
            (proposition ou « Pas de changement »).
          </div>
        )}
        {missingInScope === 0 && pendingCount > 0 && unitFilter === '_all' && (
          <div className="w-full rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-700">
            {pendingCount} proposition(s) en attente de revue. La finalisation ne traitera que les passages acceptés.
          </div>
        )}
        {approvedCount > 0 && (
          <Button
            size="lg"
            onClick={() => setFinalizeDialog(true)}
            disabled={!canFinalize || finalizeMutation.isPending}
            title={missingInScope > 0 ? 'Tous les membres doivent avoir une ligne de passage' : undefined}
          >
            <CheckCircle2 className="mr-2 h-5 w-5" />
            {finalizeMutation.isPending ? 'Finalisation en cours...' : 'Finaliser les passages'}
          </Button>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revue du passage — {editDialog?.memberName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {editError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{editError}</div>}

            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <p><strong>Proposition CU :</strong> {editDialog?.proposedUnitCode} — {editDialog?.proposedUnitName}</p>
              {editDialog?.proposedTeamName && <p>Équipe : {editDialog.proposedTeamName}</p>}
              <p>Fonction : {editDialog?.proposedRoleName}</p>
              {editDialog?.cuNotes && <p className="text-muted-foreground mt-1">Notes : {editDialog.cuNotes}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Unité finale</label>
              {(() => {
                // Only the units the member can go to (parcours scout): stay in the SAME branch
                // (équipe/fonction change) or move to a progression target. The CU's proposed unit is
                // always kept available even if outside the computed parcours. Falls back to all units.
                const sameUnits = destinations.filter(d => d.kind === 'same')
                const upUnits = destinations.filter(d => d.kind === 'up')
                const hasParcours = destinations.length > 0
                const proposedInList = destinations.some(d => d.unitId === editDialog?.proposedUnitId)
                const proposedUnit = units.find(u => u.id === editDialog?.proposedUnitId)
                return (
                  <Select value={editFinalUnitId} onValueChange={(v) => {
                    setEditFinalUnitId(v); setEditFinalTeamId('')
                    const dest = destinations.find(d => d.unitId === v)
                    const newType = dest?.unitTypeId ?? units.find(u => u.id === v)?.unitTypeId
                    // Moving UP → base youth role (locked). Same branch → clear the role only if the type changed.
                    if (dest?.kind === 'up') setEditFinalRoleId(baseRoleForType(newType)?.id ?? '')
                    else {
                      const roleType = roles.find(r => r.id === editFinalRoleId)?.unitTypeId
                      if (roleType != null && roleType !== newType) setEditFinalRoleId('')
                    }
                  }}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner une unité" /></SelectTrigger>
                    <SelectContent>
                      {hasParcours ? (
                        <>
                          {!proposedInList && proposedUnit && (
                            <SelectGroup>
                              <SelectLabel>Proposition CU</SelectLabel>
                              <SelectItem value={proposedUnit.id}>{proposedUnit.code} — {proposedUnit.name}</SelectItem>
                            </SelectGroup>
                          )}
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

            <div className="space-y-2">
              <label className="text-sm font-medium">Équipe finale</label>
              <Select value={editFinalTeamId || '_none'} onValueChange={(v) => setEditFinalTeamId(v === '_none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Aucune équipe" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Aucune équipe</SelectItem>
                  {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Fonction finale</label>
              {(() => {
                // Only the non-archived, non-maîtrise functions of the destination unit's TYPE (a member
                // passage). Moving UP the parcours locks it to the base youth role.
                const destTypeId = destinations.find(d => d.unitId === editFinalUnitId)?.unitTypeId ?? units.find(u => u.id === editFinalUnitId)?.unitTypeId
                const isUp = destinations.some(d => d.unitId === editFinalUnitId && d.kind === 'up')
                let fnRoles = roles.filter(r => !r.isArchived && !r.isMaitrise && (destTypeId ? r.unitTypeId === destTypeId : true))
                if (isUp) {
                  const base = baseRoleForType(destTypeId)
                  fnRoles = base ? [base] : []
                }
                return (
                  <Select value={editFinalRoleId} onValueChange={setEditFinalRoleId} disabled={isUp}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner une fonction" /></SelectTrigger>
                    <SelectContent>
                      {fnRoles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )
              })()}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes CG</label>
              <Input
                value={editCgNotes}
                onChange={e => setEditCgNotes(e.target.value)}
                placeholder="Notes du chef de groupe..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Annuler</Button>
            <Button onClick={handleEditSubmit} disabled={reviewMutation.isPending}>
              {reviewMutation.isPending ? 'Enregistrement...' : 'Accepter et enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finalize Confirm */}
      <ConfirmDialog
        open={finalizeDialog}
        onOpenChange={setFinalizeDialog}
        title="Finaliser les passages"
        description={
          `Ceci va finaliser ${approvedCount} passage(s) accepté(s) ${unitFilter === '_all' ? '(toutes unités)' : 'de cette unité'} : ` +
          `les affectations actuelles seront clôturées et les nouvelles créées. Cette action est définitive. Continuer ?`
        }
        confirmLabel="Finaliser"
        loading={finalizeMutation.isPending}
        onConfirm={handleFinalize}
      />
    </div>
  )
}
