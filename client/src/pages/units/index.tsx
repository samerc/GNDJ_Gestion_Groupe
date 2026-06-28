// Units admin list (super-admin). Searchable, paginated table with association + unit-type filters;
// rows link to the unit detail page. Create/edit dialog covers the core fields plus a "Site public"
// section (publish toggle, slug, founded date — the public description lives on the unit TYPE, shared).
// Delete is hard (ConfirmDialog). Association is optional (e.g. Maîtrise de Groupe → "Inter-associations").
import { parseApiError } from '@/lib/error-utils'
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { useFormValidation } from '@/hooks/use-form-validation'
import { useDebounce } from '@/hooks/use-debounce'
import { useUnits, useCreateUnit, useUpdateUnit, useDeleteUnit, type UnitDto, type UnitFormData } from '@/services/unit-service'
import { useAssociations } from '@/services/association-service'
import { useUnitTypes } from '@/services/unit-type-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Plus, Pencil, Trash2, Search, Building2, Eye, X } from 'lucide-react'
import { toast } from 'sonner'

export default function UnitsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const hasLoadedOnce = useRef(false)
  const [page, setPage] = useState(1)
  const [assocFilter, setAssocFilter] = useState('')
  const [utFilter, setUtFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<UnitDto | null>(null)
  const [deleting, setDeleting] = useState<UnitDto | null>(null)
  const [form, setForm] = useState<UnitFormData>({ name: '', code: '', associationId: '', unitTypeId: '' })
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()

  const { data, isLoading } = useUnits({ search: debouncedSearch || undefined, associationId: assocFilter || undefined, unitTypeId: utFilter || undefined, page, pageSize: 50 })
  const { data: associations } = useAssociations({ pageSize: 100 })
  const { data: unitTypes } = useUnitTypes({ pageSize: 100 })
  const createMutation = useCreateUnit()
  const updateMutation = useUpdateUnit()
  const deleteMutation = useDeleteUnit()

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', code: '', description: '', associationId: '', unitTypeId: '', slug: '', isPublished: false, foundedDate: null })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const openEdit = (item: UnitDto) => {
    setEditing(item)
    setForm({
      name: item.name, code: item.code, description: item.description ?? '',
      associationId: item.associationId ?? '', unitTypeId: item.unitTypeId, isActive: item.isActive,
      slug: item.slug ?? '', isPublished: item.isPublished, foundedDate: item.foundedDate ?? null,
    })
    setError(''); clearAll()
    setFormOpen(true)
  }

  // Public-URL slug from the name: lowercase, strip accents, non-alphanumerics → single dashes, trim.
  const slugify = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ name: !form.name, code: !form.code, unitTypeId: !form.unitTypeId })) return
    // Association is optional (units like Maîtrise de Groupe have none): send null, not ''.
    const payload = { ...form, associationId: form.associationId || null }
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload })
        toast.success('Unité modifiée')
      } else {
        await createMutation.mutateAsync(payload)
        toast.success('Unité créée')
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
      toast.success('Unité supprimée')
      setDeleting(null)
    } catch (err) {
      setError(parseApiError(err))
      setDeleting(null)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending
  // Remember that the list was non-empty at least once (distinguishes "no data yet" from "truly empty").
  if (data && data.totalCount > 0) hasLoadedOnce.current = true

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Unités</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle unité
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="pl-9 pr-8" />
          {search && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setSearch(''); setPage(1) }}><X className="h-3.5 w-3.5" /></button>}
        </div>
        <Select value={assocFilter || '_all'} onValueChange={(v) => { setAssocFilter(v === '_all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Association" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Toutes les assoc.</SelectItem>
            {associations?.items.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={utFilter || '_all'} onValueChange={(v) => { setUtFilter(v === '_all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Type d'unité" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Tous les types</SelectItem>
            {unitTypes?.items.map(ut => <SelectItem key={ut.id} value={ut.id}>{ut.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aucune unité"
          description={search ? 'Aucun résultat pour cette recherche.' : 'Créez votre première unité.'}
          action={!search && <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Créer</Button>}
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Association</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Équipes</TableHead>
                  <TableHead className="text-center">Membres</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => navigate(`/units/${item.id}`)}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground">{item.code}</TableCell>
                    <TableCell className="text-muted-foreground">{item.associationName ?? 'Inter-associations'}</TableCell>
                    <TableCell className="text-muted-foreground">{item.unitTypeName}</TableCell>
                    <TableCell className="text-center">{item.teamCount}</TableCell>
                    <TableCell className="text-center">{item.memberCount}</TableCell>
                    <TableCell>
                      <Badge variant={item.isActive ? 'default' : 'secondary'}>
                        {item.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/units/${item.id}`)} title="Détails">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(item)} title="Modifier">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleting(item)} title="Supprimer">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{data.totalCount} résultat{data.totalCount > 1 ? 's' : ''}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={!data.hasPreviousPage} onClick={() => setPage(p => p - 1)}>Précédent</Button>
                <span className="flex items-center text-sm text-muted-foreground">Page {data.page} / {data.totalPages}</span>
                <Button variant="outline" size="sm" disabled={!data.hasNextPage} onClick={() => setPage(p => p + 1)}>Suivant</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier l'unité" : 'Nouvelle unité'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <FormFieldErrors show={hasErrors} />
            <div className="space-y-2">
              <RequiredLabel htmlFor="name" required>Nom</RequiredLabel>
              <Input id="name" className={fieldClass('name')} value={form.name} onChange={(e) => { setForm(f => ({ ...f, name: e.target.value })); clearField('name') }} required />
            </div>
            <div className="space-y-2">
              <RequiredLabel htmlFor="code" required>Code</RequiredLabel>
              <Input id="code" className={fieldClass('code')} value={form.code} onChange={(e) => { setForm(f => ({ ...f, code: e.target.value })); clearField('code') }} required />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Association</RequiredLabel>
              <Select value={form.associationId || '__none__'} onValueChange={(v) => { setForm(f => ({ ...f, associationId: v === '__none__' ? '' : v })); clearField('associationId') }}>
                <SelectTrigger className={fieldClass('associationId')}><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucune (inter-associations)</SelectItem>
                  {associations?.items.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <RequiredLabel required>Type d'unité</RequiredLabel>
              <Select value={form.unitTypeId} onValueChange={(v) => { setForm(f => ({ ...f, unitTypeId: v })); clearField('unitTypeId') }}>
                <SelectTrigger className={fieldClass('unitTypeId')}><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent>
                  {unitTypes?.items.map(ut => (
                    <SelectItem key={ut.id} value={ut.id}>{ut.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <RequiredLabel htmlFor="description">Description</RequiredLabel>
              <Input id="description" value={form.description ?? ''} onChange={(e) => setForm(f => ({ ...f, description: e.target.value || null }))} />
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isActive" checked={form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4 rounded border-gray-300" />
                <label htmlFor="isActive" className="text-sm font-medium">Unité active</label>
              </div>
            )}

            {/* Site public */}
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Site public</p>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isPublished" checked={!!form.isPublished} onChange={(e) => setForm(f => ({ ...f, isPublished: e.target.checked }))} className="h-4 w-4 rounded border-gray-300" />
                <label htmlFor="isPublished" className="text-sm font-medium">Afficher cette unité sur le site public</label>
              </div>
              <div className="space-y-2">
                <label htmlFor="slug" className="text-sm font-medium">Lien (slug)</label>
                <div className="flex gap-2">
                  <Input id="slug" placeholder="ex. troupe-2eme-beyrouth" value={form.slug ?? ''} onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))} />
                  <Button type="button" variant="outline" onClick={() => setForm(f => ({ ...f, slug: slugify(f.name) }))}>Générer</Button>
                </div>
                <p className="text-xs text-muted-foreground">Adresse : /unites/{form.slug || '…'}</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="foundedDate" className="text-sm font-medium">Date de fondation</label>
                <Input id="foundedDate" type="date" value={form.foundedDate ?? ''} onChange={(e) => setForm(f => ({ ...f, foundedDate: e.target.value || null }))} className="w-48" />
                <p className="text-xs text-muted-foreground">Date réelle de création de l'unité (affichée sur le site public).</p>
              </div>
              <p className="text-xs text-muted-foreground">La description publique se définit sur le <strong>type d'unité</strong> (partagée par toutes les unités de la même branche).</p>
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
        title="Supprimer l'unité"
        description={`Êtes-vous sûr de vouloir supprimer « ${deleting?.name} » ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
