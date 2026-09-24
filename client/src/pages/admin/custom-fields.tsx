// Admin CRUD screen for Custom Fields (super-admin) — admin-defined extra member attributes
// (text/number/select/boolean) surfaced on the member "Infos complémentaires" tab and optionally on
// the member card PDF (showOnCard). Not paginated (small set). Order is set by drag-and-drop (no manual
// number). Each field can be TARGETED — it appears only for members matching a role (maîtrise/jeunes),
// a branche (unit type) and/or a unité — and its value's VISIBILITY can be restricted (leaders / CG only).
// For type=select, the comma-separated options string is serialized to/from a JSON string array (handleSubmit/openEdit).
import { parseApiError } from '@/lib/error-utils'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { useFormValidation } from '@/hooks/use-form-validation'
import {
  useCustomFields, useCreateCustomField, useUpdateCustomField, useDeleteCustomField, useReorderCustomFields,
  type CustomFieldDto, type CustomFieldEditableBy, type CustomFieldRole, type CustomFieldScope, type CustomFieldVisibleTo,
} from '@/services/custom-field-service'
import { useUnits } from '@/services/unit-service'
import { useUnitTypes } from '@/services/unit-type-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Page } from '@/components/shared/page'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, ListPlus, GripVertical, Users, Eye } from 'lucide-react'
import { Tip } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { BackLink } from '@/components/shared/back-link'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Texte', number: 'Nombre', select: 'Liste', boolean: 'Oui/Non',
}

// Who fills the field's value — label shown in the admin form.
const EDITABLE_BY_LABELS: Record<CustomFieldEditableBy, string> = {
  Member: 'Le membre', UnitLeader: "Chef d'unité", GroupLeader: 'Chef de groupe',
}
const ROLE_LABELS: Record<CustomFieldRole, string> = {
  all: 'Tous', maitrise: 'Maîtrise', youth: 'Jeunes',
}
// Compact badge labels for the list. Named-audience framing (member as the pivot) — see the select below.
const VISIBLE_LABELS: Record<CustomFieldVisibleTo, string> = {
  all: 'Membre + chefs', leaders: 'Chefs seulement', groupLeaders: 'Chef de groupe',
}

interface FormData {
  name: string
  code: string
  fieldType: string
  options: string
  isActive: boolean
  showOnCard: boolean
  editableBy: CustomFieldEditableBy
  appliesToRole: CustomFieldRole
  appliesToScope: CustomFieldScope
  appliesToUnitTypeId: string | null
  appliesToUnitId: string | null
  visibleTo: CustomFieldVisibleTo
}

const defaultForm: FormData = {
  name: '', code: '', fieldType: 'text', options: '', isActive: true, showOnCard: false, editableBy: 'UnitLeader',
  appliesToRole: 'all', appliesToScope: 'all', appliesToUnitTypeId: null, appliesToUnitId: null, visibleTo: 'all',
}

// Slugify the display name into a stable storage code (lowercase, accents stripped, non-alnum → "_").
function nameToCode(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export default function CustomFieldsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CustomFieldDto | null>(null)
  const [deleting, setDeleting] = useState<CustomFieldDto | null>(null)
  const [form, setForm] = useState<FormData>(defaultForm)
  const [error, setError] = useState('')
  const [codeManual, setCodeManual] = useState(false)
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()

  const { data: fields, isLoading } = useCustomFields()
  const createMutation = useCreateCustomField()
  const updateMutation = useUpdateCustomField()
  const deleteMutation = useDeleteCustomField()
  const reorderMutation = useReorderCustomFields()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Pickers for the "branche" / "unité" targeting (loaded only while the form is open).
  const { data: unitTypesData } = useUnitTypes({ pageSize: 100 }, formOpen)
  const { data: unitsData } = useUnits({ isActive: true, pageSize: 500 }, formOpen)
  const unitTypes = unitTypesData?.items ?? []
  const units = unitsData?.items ?? []

  // Local order copy for a smooth drag (arrayMove locally, then persist). Synced from the query (render-phase),
  // initialized from possibly-warm cache so the list is never stuck empty.
  const [items, setItems] = useState<CustomFieldDto[]>(fields ?? [])
  const [prevFields, setPrevFields] = useState(fields)
  if (fields && fields !== prevFields) { setPrevFields(fields); setItems(fields) }

  const openCreate = () => {
    setEditing(null)
    setForm(defaultForm)
    setCodeManual(false)
    setError(''); clearAll()
    setFormOpen(true)
  }

  const openEdit = (item: CustomFieldDto) => {
    setEditing(item)
    const opts = item.options ? (() => { try { return (JSON.parse(item.options) as string[]).join(', ') } catch { return '' } })() : ''
    setForm({
      name: item.name, code: item.code, fieldType: item.fieldType, options: opts, isActive: item.isActive,
      showOnCard: item.showOnCard, editableBy: item.editableBy,
      appliesToRole: item.appliesToRole, appliesToScope: item.appliesToScope,
      appliesToUnitTypeId: item.appliesToUnitTypeId, appliesToUnitId: item.appliesToUnitId, visibleTo: item.visibleTo,
    })
    setCodeManual(true) // never auto-rewrite an existing field's code from its name
    setError(''); clearAll()
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ name: !form.name, code: !form.code })) return

    const optionsJson = form.fieldType === 'select' && form.options.trim()
      ? JSON.stringify(form.options.split(',').map(o => o.trim()).filter(Boolean))
      : null

    // Only send the scope id relevant to the chosen scope (the backend also nulls the rest).
    const payload = {
      name: form.name, code: form.code, fieldType: form.fieldType, options: optionsJson,
      isActive: form.isActive, showOnCard: form.showOnCard, editableBy: form.editableBy,
      appliesToRole: form.appliesToRole, appliesToScope: form.appliesToScope,
      appliesToUnitTypeId: form.appliesToScope === 'unitType' ? form.appliesToUnitTypeId : null,
      appliesToUnitId: form.appliesToScope === 'unit' ? form.appliesToUnitId : null,
      visibleTo: form.visibleTo,
    }

    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, displayOrder: editing.displayOrder, ...payload })
        toast.success('Champ personnalisé modifié')
      } else {
        // Append new fields to the end (drag-and-drop then reorders); displayOrder just seeds the position.
        await createMutation.mutateAsync({ displayOrder: items.length, ...payload })
        toast.success('Champ personnalisé créé')
      }
      setFormOpen(false)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteMutation.mutateAsync(deleting.id)
      toast.success('Champ personnalisé supprimé')
      setDeleting(null)
    } catch (err) {
      toast.error(parseApiError(err))
      setDeleting(null)
    }
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex(i => i.id === active.id)
    const newIndex = items.findIndex(i => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const next = arrayMove(items, oldIndex, newIndex)
    setItems(next) // optimistic
    reorderMutation.mutate(next.map(i => i.id), { onError: (err) => toast.error(parseApiError(err)) })
  }

  const isSaving = createMutation.isPending || updateMutation.isPending
  const canReorder = items.length > 1

  const newFieldButton = (
    <Button onClick={openCreate}>
      <Plus className="mr-1.5 h-4 w-4" />
      Nouveau champ
    </Button>
  )

  return (
    <Page>
      {embedded ? (
        <div className="flex justify-end">{newFieldButton}</div>
      ) : (
        <>
          <BackLink to="/admin/settings" label="Retour aux paramètres" />
          <PageHeader title="Champs personnalisés" icon={ListPlus} actions={newFieldButton} />
        </>
      )}

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListPlus}
          title="Aucun champ personnalisé"
          description="Créez votre premier champ personnalisé."
          action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Créer</Button>}
        />
      ) : (
        <>
          {canReorder && <p className="text-xs text-muted-foreground">Glissez pour réordonner. Cet ordre s'applique à la fiche membre et à la carte.</p>}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy} disabled={!canReorder}>
              <ul className="space-y-2">
                {items.map((item) => (
                  <SortableFieldRow key={item.id} item={item} canReorder={canReorder} onEdit={() => openEdit(item)} onDelete={() => setDeleting(item)} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le champ personnalisé' : 'Nouveau champ personnalisé'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            {hasErrors && <FormFieldErrors show={hasErrors} />}
            <div className="space-y-2">
              <RequiredLabel htmlFor="cf-name" required>Nom</RequiredLabel>
              <Input id="cf-name" className={fieldClass('name')} value={form.name} onChange={(e) => {
                const name = e.target.value
                setForm(f => ({ ...f, name, ...(!codeManual ? { code: nameToCode(name) } : {}) }))
                clearField('name')
              }} required />
            </div>
            <div className="space-y-2">
              <RequiredLabel htmlFor="cf-code" required>Code</RequiredLabel>
              <Input id="cf-code" className={fieldClass('code')} value={form.code} onChange={(e) => {
                setForm(f => ({ ...f, code: e.target.value }))
                setCodeManual(true)
                clearField('code')
              }} required />
            </div>
            <div className="space-y-2">
              <RequiredLabel htmlFor="cf-type" required>Type</RequiredLabel>
              <Select value={form.fieldType} onValueChange={(v) => setForm(f => ({ ...f, fieldType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texte</SelectItem>
                  <SelectItem value="number">Nombre</SelectItem>
                  <SelectItem value="select">Liste</SelectItem>
                  <SelectItem value="boolean">Oui/Non</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.fieldType === 'select' && (
              <div className="space-y-2">
                <RequiredLabel htmlFor="cf-options">Options (séparées par des virgules)</RequiredLabel>
                <Input id="cf-options" value={form.options} onChange={(e) => setForm(f => ({ ...f, options: e.target.value }))} placeholder="Option 1, Option 2, Option 3" />
              </div>
            )}
            <div className="space-y-2">
              <RequiredLabel htmlFor="cf-editable">Rempli par</RequiredLabel>
              <Select value={form.editableBy} onValueChange={(v) => setForm(f => ({ ...f, editableBy: v as CustomFieldEditableBy }))}>
                <SelectTrigger id="cf-editable"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Member">Le membre (et les chefs)</SelectItem>
                  <SelectItem value="UnitLeader">Chef d'unité (et chef de groupe)</SelectItem>
                  <SelectItem value="GroupLeader">Chef de groupe uniquement</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Qui peut renseigner ce champ. Un niveau supérieur peut toujours modifier les champs des niveaux inférieurs.
              </p>
            </div>

            {/* ── Targeting: which members the field appears for ── */}
            <div className="space-y-3 rounded-md border p-3">
              <p className="flex items-center gap-2 text-sm font-medium"><Users className="h-4 w-4 text-muted-foreground" />Apparaît pour</p>
              <div className="space-y-2">
                <RequiredLabel htmlFor="cf-role">Rôle</RequiredLabel>
                <Select value={form.appliesToRole} onValueChange={(v) => setForm(f => ({ ...f, appliesToRole: v as CustomFieldRole }))}>
                  <SelectTrigger id="cf-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les membres</SelectItem>
                    <SelectItem value="maitrise">Maîtrise (chefs) uniquement</SelectItem>
                    <SelectItem value="youth">Jeunes uniquement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="cf-scope">Portée</RequiredLabel>
                <Select value={form.appliesToScope} onValueChange={(v) => setForm(f => ({ ...f, appliesToScope: v as CustomFieldScope, appliesToUnitTypeId: null, appliesToUnitId: null }))}>
                  <SelectTrigger id="cf-scope"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les unités</SelectItem>
                    <SelectItem value="unitType">Une branche (type d'unité)</SelectItem>
                    <SelectItem value="unit">Une unité</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.appliesToScope === 'unitType' && (
                <div className="space-y-2">
                  <RequiredLabel htmlFor="cf-branche" required>Branche</RequiredLabel>
                  <Select value={form.appliesToUnitTypeId ?? ''} onValueChange={(v) => setForm(f => ({ ...f, appliesToUnitTypeId: v }))}>
                    <SelectTrigger id="cf-branche"><SelectValue placeholder="Choisir une branche…" /></SelectTrigger>
                    <SelectContent>
                      {unitTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.appliesToScope === 'unit' && (
                <div className="space-y-2">
                  <RequiredLabel htmlFor="cf-unit" required>Unité</RequiredLabel>
                  <Select value={form.appliesToUnitId ?? ''} onValueChange={(v) => setForm(f => ({ ...f, appliesToUnitId: v }))}>
                    <SelectTrigger id="cf-unit"><SelectValue placeholder="Choisir une unité…" /></SelectTrigger>
                    <SelectContent>
                      {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Le champ n'apparaît que pour les membres correspondant à ces critères.</p>
            </div>

            {/* ── Visibility: who may see the value ── */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <RequiredLabel htmlFor="cf-visible">Qui peut voir la valeur ?</RequiredLabel>
              </div>
              {/* Named-audience framing: the chefs always see the value; the only real variable is whether the
                  member himself sees it (then narrowing to the CG). Avoids the misleading « Tout le monde ». */}
              <Select value={form.visibleTo} onValueChange={(v) => setForm(f => ({ ...f, visibleTo: v as CustomFieldVisibleTo }))}>
                <SelectTrigger id="cf-visible"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Le membre et ses chefs</SelectItem>
                  <SelectItem value="leaders">Les chefs uniquement (caché au membre)</SelectItem>
                  <SelectItem value="groupLeaders">Le chef de groupe uniquement</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Parmi les personnes ayant déjà accès à la fiche. Le champ n'est jamais public.</p>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                Actif
              </label>
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.showOnCard} onChange={(e) => setForm(f => ({ ...f, showOnCard: e.target.checked }))} />
                  Afficher sur la carte membre
                </label>
                <p className="text-xs text-muted-foreground ml-6">Ce champ apparaitra sur la carte PDF du membre</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Supprimer le champ personnalisé"
        description={(deleting?.valueCount ?? 0) > 0
          ? `« ${deleting?.name} » est renseigné pour ${deleting?.valueCount} membre(s). Vous ne pouvez pas le supprimer — désactivez-le plutôt (décochez « Actif »).`
          : `Êtes-vous sûr de vouloir supprimer « ${deleting?.name} » ? Cette action est irréversible.`}
        confirmLabel={(deleting?.valueCount ?? 0) > 0 ? 'Désactiver…' : 'Supprimer'}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={(deleting?.valueCount ?? 0) > 0 ? () => { const d = deleting; setDeleting(null); if (d) openEdit(d) } : handleDelete}
      />
    </Page>
  )
}

// A single draggable custom-field row (grip handle + name/code/type + targeting/visibility badges + actions).
function SortableFieldRow({ item, canReorder, onEdit, onDelete }: { item: CustomFieldDto; canReorder: boolean; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !canReorder })
  const targeted = item.appliesToRole !== 'all' || item.appliesToScope !== 'all'
  const restricted = item.visibleTo !== 'all'
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-3 rounded-lg border bg-card p-3', isDragging && 'shadow-lg')}>
      {canReorder ? (
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing" aria-label="Déplacer">
          <GripVertical className="h-4 w-4" />
        </button>
      ) : <span className="w-4" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{item.name}</span>
          <span className="text-xs text-muted-foreground">{item.code}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Badge variant="outline">{FIELD_TYPE_LABELS[item.fieldType] ?? item.fieldType}</Badge>
          {item.isActive ? <Badge variant="success">Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}
          <Badge variant="outline" className="gap-1 text-muted-foreground">Rempli : {EDITABLE_BY_LABELS[item.editableBy] ?? item.editableBy}</Badge>
          {item.showOnCard && <Badge variant="info">Carte</Badge>}
          {targeted && (
            <Tip content="Ce champ n'apparaît que pour certains membres (rôle / branche / unité).">
              <span className="inline-flex"><Badge variant="outline" className="gap-1"><Users className="h-3 w-3" />{ROLE_LABELS[item.appliesToRole]}{item.appliesToScope !== 'all' ? ' · ciblé' : ''}</Badge></span>
            </Tip>
          )}
          {restricted && (
            <Tip content="La valeur de ce champ n'est visible que par certains rôles.">
              <span className="inline-flex"><Badge variant="outline" className="gap-1"><Eye className="h-3 w-3" />{VISIBLE_LABELS[item.visibleTo]}</Badge></span>
            </Tip>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        <Tip content="Modifier"><Button variant="ghost" size="icon" onClick={onEdit}><Pencil className="h-4 w-4" /></Button></Tip>
        <Tip content="Supprimer"><Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button></Tip>
      </div>
    </li>
  )
}
