// CG annual-passage validation screen.
// Audience: Chef de Groupe (passage.manage). Reviews the proposals the CUs filed, then posts the whole group.
// Workflow: CG opens the passage → CUs propose (same-unit changes and departures are accepted automatically;
// moves to another unit wait here) and "finish" their unit (locked for them afterwards). Here the CG accepts
// a line or CHANGES it (no rejection) with an optional reason the CU sees. Accepting does not change anyone's
// function — only "Publier le passage" does, for the whole group at once: it needs every member to have a
// line and every unit to be finished, and accepts the lines still waiting. After posting, the CG downloads one
// Word list of newcomers per association.
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
  useFinalizePreview,
  useSubmitPassageUnit,
  useReopenPassageUnit,
  useRemindPassageUnits,
  usePassageNewcomerGroups,
  downloadPassageNewcomersDoc,
  type PassageDto,
} from '@/services/passage-service'
import { saveBlob } from '@/lib/download'
import { PassageUnitsOverview } from '@/components/passage/passage-units-overview'
import { useMaitrisePlan } from '@/services/maitrise-service'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { BulkChangeDialog } from '@/components/passage/bulk-change-dialog'
import { PassageFinalizeSchedule } from '@/components/passage/passage-finalize-schedule'
import { useUnits } from '@/services/unit-service'
import { useTeams, teamsForSelect } from '@/services/team-service'
import { useFunctionalRoles } from '@/services/role-service'
import { parseApiError, parseBlobError } from '@/lib/error-utils'
import apiClient from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { ActionPreviewPanel } from '@/components/shared/action-preview'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { Callout } from '@/components/shared/callout'
import { RequiredLabel } from '@/components/shared/required-label'
import { SegmentedToggle } from '@/components/shared/segmented-toggle'
import { Tip } from '@/components/ui/tooltip'
import {
  ArrowRightLeft,
  ArrowRight,
  Check,
  Pencil,
  ToggleLeft,
  ToggleRight,
  FileText,
  Send,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useEmailQueuedToast } from '@/hooks/use-email-queued-toast'
import { PassageUnitPanel } from '@/pages/passage'

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
  const emailToast = useEmailQueuedToast()
  const { data: maitrisePlan } = useMaitrisePlan(useAuthStore(st => st.hasPermission(PERMISSIONS.MAITRISE_MANAGE)))
  const passageScoutYear = useSettingValue('passage.scout_year') ?? '2026-2027'
  const [scoutYear, setScoutYear] = useState('2026-2027')
  const [statusFilter, setStatusFilter] = useState<string>('Pending')

  // Sync the selected year to the configured passage year once the setting loads (render-phase reset).
  const [prevPassageYear, setPrevPassageYear] = useState(passageScoutYear)
  if (passageScoutYear !== prevPassageYear) { setPrevPassageYear(passageScoutYear); setScoutYear(passageScoutYear) }
  const [unitFilter, setUnitFilter] = useState<string>('_all')
  // With a unit selected: 'members' = every member of the unit with the CU's choices (Pas de changement / Proposer /
  // Quitte le groupe), even those without a line yet; 'lines' = the passage lines to review, as before.
  const [unitView, setUnitView] = useState<'members' | 'lines'>('members')

  const { data: passageStatus, isLoading: statusLoading } = usePassageStatus(scoutYear)
  const { data: summary, isLoading: summaryLoading } = usePassageSummary(scoutYear)
  const { data: passages, isLoading: passagesLoading, isFetching: passagesFetching } = useAllPassages(
    scoutYear,
    statusFilter === '_all' ? undefined : statusFilter,
    unitFilter === '_all' ? undefined : unitFilter,
  )
  const { data: unitsData } = useUnits({ isActive: true, pageSize: 100 })

  const toggleMutation = useTogglePassage()
  const reviewMutation = useReviewPassage()
  const bulkReviewMutation = useBulkReviewPassage()
  const finalizeMutation = useFinalizePassages()
  const submitUnitMutation = useSubmitPassageUnit()
  const reopenUnitMutation = useReopenPassageUnit()
  const remindMutation = useRemindPassageUnits()
  // Remind the leaders of every unit not yet finished (also sent automatically 7 and 2 days before the date).
  const handleRemind = async () => {
    try {
      const r = await remindMutation.mutateAsync({ scoutYear })
      emailToast(`Rappel à ${r.units} unité(s) : ${r.notified} notification(s) envoyée(s), ${r.emails} email(s) mis en file d'envoi`)
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }
  const [unitBusy, setUnitBusy] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editDialog, setEditDialog] = useState<PassageDto | null>(null)
  const [finalizeDialog, setFinalizeDialog] = useState(false)
  const finalizePreview = useFinalizePreview(scoutYear, finalizeDialog)
  // Opening/closing the passage changes what every chef d'unité can do, so it asks for confirmation first.
  const [toggleDialog, setToggleDialog] = useState(false)
  // "Changer la sélection": same decision for every selected line.
  const [bulkChangeOpen, setBulkChangeOpen] = useState(false)
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
  // The CG's leaving decision in the dialog (the destination select offers "Quitte le groupe").
  const [editLeaving, setEditLeaving] = useState(false)
  const [editError, setEditError] = useState('')

  const units = unitsData?.items ?? []
  const { data: rolesData } = useFunctionalRoles()
  const roles = rolesData ?? []
  const { data: teamsData } = useTeams({ unitId: editFinalUnitId || undefined, pageSize: 100 })
  // Youth teams only: chefs aren't part of the passage, so the Maîtrise team is never offered.
  const teams = teamsForSelect(teamsData?.items).filter(t => !t.isMaitrise)

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
    } finally {
      setToggleDialog(false)
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

  // Review-and-modify: open the dialog pre-filled with the final values if already set, else the CU proposal.
  // finalRole is stored by name on the DTO, so resolve it back to a role id for the Select. Loads the member's
  // parcours destinations so the CG picks only from the units the member can actually go to (not every unit).
  const openEditDialog = async (passage: PassageDto) => {
    setEditDialog(passage)
    setEditError('')
    setEditCgNotes(passage.cgNotes ?? '')
    setEditLeaving(passage.finalIsLeaving ?? passage.isLeaving)
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
      if (!editLeaving && (!editFinalUnitId || !editFinalRoleId)) {
        setEditError("Choisissez l'unité et la fonction.")
        return
      }
      await reviewMutation.mutateAsync({
        id: editDialog.id,
        status: 'Approved',
        finalUnitId: editLeaving ? null : editFinalUnitId || null,
        finalTeamId: editLeaving ? null : editFinalTeamId || null,
        finalRoleId: editLeaving ? null : editFinalRoleId || null,
        finalIsLeaving: editLeaving,
        cgNotes: editCgNotes || null,
      })
      toast.success('Ligne de passage enregistrée')
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

  // Post the whole group's passage: lines still waiting are accepted, old assignments end, new ones start.
  const handleFinalize = async () => {
    try {
      const result = await finalizeMutation.mutateAsync({ scoutYear })
      if (result.count > 0) toast.success(`Passage publié : ${result.count} ligne(s)`)
      else toast.info('Rien à publier (déjà publié ?)')
      setFinalizeDialog(false)
    } catch (err) {
      toast.error(parseApiError(err))
      setFinalizeDialog(false)
    }
  }

  // Finish a unit on behalf of its CU, or reopen a finished one so the CU can change it again.
  const toggleUnitFinished = async (unitId: string, finished: boolean) => {
    setUnitBusy(unitId)
    try {
      if (finished) {
        await reopenUnitMutation.mutateAsync({ unitId, scoutYear })
        toast.success('Unité rouverte : le chef d\'unité peut à nouveau modifier')
      } else {
        await submitUnitMutation.mutateAsync({ unitId, scoutYear })
        toast.success('Unité marquée comme terminée')
      }
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setUnitBusy(null)
    }
  }

  const approvedCount = summary?.approved ?? 0
  const pendingCount = summary?.pending ?? 0
  const rejectedCount = summary?.rejected ?? 0
  const finalizedCount = summary?.finalized ?? 0
  // Posting is group-wide: every active member needs a line and every unit must be finished.
  const missingTotal = summary?.missingLines ?? 0
  const unitsNotSubmitted = summary?.unitsNotSubmitted ?? 0
  const unitRows = (summary?.unitSummaries ?? []).filter(u => u.expectedMembers > 0)
  // Maîtrise changes planned on the Maîtrises page go out with this publication (same date).
  const maitriseChanges = (maitrisePlan && maitrisePlan.scoutYear === scoutYear)
    ? maitrisePlan.lines.filter(l => !l.applied).length : 0
  const canFinalize = (approvedCount + pendingCount) > 0 && missingTotal === 0 && unitsNotSubmitted === 0 && rejectedCount === 0
  const step1Done = unitRows.length > 0 && unitsNotSubmitted === 0 && missingTotal === 0
  // Jump to the member lines, filtered to a unit and/or a status.
  const showUnitMembers = unitFilter !== '_all' && unitView === 'members'
  const showLines = (unitId: string | undefined, status: string) => {
    setUnitFilter(unitId ?? '_all')
    setUnitView('lines')
    setStatusFilter(status)
    setSelected(new Set())
    // After the filter re-renders, bring the lines table into view (the page scrolls inside <main>).
    setTimeout(() => document.getElementById('passage-lines')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  const { data: newcomerGroups } = usePassageNewcomerGroups(scoutYear, finalizedCount > 0)

  const downloadNewcomers = async (associationId: string | null) => {
    try {
      const { blob, fileName } = await downloadPassageNewcomersDoc(scoutYear, associationId)
      saveBlob(blob, fileName)
    } catch (err) {
      toast.error(await parseBlobError(err))
    }
  }

  const statusBadge = (p: PassageDto) => {
    if (p.status === 'Finalized') return <Badge variant="info">Publié</Badge>
    if (p.status === 'Rejected') return <Badge variant="destructive">Rejeté (à modifier)</Badge>
    // A line the CG changed is validated too (with the CG's decision) — say both, so it doesn't read as "not done".
    if (p.cgModified) return (
      <div className="flex flex-col items-start gap-0.5">
        <Badge variant="success">Validé</Badge>
        <span className="text-[11px] text-warning">modifié par le CG</span>
      </div>
    )
    if (p.status === 'Approved') return <Badge variant="success">Validé</Badge>
    return <Badge variant="warning">À valider</Badge>
  }

  // Mobile card colours, matching the status badge.
  const mobileTone = (p: PassageDto) => {
    if (p.status === 'Finalized') return { border: 'border-l-sky-500', header: 'bg-sky-50 dark:bg-sky-950/30' }
    if (p.status === 'Rejected') return { border: 'border-l-red-500', header: 'bg-red-50 dark:bg-red-950/30' }
    if (p.status === 'Approved') return { border: 'border-l-green-500', header: 'bg-green-50 dark:bg-green-950/30' }
    return { border: 'border-l-yellow-400', header: 'bg-yellow-50 dark:bg-yellow-950/30' }
  }

  return (
    <Page>
      <PageHeader
        title={`Validation des passages — ${scoutYear}`}
        icon={ArrowRightLeft}
        description="Validez les propositions des chefs d'unité puis publiez le passage."
        actions={<>
          <Select value={scoutYear} onValueChange={setScoutYear}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {/* The configured passage year and the two before it (e.g. 2027-2028, 2026-2027, 2025-2026). */}
              {[0, 1, 2].map(i => { const start = parseInt(passageScoutYear, 10) - i; return `${start}-${start + 1}` }).map(y => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant={passageStatus?.isOpen ? 'success' : 'secondary'}>
            {passageStatus?.isOpen ? 'Ouvert' : 'Fermé'}
          </Badge>
          <Button
            variant={passageStatus?.isOpen ? 'destructive' : 'default'}
            onClick={() => setToggleDialog(true)}
            disabled={toggleMutation.isPending || isLoading}
          >
            {passageStatus?.isOpen ? (
              <><ToggleRight className="mr-1.5 h-4 w-4" />Fermer le passage</>
            ) : (
              <><ToggleLeft className="mr-1.5 h-4 w-4" />Ouvrir le passage</>
            )}
          </Button>
        </>}
      />

      {isLoading ? <LoadingSpinner variant="table" /> : (<>
      {/* Why publishing is blocked — shown first so it's the first thing the CG reads. */}
      {finalizedCount === 0 && (missingTotal > 0 || unitsNotSubmitted > 0) && (
        <div className="space-y-2">
          {missingTotal > 0 && (
            <Callout tone="warning" className="w-full">
              Publication bloquée : {missingTotal} membre(s) actif(s) n'ont pas encore de ligne de passage
              (proposition ou « Pas de changement »). Voir l'étape 1 et le tableau des unités ci-dessous.
            </Callout>
          )}
          {unitsNotSubmitted > 0 && (
            <Callout tone="warning" className="w-full">
              Publication bloquée : {unitsNotSubmitted} unité(s) n'ont pas encore terminé leur passage (voir le tableau des unités ci-dessous).
            </Callout>
          )}
        </div>
      )}

      {/* Where are we? The three steps of the passage, each with its status in plain words. */}
      <div className="grid gap-3 md:grid-cols-3">
        <StepCard
          n={1}
          title="Les chefs d'unité proposent"
          state={step1Done ? 'done' : 'todo'}
          lines={[
            `${unitRows.length - unitsNotSubmitted}/${unitRows.length} unités terminées`,
            missingTotal > 0 ? `${missingTotal} membre(s) sans proposition` : 'Tous les membres ont une proposition',
          ]}
        />
        <StepCard
          n={2}
          title="Le CG valide les changements"
          state={pendingCount === 0 ? 'done' : 'todo'}
          lines={[
            pendingCount > 0 ? `${pendingCount} changement(s) à valider` : 'Rien à valider pour le moment',
            `${approvedCount} validé(s)`,
          ]}
          action={pendingCount > 0 ? { label: 'Voir les changements à valider', onClick: () => showLines(undefined, 'Pending') } : undefined}
        />
        <StepCard
          n={3}
          title="Publier le passage"
          state={finalizedCount > 0 ? 'done' : canFinalize ? 'ready' : 'blocked'}
          lines={(finalizedCount > 0
            ? [`Publié : ${finalizedCount} ligne(s)`]
            : canFinalize
              ? ['Tout est prêt : vous pouvez publier', pendingCount > 0 ? `${pendingCount} ligne(s) à valider le seront automatiquement` : '']
              : ["En attente de l'étape 1", unitsNotSubmitted > 0 ? `${unitsNotSubmitted} unité(s) pas terminée(s)` : '']
            ).concat(maitriseChanges > 0 && finalizedCount === 0 ? [`+ ${maitriseChanges} changement(s) de maîtrise prévu(s) (page Maîtrises)`] : [])}
          action={finalizedCount === 0 && canFinalize ? { label: 'Publier…', onClick: () => setFinalizeDialog(true) } : undefined}
        />
      </div>

      {/* Scheduled automatic publication (date + time) for the configured passage year — or an invitation to schedule. */}
      {scoutYear === passageScoutYear && (
        <PassageFinalizeSchedule
          published={finalizedCount > 0}
          hasLines={approvedCount + pendingCount > 0}
          missing={missingTotal}
          unitsNotFinished={unitsNotSubmitted}
          canManage
        />
      )}

      {/* One row per unit: chef finished? changes to validate? headcount now → next year + arrivals by origin. */}
      <PassageUnitsOverview
        scoutYear={scoutYear}
        summary={summary}
        isOpen={!!passageStatus?.isOpen}
        canRemind={unitsNotSubmitted > 0}
        onRemind={handleRemind}
        reminding={remindMutation.isPending}
        busyUnitId={unitBusy}
        onToggleFinished={toggleUnitFinished}
        onShowMembers={unitId => showLines(unitId, '_all')}
      />

      <div id="passage-lines" className="scroll-mt-20 pt-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {showUnitMembers ? "Membres de l'unité" : 'Lignes de passage'}
          {unitFilter !== '_all' && <Badge variant="outline">{units.find(u => u.id === unitFilter)?.code ?? ''}</Badge>}
          {passagesFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Chargement" />}
        </h2>
        <p className="text-sm text-muted-foreground">{showUnitMembers
          ? "Tous les membres de l'unité, avec ou sans ligne de passage. Vous avez les mêmes choix que le chef d'unité, même si l'unité est terminée."
          : "Une ligne par membre. « À valider » = un changement d'unité proposé par le chef, que le CG doit accepter ou changer."}</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={unitFilter} onValueChange={v => { setUnitFilter(v); setUnitView('members'); setSelected(new Set()) }}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Toutes les unités" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Toutes les unités</SelectItem>
            {units.map(u => <SelectItem key={u.id} value={u.id}>{u.code} — {u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {unitFilter !== '_all' && (
          <SegmentedToggle
            value={unitView}
            onChange={setUnitView}
            options={[
              { value: 'members', label: 'Tous les membres' },
              { value: 'lines', label: 'Lignes de passage' },
            ]}
          />
        )}
        {!showUnitMembers && (<>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Tous les statuts</SelectItem>
            <SelectItem value="Pending">À valider</SelectItem>
            <SelectItem value="Approved">Validés</SelectItem>
            <SelectItem value="Finalized">Publié</SelectItem>
          </SelectContent>
        </Select>
        {/* Default view = every real change (unit move, équipe/fonction change, leaving); toggle to also
            see the "Pas de changement" members (same unit + équipe + fonction, auto-approved). */}
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={showSameUnit} onChange={e => { setShowSameUnit(e.target.checked); setSelected(new Set()) }} />
          Afficher les membres sans changement
          {noChangeCount > 0 && <Badge variant="secondary" className="ml-1">{noChangeCount}</Badge>}
        </label>
        </>)}
      </div>

      {showUnitMembers ? <PassageUnitPanel unitId={unitFilter} embedded /> : (<>

      {/* Bulk actions */}
      {/* On a phone the bar is pinned to the bottom of the screen so it stays visible while ticking cards. */}
      {selected.size > 0 && (
        <Card className="fixed inset-x-2 bottom-2 z-30 border-primary shadow-xl max-md:bg-primary max-md:text-primary-foreground md:static md:inset-auto md:shadow-none">
          <CardContent className="flex flex-col sm:flex-row sm:items-center gap-2 py-3">
            <span className="text-sm font-medium"><span className="md:hidden">Pour la sélection : </span>{selected.size} passage(s) sélectionné(s)</span>
            <div className="flex gap-2 sm:ml-auto">
              <Button size="sm" variant="success" className="flex-1 sm:flex-none" onClick={handleBulkApprove} disabled={bulkReviewMutation.isPending}>
                <Check className="mr-1 h-4 w-4" />Accepter<span className="hidden sm:inline">&nbsp;la sélection</span>
              </Button>
              <Button size="sm" className="flex-1 max-md:ring-1 max-md:ring-primary-foreground/50 sm:flex-none" onClick={() => setBulkChangeOpen(true)}>
                <Pencil className="mr-1 h-4 w-4" />Changer<span className="hidden sm:inline">&nbsp;la sélection</span>
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
        <>
        {/* Desktop: dense table. Phones get a card list below (md:hidden). */}
        <div className="hidden rounded-lg border overflow-x-auto md:block">
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
                <th className="px-3 py-2 text-left font-medium">Notes du chef d'unité</th>
                <th className="px-3 py-2 text-left font-medium">Décision CG / raison</th>
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
                      <Badge variant="warning">Quitte le groupe</Badge>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">{p.currentUnitCode}</span>
                        <ArrowRight className="h-3 w-3" />
                        {/* Struck through when the CG chose something else (see "Décision CG"). */}
                        <span className={p.cgModified ? 'text-muted-foreground line-through' : 'font-medium'}>{p.proposedUnitCode}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{p.proposedTeamName ?? '-'}</td>
                  <td className="px-3 py-2 text-xs">{p.proposedRoleName}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[120px] truncate" title={p.cuNotes ?? ''}>{p.cuNotes ?? ''}</td>
                  <td className="px-3 py-2 text-xs">
                    {p.cgModified ? (
                      <div className="inline-flex flex-wrap items-center gap-1 rounded-md border border-warning-border bg-warning-subtle px-1.5 py-0.5">
                        <ArrowRight className="h-3 w-3 text-warning" />
                        {(p.finalIsLeaving ?? p.isLeaving)
                          ? <span className="font-semibold">Quitte le groupe</span>
                          : <>
                              <span className="font-semibold">{p.finalUnitCode}</span>
                              {p.finalTeamName && <span className="text-muted-foreground"> / {p.finalTeamName}</span>}
                              {p.finalRoleName && <span className="text-muted-foreground"> · {p.finalRoleName}</span>}
                            </>}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Comme proposé</span>
                    )}
                    {p.cgNotes && <div className="text-muted-foreground mt-0.5 italic">{p.cgNotes}</div>}
                  </td>
                  <td className="px-3 py-2">{statusBadge(p)}</td>
                  <td className="px-3 py-2">
                    {/* Published lines can no longer change; "Accepter" only makes sense on a pending line. */}
                    {p.status !== 'Finalized' && <div className="flex gap-1">
                      {p.status === 'Pending' && <Tip content="Accepter">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => quickApprove(p)}
                          disabled={pendingId === p.id}
                          aria-label={`Accepter le passage de ${p.memberName}`}
                        >
                          <Check className="h-3.5 w-3.5 text-success" />
                        </Button>
                      </Tip>}
                      <Tip content="Changer (unité, équipe, fonction) avec une raison">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditDialog(p)}
                          aria-label={`Changer le passage de ${p.memberName}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </Tip>
                    </div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards — one separate, framed card per member (spacing between cards, so each card's buttons
            clearly belong to it). The left border + header tint follow the status; the actions sit in the card's
            own footer as coloured full-width buttons. */}
        <div className={`space-y-3 md:hidden ${selected.size > 0 ? 'pb-28' : ''}`}>
          {visiblePassages.map((p) => {
            const tone = mobileTone(p)
            const leaving = p.cgModified ? (p.finalIsLeaving ?? p.isLeaving) : p.isLeaving
            return (
              <div key={p.id} className={`overflow-hidden rounded-xl border border-l-4 bg-card shadow-sm ${tone.border} ${selected.has(p.id) ? 'ring-2 ring-primary' : ''}`}>
                {/* Header: select + name + status */}
                <label className={`flex items-center gap-3 px-3 py-2.5 ${tone.header}`}>
                  <input type="checkbox" className="h-5 w-5 shrink-0 accent-primary" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} aria-label={`Sélectionner ${p.memberName}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.memberName}</div>
                    {p.cardNumber && <div className="text-xs text-muted-foreground">{p.cardNumber}</div>}
                  </div>
                  <div className="shrink-0">{statusBadge(p)}</div>
                </label>

                {/* Body: the move, then notes */}
                <div className="space-y-2 px-3 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs">{p.currentUnitCode}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {leaving ? (
                      <Badge variant="warning">Quitte le groupe</Badge>
                    ) : (
                      <span className="rounded-md bg-primary/10 px-2 py-1 font-mono text-xs font-semibold text-primary">
                        {p.cgModified ? p.finalUnitCode : p.proposedUnitCode}
                      </span>
                    )}
                  </div>
                  {!leaving && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Équipe</span><div className="font-medium">{(p.cgModified ? p.finalTeamName : p.proposedTeamName) ?? '—'}</div></div>
                      <div><span className="text-muted-foreground">Fonction</span><div className="font-medium">{(p.cgModified ? p.finalRoleName : p.proposedRoleName) ?? '—'}</div></div>
                    </div>
                  )}
                  {p.cgModified && (
                    <Callout tone="warning" className="p-2 text-xs">
                      Modifié par le CG — proposition du chef d'unité : {p.isLeaving ? 'Quitte le groupe' : `${p.proposedUnitCode}${p.proposedTeamName ? ` / ${p.proposedTeamName}` : ''} · ${p.proposedRoleName ?? ''}`}
                    </Callout>
                  )}
                  {p.cuNotes && <p className="text-xs text-muted-foreground"><span className="font-medium">Notes du chef d'unité :</span> {p.cuNotes}</p>}
                  {p.cgNotes && <p className="text-xs italic text-muted-foreground"><span className="font-medium not-italic">Raison :</span> {p.cgNotes}</p>}
                </div>

                {/* Footer: this card's actions */}
                {p.status !== 'Finalized' && (
                  <div className="flex gap-2 border-t bg-muted/30 px-3 py-2.5">
                    {p.status === 'Pending' && (
                      <Button size="sm" variant="success" className="flex-1" onClick={() => quickApprove(p)} disabled={pendingId === p.id}>
                        <Check className="mr-1 h-4 w-4" />Accepter
                      </Button>
                    )}
                    <Button size="sm" className="flex-1" onClick={() => openEditDialog(p)}>
                      <Pencil className="mr-1 h-4 w-4" />Changer
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        </>
      )}
      </>)}

      {/* Post section — group-wide. Accepting a line changes nothing for the member; posting does. */}
      <div className="flex flex-col items-end gap-2 pt-4">
        {rejectedCount > 0 && (
          <Callout tone="danger" className="w-full">
            {rejectedCount} ligne(s) encore « rejetée(s) » : ouvrez-les avec « Changer » et choisissez la destination voulue.
          </Callout>
        )}
        {canFinalize && pendingCount > 0 && (
          <Callout tone="info" className="w-full">
            {pendingCount} ligne(s) encore à valider seront acceptées automatiquement lors de la publication.
          </Callout>
        )}
        {(approvedCount + pendingCount) > 0 && (
          <Button
            id="passage-publish"
            size="lg"
            onClick={() => setFinalizeDialog(true)}
            disabled={!canFinalize || finalizeMutation.isPending}
          >
            <Send className="mr-2 h-5 w-5" />
            {finalizeMutation.isPending ? 'Publication en cours…' : 'Publier le passage'}
          </Button>
        )}
      </div>

      {/* After posting: one Word list of newcomers per association ("Passe à la … :" + names). */}
      {finalizedCount > 0 && (newcomerGroups?.length ?? 0) > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-4">
            <p className="text-sm font-medium">Nouveaux membres par unité — document Word par association</p>
            <div className="flex flex-wrap gap-2">
              {newcomerGroups!.map(g => (
                <Button key={g.associationId ?? 'none'} variant="outline" size="sm" onClick={() => downloadNewcomers(g.associationId)}>
                  <FileText className="mr-1.5 h-4 w-4" />{g.associationName} ({g.count})
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revue du passage — {editDialog?.memberName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {editError && <Callout tone="danger">{editError}</Callout>}

            <Callout tone="muted">
              {editDialog?.isLeaving ? (
                <p><strong>Proposition du chef d'unité :</strong> Quitte le groupe</p>
              ) : (
                <>
                  <p><strong>Proposition du chef d'unité :</strong> {editDialog?.proposedUnitCode} — {editDialog?.proposedUnitName}</p>
                  {editDialog?.proposedTeamName && <p>Équipe : {editDialog.proposedTeamName}</p>}
                  <p>Fonction : {editDialog?.proposedRoleName}</p>
                </>
              )}
              {editDialog?.cuNotes && <p className="text-muted-foreground mt-1">Notes du chef d'unité : {editDialog.cuNotes}</p>}
            </Callout>

            <div className="space-y-2">
              <RequiredLabel required>Unité finale</RequiredLabel>
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
                  <Select value={editLeaving ? '__leave__' : editFinalUnitId} onValueChange={(v) => {
                    if (v === '__leave__') { setEditLeaving(true); return }
                    setEditLeaving(false)
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
                              <SelectLabel>Proposition du chef d'unité</SelectLabel>
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
                      <SelectGroup>
                        <SelectLabel>Départ</SelectLabel>
                        <SelectItem value="__leave__">Quitte le groupe</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )
              })()}
            </div>

            {!editLeaving && (<>
            <div className="space-y-2">
              <RequiredLabel>Équipe finale</RequiredLabel>
              <Select value={editFinalTeamId || '_none'} onValueChange={(v) => setEditFinalTeamId(v === '_none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Aucune équipe" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Aucune équipe</SelectItem>
                  {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <RequiredLabel required>Fonction finale</RequiredLabel>
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
            </>)}

            <div className="space-y-2">
              <RequiredLabel>Raison du changement</RequiredLabel>
              <Input
                value={editCgNotes}
                onChange={e => setEditCgNotes(e.target.value)}
                placeholder="Visible par le chef d'unité…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Annuler</Button>
            <Button onClick={handleEditSubmit} disabled={reviewMutation.isPending}>
              {reviewMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkChangeDialog
        open={bulkChangeOpen}
        onOpenChange={setBulkChangeOpen}
        passages={passageList.filter(p => selected.has(p.id))}
        onDone={() => setSelected(new Set())}
      />

      {/* Finalize Confirm */}
      <ConfirmDialog
        open={finalizeDialog}
        onOpenChange={setFinalizeDialog}
        title="Publier le passage ?"
        description="Le passage est publié pour tout le groupe : les affectations actuelles sont clôturées et les nouvelles créées. Cette action est définitive."
        confirmLabel="Publier"
        loading={finalizeMutation.isPending}
        confirmDisabled={!finalizePreview.data || finalizePreview.data.blockers.length > 0}
        onConfirm={handleFinalize}
      >
        <ActionPreviewPanel data={finalizePreview.data} isLoading={finalizePreview.isLoading} error={finalizePreview.error} />
      </ConfirmDialog>

      {/* Open / close confirm — explains what changes for the chefs d'unité. */}
      <ConfirmDialog
        open={toggleDialog}
        onOpenChange={setToggleDialog}
        title={passageStatus?.isOpen ? 'Fermer le passage ?' : 'Ouvrir le passage ?'}
        description={passageStatus?.isOpen
          ? `Les chefs d'unité ne pourront plus proposer ni modifier les lignes de passage de leur unité pour ${scoutYear}. Vous pourrez le rouvrir plus tard.`
          : `Les chefs d'unité pourront proposer les lignes de passage de leur unité pour ${scoutYear}.`}
        confirmLabel={passageStatus?.isOpen ? 'Fermer le passage' : 'Ouvrir le passage'}
        variant={passageStatus?.isOpen ? 'destructive' : 'default'}
        loading={toggleMutation.isPending}
        onConfirm={handleToggle}
      />
      </>)}
    </Page>
  )
}

// One step of the passage (1 chefs propose · 2 CG validates · 3 publish) with its status in plain words.
function StepCard({ n, title, state, lines, action }: {
  n: number
  title: string
  state: 'done' | 'todo' | 'ready' | 'blocked'
  lines: string[]
  action?: { label: string; onClick: () => void }
}) {
  const tone = {
    done: { ring: 'border-green-300 dark:border-green-800', dot: 'bg-green-600 text-white', label: 'Terminé' },
    ready: { ring: 'border-blue-300 dark:border-blue-800', dot: 'bg-blue-600 text-white', label: 'Prêt' },
    todo: { ring: 'border-amber-300 dark:border-amber-800', dot: 'bg-amber-500 text-white', label: 'En cours' },
    blocked: { ring: '', dot: 'bg-muted text-muted-foreground', label: 'Pas encore' },
  }[state]
  return (
    <Card className={tone.ring}>
      <CardContent className="space-y-2 pt-4">
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tone.dot}`}>
            {state === 'done' ? <Check className="h-4 w-4" /> : n}
          </span>
          <p className="flex-1 font-medium leading-tight">{title}</p>
          <span className="text-xs text-muted-foreground">{tone.label}</span>
        </div>
        <ul className="space-y-0.5 text-sm">
          {lines.filter(Boolean).map((l, i) => <li key={i} className={i === 0 ? 'font-medium' : 'text-muted-foreground'}>{l}</li>)}
        </ul>
        {action && <Button size="sm" variant="outline" className="w-full" onClick={action.onClick}>{action.label}</Button>}
      </CardContent>
    </Card>
  )
}
