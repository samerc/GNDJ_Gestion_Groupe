import { parseApiError } from '@/lib/error-utils'
import { useState, useRef } from 'react'
import { useDebounce } from '@/hooks/use-debounce'
import { useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam, type TeamDto, type TeamFormData } from '@/services/team-service'
import { useUnits } from '@/services/unit-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Plus, Pencil, Trash2, Search, Users } from 'lucide-react'

const emptyForm: TeamFormData = { name: '', unitId: '', description: '', totem: '', adjective: '', color1: '', color2: '', displayOrder: 0 }

export default function TeamsPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const hasLoadedOnce = useRef(false)
  const [unitFilter, setUnitFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TeamDto | null>(null)
  const [deleting, setDeleting] = useState<TeamDto | null>(null)
  const [form, setForm] = useState<TeamFormData>(emptyForm)
  const [error, setError] = useState('')

  const { data, isLoading } = useTeams({ unitId: unitFilter || undefined, search: debouncedSearch || undefined, page })
  const { data: units } = useUnits({ pageSize: 100 })
  const createMutation = useCreateTeam()
  const updateMutation = useUpdateTeam()
  const deleteMutation = useDeleteTeam()

  if (data && data.totalCount > 0) hasLoadedOnce.current = true
  const showSearch = hasLoadedOnce.current || (data && data.totalCount > 0)

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, unitId: unitFilter || '' })
    setError('')
    setFormOpen(true)
  }

  const openEdit = (item: TeamDto) => {
    setEditing(item)
    setForm({
      name: item.name, unitId: item.unitId, description: item.description ?? '',
      totem: item.totem ?? '', adjective: item.adjective ?? '',
      color1: item.color1 ?? '', color2: item.color2 ?? '',
      displayOrder: item.displayOrder,
    })
    setError('')
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.unitId) { setError("Veuillez sélectionner une unité."); return }
    try {
      const payload = {
        ...form,
        totem: form.totem || null,
        adjective: form.adjective || null,
        color1: form.color1 || null,
        color2: form.color2 || null,
        description: form.description || null,
      }
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload })
      } else {
        await createMutation.mutateAsync(payload)
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
        <h1 className="text-2xl font-bold">Équipes</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle équipe
        </Button>
      </div>

      {showSearch && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-9"
            />
          </div>
          <Select value={unitFilter} onValueChange={(v) => { setUnitFilter(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Toutes les unités" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les unités</SelectItem>
              {units?.items.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucune équipe"
          description={search || unitFilter ? 'Aucun résultat pour ces critères.' : 'Créez votre première équipe.'}
          action={!search && !unitFilter && <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Créer</Button>}
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Unité</TableHead>
                  <TableHead>Totem</TableHead>
                  <TableHead>Adjectif</TableHead>
                  <TableHead className="text-center">Membres</TableHead>
                  <TableHead className="text-center">Ordre</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {(item.color1 || item.color2) && (
                          <div className="flex gap-0.5">
                            {item.color1 && <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color1 }} />}
                            {item.color2 && <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color2 }} />}
                          </div>
                        )}
                        {item.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.unitName}</TableCell>
                    <TableCell className="text-muted-foreground">{item.totem ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{item.adjective ?? '—'}</TableCell>
                    <TableCell className="text-center">{item.memberCount}</TableCell>
                    <TableCell className="text-center">{item.displayOrder}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleting(item)}>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier l'équipe" : 'Nouvelle équipe'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <RequiredLabel htmlFor="name" required>Nom</RequiredLabel>
              <Input id="name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <RequiredLabel required>Unité</RequiredLabel>
              <Select value={form.unitId} onValueChange={(v) => setForm(f => ({ ...f, unitId: v }))}>
                <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent>
                  {units?.items.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <RequiredLabel htmlFor="description">Description</RequiredLabel>
              <Input id="description" value={form.description ?? ''} onChange={(e) => setForm(f => ({ ...f, description: e.target.value || null }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel htmlFor="totem">Totem</RequiredLabel>
                <Input id="totem" value={form.totem ?? ''} onChange={(e) => setForm(f => ({ ...f, totem: e.target.value || null }))} />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="adjective">Adjectif</RequiredLabel>
                <Input id="adjective" value={form.adjective ?? ''} onChange={(e) => setForm(f => ({ ...f, adjective: e.target.value || null }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <RequiredLabel htmlFor="color1">Couleur 1</RequiredLabel>
                <Input id="color1" type="color" value={form.color1 || '#ffffff'} onChange={(e) => setForm(f => ({ ...f, color1: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="color2">Couleur 2</RequiredLabel>
                <Input id="color2" type="color" value={form.color2 || '#ffffff'} onChange={(e) => setForm(f => ({ ...f, color2: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="displayOrder">Ordre</RequiredLabel>
                <Input id="displayOrder" type="number" min={0} value={form.displayOrder} onChange={(e) => setForm(f => ({ ...f, displayOrder: Number(e.target.value) }))} />
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
        title="Supprimer l'équipe"
        description={`Êtes-vous sûr de vouloir supprimer « ${deleting?.name} » ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
