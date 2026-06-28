// Admin CRUD screen for Custom Fields (super-admin) — admin-defined extra member attributes
// (text/number/select/boolean) surfaced on the member "Infos complémentaires" tab and optionally on
// the member card PDF (showOnCard). Not paginated (small set). For type=select, the comma-separated
// options string is serialized to/from a JSON string array at the API boundary (see handleSubmit/openEdit).
import { parseApiError } from '@/lib/error-utils'
import { useState } from 'react'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { useFormValidation } from '@/hooks/use-form-validation'
import { useCustomFields, useCreateCustomField, useUpdateCustomField, useDeleteCustomField, type CustomFieldDto } from '@/services/custom-field-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, ListPlus } from 'lucide-react'
import { toast } from 'sonner'

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Texte',
  number: 'Nombre',
  select: 'Liste',
  boolean: 'Oui/Non',
}

interface FormData {
  name: string
  code: string
  fieldType: string
  options: string
  displayOrder: number
  isActive: boolean
  showOnCard: boolean
}

const defaultForm: FormData = { name: '', code: '', fieldType: 'text', options: '', displayOrder: 0, isActive: true, showOnCard: false }

// Slugify the display name into a stable storage code (lowercase, accents stripped, non-alnum → "_").
// Auto-applied while typing the name unless the user has manually edited the code field (codeManual).
function nameToCode(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export default function CustomFieldsPage() {
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

  const openCreate = () => {
    setEditing(null)
    setForm(defaultForm)
    setCodeManual(false)
    setError(''); clearAll()
    setFormOpen(true)
  }

  const openEdit = (item: CustomFieldDto) => {
    setEditing(item)
    // Stored options are a JSON string array; show them back as the comma-separated text the user typed.
    const opts = item.options ? (() => { try { return (JSON.parse(item.options) as string[]).join(', ') } catch { return '' } })() : ''
    setForm({ name: item.name, code: item.code, fieldType: item.fieldType, options: opts, displayOrder: item.displayOrder, isActive: item.isActive, showOnCard: item.showOnCard })
    setCodeManual(true) // never auto-rewrite an existing field's code from its name
    setError(''); clearAll()
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ name: !form.name, code: !form.code })) return

    // Only "select" fields carry options; persist them as a JSON string array (null for other types).
    const optionsJson = form.fieldType === 'select' && form.options.trim()
      ? JSON.stringify(form.options.split(',').map(o => o.trim()).filter(Boolean))
      : null

    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, name: form.name, code: form.code, fieldType: form.fieldType, options: optionsJson, displayOrder: form.displayOrder, isActive: form.isActive, showOnCard: form.showOnCard })
        toast.success('Champ personnalisé modifié')
      } else {
        await createMutation.mutateAsync({ name: form.name, code: form.code, fieldType: form.fieldType, options: optionsJson, displayOrder: form.displayOrder, isActive: form.isActive, showOnCard: form.showOnCard })
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
      setError(parseApiError(err))
      setDeleting(null)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Champs personnalisés</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau champ
        </Button>
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !fields || fields.length === 0 ? (
        <EmptyState
          icon={ListPlus}
          title="Aucun champ personnalisé"
          description="Créez votre premier champ personnalisé."
          action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Créer</Button>}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">Carte</TableHead>
                <TableHead className="text-center">Ordre</TableHead>
                <TableHead className="text-center">Actif</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((item) => (
                <TableRow key={item.id} className="even:bg-muted/30">
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.code}</TableCell>
                  <TableCell>{FIELD_TYPE_LABELS[item.fieldType] ?? item.fieldType}</TableCell>
                  <TableCell className="text-center">
                    {item.showOnCard ? <Badge className="bg-blue-600">Carte</Badge> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">{item.displayOrder}</TableCell>
                  <TableCell className="text-center">
                    {item.isActive ? <Badge className="bg-green-600">Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}
                  </TableCell>
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
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
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
                setCodeManual(true) // user took over the code → stop auto-deriving it from the name
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
              <RequiredLabel htmlFor="cf-order">Ordre d'affichage</RequiredLabel>
              <Input id="cf-order" type="number" value={form.displayOrder} onChange={(e) => setForm(f => ({ ...f, displayOrder: parseInt(e.target.value) || 0 }))} />
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
        description={`Êtes-vous sûr de vouloir supprimer « ${deleting?.name} » ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
