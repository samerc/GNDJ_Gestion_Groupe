import { useState } from 'react'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { useFormValidation } from '@/hooks/use-form-validation'
import { useAssignments, useCreateAssignment, useUpdateAssignment, useEndAssignment, useDeleteAssignment, useFunctionalRoles, type AssignmentDto, type AssignmentFormData } from '@/services/assignment-service'
import { useUnits } from '@/services/unit-service'
import { useTeams } from '@/services/team-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Plus, Pencil, Trash2, StopCircle, Building2 } from 'lucide-react'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'

// "Affectations" tab of the member detail page (also reused read-only on Ma fiche for youth).
// Shows the member's current posts (unit / team / functional role) + a year-grouped history
// timeline. Create assigns a new post; edit keeps unit/team/function fixed and only adjusts
// dates; "Terminer aujourd'hui" closes a post by stamping endDate = today (active → history).
// readOnly hides all mutation controls (used when the viewer can't manage assignments).
interface MemberAssignmentsProps {
  memberId: string
  memberName: string
  readOnly?: boolean
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getYear(d: string) {
  return new Date(d).getFullYear()
}

// Human-readable elapsed time between start and end (null end = ongoing, measured to now).
function durationLabel(start: string, end: string | null) {
  const s = new Date(start)
  const e = end ? new Date(end) : new Date()
  const months = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 30))
  if (months < 1) return 'moins d\'un mois'
  if (months < 12) return `${months} mois`
  const years = Math.floor(months / 12)
  const rem = months % 12
  if (rem === 0) return `${years} an${years > 1 ? 's' : ''}`
  return `${years} an${years > 1 ? 's' : ''} et ${rem} mois`
}

export function MemberAssignments({ memberId, memberName, readOnly }: MemberAssignmentsProps) {
  const { data } = useAssignments({ memberId, pageSize: 100 })
  const { data: units } = useUnits({ pageSize: 100 })
  const createMutation = useCreateAssignment()
  const updateMutation = useUpdateAssignment()
  const endMutation = useEndAssignment()
  const deleteMutation = useDeleteAssignment()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AssignmentDto | null>(null)
  const [form, setForm] = useState<AssignmentFormData>({ memberId, unitId: '', functionalRoleId: '', startDate: '' })
  const [deleting, setDeleting] = useState<AssignmentDto | null>(null)
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()

  const { data: teams } = useTeams({ unitId: form.unitId || undefined, pageSize: 100 })
  // Functions are scoped to the chosen unit's type (the endpoint also includes global roles).
  const selectedUnitTypeId = units?.items.find(u => u.id === form.unitId)?.unitTypeId
  const { data: roles } = useFunctionalRoles(selectedUnitTypeId)

  const openCreate = () => {
    setEditing(null)
    setForm({ memberId, unitId: '', teamId: '', functionalRoleId: '', startDate: new Date().toISOString().split('T')[0], notes: '' })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const openEdit = (a: AssignmentDto) => {
    setEditing(a)
    setForm({
      memberId, unitId: a.unitId, teamId: a.teamId ?? '', functionalRoleId: a.functionalRoleId,
      startDate: a.startDate, endDate: a.endDate ?? '', notes: a.notes ?? '',
    })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ unitId: !form.unitId, functionalRoleId: !form.functionalRoleId, startDate: !form.startDate })) return
    try {
      // Empty optional fields normalize to null so the API stores absence, not "".
      const payload = { ...form, teamId: form.teamId || null, endDate: form.endDate || null, notes: form.notes || null }
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload })
        toast.success('Affectation modifiée')
      } else {
        await createMutation.mutateAsync(payload)
        toast.success('Affectation créée')
      }
      setFormOpen(false)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { await deleteMutation.mutateAsync(deleting.id); toast.success('Affectation supprimée'); setDeleting(null) } catch (err) { setError(parseApiError(err)); setDeleting(null) }
  }

  // Split into current posts vs. history; history is newest-first then bucketed per start year.
  const activeAssignments = data?.items.filter(a => a.isActive) ?? []
  const pastAssignments = (data?.items.filter(a => !a.isActive) ?? []).sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())

  // Group past by year
  const pastByYear = pastAssignments.reduce<Record<number, AssignmentDto[]>>((acc, a) => {
    const year = getYear(a.startDate)
    if (!acc[year]) acc[year] = []
    acc[year].push(a)
    return acc
  }, {})
  const sortedYears = Object.keys(pastByYear).map(Number).sort((a, b) => b - a)

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <FormFieldErrors show={hasErrors} />

      {/* Active */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Postes actuels
            </CardTitle>
            {!readOnly && <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-3 w-3" />Ajouter</Button>}
          </div>
        </CardHeader>
        <CardContent>
          {activeAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun poste actuel.</p>
          ) : (
            <div className="space-y-3">
              {activeAssignments.map(a => (
                <div key={a.id} className="flex items-start gap-3 rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
                  <div className="mt-0.5 h-3 w-3 rounded-full bg-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{a.unitName}</span>
                      {a.teamName && <span className="text-muted-foreground">/ {a.teamName}</span>}
                      <Badge variant="default" className="text-xs">{a.functionalRoleName}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Depuis {formatDate(a.startDate)} — {durationLabel(a.startDate, null)}
                    </p>
                    {a.notes && <p className="text-sm text-muted-foreground mt-1 italic">{a.notes}</p>}
                  </div>
                  {!readOnly && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Modifier" onClick={() => openEdit(a)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {/* One-click "end today": closes the post with endDate = today (moves it to history). */}
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Désactiver" onClick={async () => { try { await endMutation.mutateAsync({ id: a.id, endDate: new Date().toISOString().split('T')[0] }); toast.success('Affectation terminée') } catch { /* handled by query refresh */ } }}>
                        <StopCircle className="h-4 w-4 text-orange-500" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleting(a)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timeline history */}
      {sortedYears.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground">Historique</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[5px] top-0 bottom-0 w-px bg-border" />

              {sortedYears.map(year => (
                <div key={year} className="mb-6 last:mb-0">
                  <div className="relative flex items-center gap-3 mb-3">
                    <div className="h-3 w-3 rounded-full bg-muted-foreground/30 shrink-0 z-10" />
                    <span className="text-sm font-semibold text-muted-foreground">{year}</span>
                  </div>
                  <div className="ml-7 space-y-2">
                    {pastByYear[year].map(a => (
                      <div key={a.id} className="group flex items-start gap-3 rounded-md border border-dashed p-3 hover:bg-muted/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{a.unitName}</span>
                            {a.teamName && <span className="text-muted-foreground text-sm">/ {a.teamName}</span>}
                            <Badge variant="secondary" className="text-xs">{a.functionalRoleName}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDate(a.startDate)} — {a.endDate ? formatDate(a.endDate) : '?'} · {durationLabel(a.startDate, a.endDate)}
                          </p>
                          {a.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{a.notes}</p>}
                        </div>
                        {!readOnly && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(a)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Modifier le poste' : `Ajouter un poste pour ${memberName}`}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <FormFieldErrors show={hasErrors} />
            {editing ? (
              /* Edit mode: unit/team/function are read-only */
              <div className="rounded-md bg-muted p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{editing.unitName}</span>
                  {editing.teamName && <span className="text-sm text-muted-foreground">/ {editing.teamName}</span>}
                </div>
                <Badge variant="outline" className="text-xs">{editing.functionalRoleName}</Badge>
              </div>
            ) : (
              /* Create mode: all fields editable */
              <>
                <div className="space-y-2">
                  <RequiredLabel required>Unité</RequiredLabel>
                  <Select value={form.unitId} onValueChange={(v) => { setForm(f => ({ ...f, unitId: v, teamId: '', functionalRoleId: '' })); clearField('unitId') }}>
                    <SelectTrigger className={fieldClass('unitId')}><SelectValue placeholder="Sélectionner une unité..." /></SelectTrigger>
                    <SelectContent>{units?.items.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <RequiredLabel>Équipe</RequiredLabel>
                  <Select value={form.teamId ?? ''} onValueChange={(v) => setForm(f => ({ ...f, teamId: v === 'none' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Aucune équipe" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucune équipe</SelectItem>
                      {teams?.items.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <RequiredLabel required>Fonction</RequiredLabel>
                  <Select value={form.functionalRoleId} onValueChange={(v) => { setForm(f => ({ ...f, functionalRoleId: v })); clearField('functionalRoleId') }} disabled={!form.unitId}>
                    <SelectTrigger className={fieldClass('functionalRoleId')}><SelectValue placeholder={form.unitId ? 'Sélectionner une fonction...' : "Choisir d'abord une unité"} /></SelectTrigger>
                    <SelectContent>{roles?.filter(r => !r.isArchived || r.id === form.functionalRoleId).map(r => <SelectItem key={r.id} value={r.id}>{r.name}{r.isArchived ? ' (archivée)' : ''}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel required>Date de début</RequiredLabel>
                <Input type="date" value={form.startDate} onChange={(e) => { setForm(f => ({ ...f, startDate: e.target.value })); clearField('startDate') }} className={fieldClass('startDate')} required />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Date de fin</RequiredLabel>
                <Input
                  type="date"
                  value={form.endDate ?? ''}
                  onChange={(e) => setForm(f => ({ ...f, endDate: e.target.value || null }))}
                />
              </div>
            </div>
            {editing && !form.endDate && (
              <div className="rounded-md border border-orange-200 bg-orange-50 p-3">
                <p className="text-sm font-medium text-orange-800 mb-2">Terminer l'affectation</p>
                <p className="text-xs text-muted-foreground mb-2">Définir la date de fin pour clôturer ce poste.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-orange-700 border-orange-300 hover:bg-orange-100"
                  onClick={() => setForm(f => ({ ...f, endDate: new Date().toISOString().split('T')[0] }))}
                >
                  <StopCircle className="mr-1 h-3.5 w-3.5" />
                  Terminer aujourd'hui
                </Button>
              </div>
            )}
            {form.endDate && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Poste terminé</Badge>
                <Button type="button" variant="ghost" size="sm" className="text-xs h-6" onClick={() => setForm(f => ({ ...f, endDate: null }))}>
                  Réactiver
                </Button>
              </div>
            )}
            {/* Notes field removed for now — functions don't carry notes (user request 2026-06-26). */}
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Ajouter'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>


      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Supprimer"
        description={`Supprimer le poste de ${deleting?.functionalRoleName} dans ${deleting?.unitName} ?`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
