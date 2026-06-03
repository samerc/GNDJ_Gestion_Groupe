import { parseApiError } from '@/lib/error-utils'
import { useState } from 'react'
import { useMemberProgressions, useCreateProgression, useDeleteProgression, useScoutStageList, useBadgeList, type MemberProgressionDto } from '@/services/progression-service'
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
import { Plus, Trash2, Star, Award, MapPin, Calendar } from 'lucide-react'

interface Props {
  memberId: string
  unitId?: string      // current unit for default
  unitTypeId?: string  // to load stages/badges for the right unit type
}

export function MemberProgression({ memberId, unitId: propUnitId, unitTypeId: propUnitTypeId }: Props) {
  const { hasPermission } = useAuthStore()
  const { data: progressions, isLoading } = useMemberProgressions(memberId)

  // Auto-resolve unitId/unitTypeId from active assignment if not provided
  const { data: assignmentsData } = useAssignments({ memberId, isActive: true, pageSize: 1 })
  const activeAssignment = assignmentsData?.items[0]
  const unitId = propUnitId ?? activeAssignment?.unitId
  const unitTypeId = propUnitTypeId ?? activeAssignment?.unitTypeId

  const { data: stages } = useScoutStageList(unitTypeId ?? '')
  const createMutation = useCreateProgression(memberId)
  const deleteMutation = useDeleteProgression(memberId)

  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<MemberProgressionDto | null>(null)
  const [error, setError] = useState('')

  const [form, setForm] = useState({ scoutStageId: '', badgeId: '', date: '', location: '', notes: '' })

  const selectedStage = stages?.find(s => s.id === form.scoutStageId)
  const { data: badges } = useBadgeList(selectedStage?.isBadgeStage ? (unitTypeId ?? '') : '')

  const openCreate = () => {
    setForm({ scoutStageId: '', badgeId: '', date: new Date().toISOString().split('T')[0], location: '', notes: '' })
    setError('')
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.scoutStageId) { setError("Veuillez sélectionner une étape."); return }
    if (selectedStage?.isBadgeStage && !form.badgeId) { setError("Veuillez sélectionner un badge."); return }
    if (!form.date) { setError("La date est requise."); return }

    try {
      await createMutation.mutateAsync({
        memberId,
        unitId: unitId ?? '',
        scoutStageId: form.scoutStageId,
        badgeId: selectedStage?.isBadgeStage ? form.badgeId : null,
        date: form.date,
        location: form.location || null,
        notes: form.notes || null,
      })
      setFormOpen(false)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { await deleteMutation.mutateAsync(deleting.id); setDeleting(null) }
    catch (err) { setError(parseApiError(err)); setDeleting(null) }
  }

  if (isLoading) return <LoadingSpinner />

  const canManage = hasPermission(PERMISSIONS.PROGRESSION_MANAGE)

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Star className="h-4 w-4" />Progression scoute</CardTitle>
            {canManage && unitTypeId && (
              <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-3 w-3" />Ajouter</Button>
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
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setDeleting(p)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
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
          <DialogHeader><DialogTitle>Nouvelle progression</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

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
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} title="Supprimer" description={`Supprimer cette progression ?`} confirmLabel="Supprimer" variant="destructive" loading={deleteMutation.isPending} onConfirm={handleDelete} />
    </div>
  )
}
