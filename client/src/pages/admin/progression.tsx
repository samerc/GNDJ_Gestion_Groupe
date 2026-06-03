import { parseApiError } from '@/lib/error-utils'
import { useState } from 'react'
import { useFormValidation } from '@/hooks/use-form-validation'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { useScoutStages, useCreateScoutStage, useUpdateScoutStage, useDeleteScoutStage, type ScoutStageDto, type ScoutStageFormData } from '@/services/progression-service'
import { useBadges, useCreateBadge, useUpdateBadge, useDeleteBadge, type BadgeDto, type BadgeFormData } from '@/services/progression-service'
import { useUnits } from '@/services/unit-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Plus, Pencil, Trash2, Award, Star } from 'lucide-react'

// Get distinct unit types from units
function useUnitTypes() {
  const { data: units } = useUnits({ pageSize: 100 })
  if (!units) return []
  const seen = new Map<string, { id: string; name: string }>()
  for (const u of units.items) {
    if (u.unitTypeId && !seen.has(u.unitTypeId)) {
      seen.set(u.unitTypeId, { id: u.unitTypeId, name: u.unitTypeName })
    }
  }
  return [...seen.values()]
}

export default function ProgressionPage() {
  const unitTypes = useUnitTypes()
  const [unitTypeFilter, setUnitTypeFilter] = useState<string>('')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Progression scoute</h1>
        <Select value={unitTypeFilter || '_all'} onValueChange={(v) => setUnitTypeFilter(v === '_all' ? '' : v)}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Tous les types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Tous les types d'unité</SelectItem>
            {unitTypes.map(ut => <SelectItem key={ut.id} value={ut.id}>{ut.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="stages">
        <TabsList>
          <TabsTrigger value="stages"><Star className="mr-1 h-4 w-4" />Étapes scoutes</TabsTrigger>
          <TabsTrigger value="badges"><Award className="mr-1 h-4 w-4" />Badges</TabsTrigger>
        </TabsList>

        <TabsContent value="stages">
          <StagesTab unitTypeId={unitTypeFilter || undefined} unitTypes={unitTypes} />
        </TabsContent>
        <TabsContent value="badges">
          <BadgesTab unitTypeId={unitTypeFilter || undefined} unitTypes={unitTypes} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Stages Tab ──────────────────────────────
function StagesTab({ unitTypeId, unitTypes }: { unitTypeId?: string; unitTypes: { id: string; name: string }[] }) {
  const { data, isLoading } = useScoutStages(unitTypeId)
  const createMutation = useCreateScoutStage()
  const updateMutation = useUpdateScoutStage()
  const deleteMutation = useDeleteScoutStage()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ScoutStageDto | null>(null)
  const [deleting, setDeleting] = useState<ScoutStageDto | null>(null)
  const [form, setForm] = useState<ScoutStageFormData>({ unitTypeId: '', code: '', name: '', description: '', displayOrder: 0, isActive: true, isBadgeStage: false })
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()

  const openCreate = () => {
    setEditing(null)
    setForm({ unitTypeId: unitTypeId ?? '', code: '', name: '', description: '', displayOrder: 0, isActive: true, isBadgeStage: false })
    setError(''); clearAll(); setFormOpen(true)
  }

  const openEdit = (item: ScoutStageDto) => {
    setEditing(item)
    setForm({ unitTypeId: item.unitTypeId, code: item.code, name: item.name, description: item.description ?? '', displayOrder: item.displayOrder, isActive: item.isActive, isBadgeStage: item.isBadgeStage })
    setError(''); clearAll(); setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    if (!validate({ code: !form.code, name: !form.name, unitTypeId: !form.unitTypeId })) return
    try {
      if (editing) await updateMutation.mutateAsync({ id: editing.id, ...form })
      else await createMutation.mutateAsync(form)
      setFormOpen(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { await deleteMutation.mutateAsync(deleting.id); setDeleting(null) }
    catch (err) { setError(parseApiError(err)); setDeleting(null) }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />Nouvelle étape</Button>
      </div>

      {isLoading ? <LoadingSpinner /> : !data || data.length === 0 ? (
        <EmptyState icon={Star} title="Aucune étape" description="Créez les étapes de progression pour chaque type d'unité." action={<Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />Créer</Button>} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Type d'unité</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Options</TableHead>
              <TableHead className="text-center">Ordre</TableHead>
              <TableHead className="text-center">Utilisations</TableHead>
              <TableHead className="w-24" />
            </TableRow></TableHeader>
            <TableBody>
              {data.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="text-muted-foreground">{item.unitTypeName}</TableCell>
                  <TableCell className="font-medium">{item.code}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {item.isActive ? <Badge className="bg-green-600">Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}
                      {item.isBadgeStage && <Badge variant="outline">Badge</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">{item.displayOrder}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{item.progressionCount}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleting(item)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Modifier l\'étape' : 'Nouvelle étape'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <FormFieldErrors show={hasErrors} />
            {!editing && (
              <div className="space-y-2">
                <RequiredLabel required>Type d'unité</RequiredLabel>
                <Select value={form.unitTypeId} onValueChange={(v) => { setForm(f => ({ ...f, unitTypeId: v })); clearField('unitTypeId') }}>
                  <SelectTrigger className={fieldClass('unitTypeId')}><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>{unitTypes.map(ut => <SelectItem key={ut.id} value={ut.id}>{ut.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel required>Code</RequiredLabel>
                <Input className={fieldClass('code')} value={form.code} onChange={(e) => { setForm(f => ({ ...f, code: e.target.value })); clearField('code') }} required />
              </div>
              <div className="space-y-2">
                <RequiredLabel required>Nom</RequiredLabel>
                <Input className={fieldClass('name')} value={form.name} onChange={(e) => { setForm(f => ({ ...f, name: e.target.value })); clearField('name') }} required />
              </div>
            </div>
            <div className="space-y-2">
              <RequiredLabel>Description</RequiredLabel>
              <Input value={form.description ?? ''} onChange={(e) => setForm(f => ({ ...f, description: e.target.value || null }))} />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Ordre d'affichage</RequiredLabel>
              <Input type="number" value={form.displayOrder} onChange={(e) => setForm(f => ({ ...f, displayOrder: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} />Actif</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isBadgeStage} onChange={(e) => setForm(f => ({ ...f, isBadgeStage: e.target.checked }))} />Étape de type badge</label>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} title="Supprimer l'étape" description={`Supprimer « ${deleting?.name} » ?`} confirmLabel="Supprimer" variant="destructive" loading={deleteMutation.isPending} onConfirm={handleDelete} />
    </div>
  )
}

// ─── Badges Tab ──────────────────────────────
function BadgesTab({ unitTypeId, unitTypes }: { unitTypeId?: string; unitTypes: { id: string; name: string }[] }) {
  const { data, isLoading } = useBadges(unitTypeId)
  const createMutation = useCreateBadge()
  const updateMutation = useUpdateBadge()
  const deleteMutation = useDeleteBadge()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<BadgeDto | null>(null)
  const [deleting, setDeleting] = useState<BadgeDto | null>(null)
  const [form, setForm] = useState<BadgeFormData>({ unitTypeId: '', code: '', name: '', description: '', displayOrder: 0, isActive: true })
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()

  const openCreate = () => {
    setEditing(null)
    setForm({ unitTypeId: unitTypeId ?? '', code: '', name: '', description: '', displayOrder: 0, isActive: true })
    setError(''); clearAll(); setFormOpen(true)
  }

  const openEdit = (item: BadgeDto) => {
    setEditing(item)
    setForm({ unitTypeId: item.unitTypeId, code: item.code, name: item.name, description: item.description ?? '', displayOrder: item.displayOrder, isActive: item.isActive })
    setError(''); clearAll(); setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    if (!validate({ code: !form.code, name: !form.name, unitTypeId: !form.unitTypeId })) return
    try {
      if (editing) await updateMutation.mutateAsync({ id: editing.id, ...form })
      else await createMutation.mutateAsync(form)
      setFormOpen(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { await deleteMutation.mutateAsync(deleting.id); setDeleting(null) }
    catch (err) { setError(parseApiError(err)); setDeleting(null) }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />Nouveau badge</Button>
      </div>

      {isLoading ? <LoadingSpinner /> : !data || data.length === 0 ? (
        <EmptyState icon={Award} title="Aucun badge" description="Créez les badges pour chaque type d'unité." action={<Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />Créer</Button>} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Type d'unité</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-center">Ordre</TableHead>
              <TableHead className="text-center">Utilisations</TableHead>
              <TableHead className="w-24" />
            </TableRow></TableHeader>
            <TableBody>
              {data.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="text-muted-foreground">{item.unitTypeName}</TableCell>
                  <TableCell className="font-medium">{item.code}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.isActive ? <Badge className="bg-green-600">Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{item.displayOrder}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{item.progressionCount}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleting(item)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Modifier le badge' : 'Nouveau badge'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <FormFieldErrors show={hasErrors} />
            {!editing && (
              <div className="space-y-2">
                <RequiredLabel required>Type d'unité</RequiredLabel>
                <Select value={form.unitTypeId} onValueChange={(v) => { setForm(f => ({ ...f, unitTypeId: v })); clearField('unitTypeId') }}>
                  <SelectTrigger className={fieldClass('unitTypeId')}><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>{unitTypes.map(ut => <SelectItem key={ut.id} value={ut.id}>{ut.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><RequiredLabel required>Code</RequiredLabel><Input className={fieldClass('code')} value={form.code} onChange={(e) => { setForm(f => ({ ...f, code: e.target.value })); clearField('code') }} required /></div>
              <div className="space-y-2"><RequiredLabel required>Nom</RequiredLabel><Input className={fieldClass('name')} value={form.name} onChange={(e) => { setForm(f => ({ ...f, name: e.target.value })); clearField('name') }} required /></div>
            </div>
            <div className="space-y-2"><RequiredLabel>Description</RequiredLabel><Input value={form.description ?? ''} onChange={(e) => setForm(f => ({ ...f, description: e.target.value || null }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><RequiredLabel>Ordre</RequiredLabel><Input type="number" value={form.displayOrder} onChange={(e) => setForm(f => ({ ...f, displayOrder: parseInt(e.target.value) || 0 }))} /></div>
              <div className="flex items-end pb-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} />Actif</label></div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} title="Supprimer le badge" description={`Supprimer « ${deleting?.name} » ?`} confirmLabel="Supprimer" variant="destructive" loading={deleteMutation.isPending} onConfirm={handleDelete} />
    </div>
  )
}
