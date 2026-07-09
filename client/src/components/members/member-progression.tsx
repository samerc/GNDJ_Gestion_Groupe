import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { useState, useMemo } from 'react'
import { useMemberProgressions, useCreateProgression, useDeleteProgression, useScoutStageList, useBadgeList, type MemberProgressionDto } from '@/services/progression-service'
import { useProposeProgression, useMyChangeRequests, useProposableUnits } from '@/services/change-request-service'
import { useAssignments } from '@/services/assignment-service'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Tip } from '@/components/ui/tooltip'
import { Plus, Trash2, Star, Award, MapPin, Calendar } from 'lucide-react'

// "Progression" tab of the member detail page / Ma fiche / CU dashboard. Lists the member's
// recorded progression entries (a scout stage, plus a badge when the stage is a badge-stage,
// with date/location/notes) and lets a manager add/delete them. Stage & badge pickers are
// scoped to the member's unit TYPE (a Meute has different stages than a Troupe). unitId/
// unitTypeId can be passed in, else they're auto-resolved from the active assignment below.
interface Props {
  memberId: string
  unitId?: string      // current unit for default
  unitTypeId?: string  // to load stages/badges for the right unit type
  // selfPropose = the member on Ma fiche without progression.manage: they PROPOSE a progression (pending
  // CU/CG approval) instead of adding it directly. Managers always add directly.
  selfPropose?: boolean
}

export function MemberProgression({ memberId, unitId: propUnitId, unitTypeId: propUnitTypeId, selfPropose }: Props) {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission(PERMISSIONS.PROGRESSION_MANAGE)
  // A member proposing (no manage permission) may target ANY active unit; a manager records against the
  // member's own units (current + past).
  const proposing = !!(selfPropose && !canManage)
  const { data: progressions, isLoading } = useMemberProgressions(memberId)
  const proposeMutation = useProposeProgression()
  const { data: myRequests } = useMyChangeRequests(selfPropose)
  const { data: proposableUnits } = useProposableUnits(proposing)
  // My pending progression proposals (shown to the member while they await approval).
  const pendingProgressions = (myRequests ?? []).filter(r => r.kind === 'Progression' && r.status === 'Pending')

  // Fetch the member's FULL assignment history so a progression can be recorded against a PREVIOUS unit
  // (e.g. a Meute badge earned before the member moved to Compagnie), not just their current unit.
  const { data: assignmentsData } = useAssignments({ memberId, pageSize: 100 })
  const activeAssignment = assignmentsData?.items.find(a => !a.endDate)

  // Distinct units the member has belonged to (current + past), current unit(s) listed first. Each carries
  // its unitTypeId so selecting a unit loads that unit type's stages/badges.
  const memberUnits = useMemo(() => {
    const seen = new Map<string, { unitId: string; unitName: string; unitTypeId: string; isActive: boolean }>()
    for (const a of assignmentsData?.items ?? []) {
      const existing = seen.get(a.unitId)
      const isActive = !a.endDate
      if (!existing) seen.set(a.unitId, { unitId: a.unitId, unitName: a.unitName, unitTypeId: a.unitTypeId, isActive })
      else if (isActive) existing.isActive = true // a unit is "current" if ANY of its assignments is active
    }
    return [...seen.values()].sort((x, y) => (Number(y.isActive) - Number(x.isActive)) || x.unitName.localeCompare(y.unitName))
  }, [assignmentsData])

  const createMutation = useCreateProgression(memberId)
  const deleteMutation = useDeleteProgression(memberId)

  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<MemberProgressionDto | null>(null)
  const [error, setError] = useState('')

  // form.unitId picks WHICH of the member's units the progression belongs to; it drives the stage/badge lists.
  const [form, setForm] = useState({ unitId: '', scoutStageId: '', badgeId: '', date: '', location: '', notes: '' })

  // Unit picker options: a member proposing sees ALL active units; a manager sees the member's own units.
  const unitPickerOptions = proposing
    ? (proposableUnits ?? []).map(u => ({ unitId: u.id, unitName: u.name, unitTypeId: u.unitTypeId, isActive: false }))
    : memberUnits

  // Stages/badges load for the SELECTED unit's type (fall back to props / active assignment).
  const selectedUnit = unitPickerOptions.find(u => u.unitId === form.unitId)
  const selectedUnitTypeId = selectedUnit?.unitTypeId ?? propUnitTypeId ?? activeAssignment?.unitTypeId
  const { data: stages } = useScoutStageList(selectedUnitTypeId ?? '')

  // Badges only load (and the badge field only shows) when the chosen stage is a badge-stage.
  const selectedStage = stages?.find(s => s.id === form.scoutStageId)
  const { data: badges } = useBadgeList(selectedStage?.isBadgeStage ? (selectedUnitTypeId ?? '') : '')

  const openCreate = () => {
    // Default to the member's current unit (else the first/most-recent unit in their history).
    const defaultUnitId = propUnitId ?? activeAssignment?.unitId ?? unitPickerOptions[0]?.unitId ?? ''
    setForm({ unitId: defaultUnitId, scoutStageId: '', badgeId: '', date: new Date().toISOString().split('T')[0], location: '', notes: '' })
    setError('')
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.unitId) { setError("Veuillez sélectionner une unité."); return }
    if (!form.scoutStageId) { setError("Veuillez sélectionner une étape."); return }
    if (selectedStage?.isBadgeStage && !form.badgeId) { setError("Veuillez sélectionner un badge."); return }
    if (!form.date) { setError("La date est requise."); return }

    const payload = {
      unitId: form.unitId,
      scoutStageId: form.scoutStageId,
      badgeId: selectedStage?.isBadgeStage ? form.badgeId : null,
      date: form.date,
      location: form.location || null,
      notes: form.notes || null,
    }
    try {
      if (hasPermission(PERMISSIONS.PROGRESSION_MANAGE)) {
        // Manager: record it directly.
        await createMutation.mutateAsync({ memberId, ...payload })
        toast.success('Progression ajoutée')
      } else {
        // Member: submit a proposal for CU/CG approval.
        await proposeMutation.mutateAsync(payload)
        toast.success('Proposition envoyée — en attente d\'approbation')
      }
      setFormOpen(false)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { await deleteMutation.mutateAsync(deleting.id); toast.success('Progression supprimée'); setDeleting(null) }
    catch (err) { setError(parseApiError(err)); setDeleting(null) }
  }

  if (isLoading) return <LoadingSpinner />

  // Show the add/propose button to a manager (with a target unit) or to a member proposing on their own fiche.
  const canAddOrPropose = (canManage && memberUnits.length > 0) || proposing

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {/* A member's pending progression proposals (awaiting CU/CG approval). */}
      {selfPropose && pendingProgressions.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50/70 p-3 text-sm">
          <p className="font-medium text-amber-800">En attente d'approbation</p>
          <ul className="mt-1 space-y-0.5 text-amber-800">
            {pendingProgressions.map(r => <li key={r.id}>• {r.summary}</li>)}
          </ul>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Star className="h-4 w-4" />Progression scoute</CardTitle>
            {canAddOrPropose && (
              <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-3 w-3" />{canManage ? 'Ajouter' : 'Proposer'}</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!progressions || progressions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune progression enregistrée.</p>
          ) : (
            <div className="space-y-3">
              {progressions.map(p => (
                <div key={p.id} className="flex items-start gap-3 rounded-md border p-3">
                  {p.badgeName ? (
                    <Award className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                  ) : (
                    <Star className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{p.scoutStageName}</span>
                      {p.badgeName && <Badge variant="outline" className="gap-1"><Award className="h-3 w-3" />{p.badgeName}</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(p.date).toLocaleDateString('fr-FR')}</span>
                      {p.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{p.location}</span>}
                      <span>{p.unitName}</span>
                    </div>
                    {p.notes && <p className="mt-1 text-xs text-muted-foreground">{p.notes}</p>}
                  </div>
                  {canManage && (
                    <Tip content="Supprimer"><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setDeleting(p)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button></Tip>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{canManage ? 'Nouvelle progression' : 'Proposer une progression'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

            {/* Unit picker — record against the member's current unit OR a previous one (a stage/badge earned
                before the member moved units). Changing the unit reloads that unit type's stages/badges. */}
            <div className="space-y-2">
              <RequiredLabel required>Unité</RequiredLabel>
              <Select value={form.unitId} onValueChange={(v) => setForm(f => ({ ...f, unitId: v, scoutStageId: '', badgeId: '' }))}>
                <SelectTrigger><SelectValue placeholder="Sélectionner une unité..." /></SelectTrigger>
                <SelectContent>
                  {unitPickerOptions.map(u => (
                    <SelectItem key={u.unitId} value={u.unitId}>{u.unitName}{proposing ? '' : (u.isActive ? ' (actuelle)' : ' (ancienne)')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <RequiredLabel required>Étape scoute</RequiredLabel>
              <Select value={form.scoutStageId} onValueChange={(v) => setForm(f => ({ ...f, scoutStageId: v, badgeId: '' }))}>
                <SelectTrigger><SelectValue placeholder="Sélectionner une étape..." /></SelectTrigger>
                <SelectContent>
                  {stages?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {selectedStage?.isBadgeStage && (
              <div className="space-y-2">
                <RequiredLabel required>Badge</RequiredLabel>
                <Select value={form.badgeId} onValueChange={(v) => setForm(f => ({ ...f, badgeId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner un badge..." /></SelectTrigger>
                  <SelectContent>
                    {badges?.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel required>Date</RequiredLabel>
                <Input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Lieu</RequiredLabel>
                <Input value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Camp, local..." />
              </div>
            </div>

            <div className="space-y-2">
              <RequiredLabel>Remarques</RequiredLabel>
              <textarea className="flex min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending || proposeMutation.isPending}>{canManage ? 'Enregistrer' : 'Proposer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} title="Supprimer" description={`Supprimer cette progression ?`} confirmLabel="Supprimer" variant="destructive" loading={deleteMutation.isPending} onConfirm={handleDelete} />
    </div>
  )
}
