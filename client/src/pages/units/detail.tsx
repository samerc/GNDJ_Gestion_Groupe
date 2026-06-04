import { parseApiError } from '@/lib/error-utils'
import { useState } from 'react'
import { useFormValidation } from '@/hooks/use-form-validation'
import { useParams, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam, type TeamDto, type TeamFormData } from '@/services/team-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { ArrowLeft, Plus, Pencil, Trash2, UsersRound } from 'lucide-react'
import { toast } from 'sonner'

interface UnitDetail {
  id: string; name: string; code: string; description: string | null; isActive: boolean
  associationId: string; associationName: string; unitTypeId: string; unitTypeName: string
  teamCount: number; memberCount: number; createdAt: string; updatedAt: string
}

export default function UnitDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: unit, isLoading } = useQuery({
    queryKey: ['units', id],
    queryFn: () => apiClient.get<UnitDetail>(`/units/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const { data: teams } = useTeams({ unitId: id, pageSize: 100 })
  const createMutation = useCreateTeam()
  const updateMutation = useUpdateTeam()
  const deleteMutation = useDeleteTeam()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TeamDto | null>(null)
  const [deleting, setDeleting] = useState<TeamDto | null>(null)
  const [form, setForm] = useState<TeamFormData>({ name: '', unitId: '', displayOrder: 0 })
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass } = useFormValidation()

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', unitId: id!, description: '', totem: '', adjective: '', color1: '', color2: '', displayOrder: (teams?.items.length ?? 0) + 1, isMaitrise: false })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const openEdit = (item: TeamDto) => {
    setEditing(item)
    setForm({
      name: item.name, unitId: id!, description: item.description ?? '',
      totem: item.totem ?? '', adjective: item.adjective ?? '',
      color1: item.color1 ?? '', color2: item.color2 ?? '',
      displayOrder: item.displayOrder, isMaitrise: item.isMaitrise,
    })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ name: !form.name })) return
    try {
      const payload = {
        ...form, unitId: id!,
        totem: form.totem || null, adjective: form.adjective || null,
        color1: form.color1 || null, color2: form.color2 || null,
        description: form.description || null,
      }
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload })
        toast.success('Équipe modifiée')
      } else {
        await createMutation.mutateAsync(payload)
        toast.success('Équipe créée')
      }
      setFormOpen(false)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { await deleteMutation.mutateAsync(deleting.id); toast.success('Équipe supprimée'); setDeleting(null) } catch (err) { setError(parseApiError(err)); setDeleting(null) }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  if (isLoading) return <LoadingSpinner />
  if (!unit) return <div className="py-12 text-center text-muted-foreground">Unité introuvable.</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/units')}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-bold">{unit.name}</h1>
            <p className="text-sm text-muted-foreground">{unit.associationName} — {unit.unitTypeName} — Code: {unit.code}</p>
          </div>
        </div>
        <Badge variant={unit.isActive ? 'default' : 'secondary'}>
          {unit.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      {unit.description && (
        <p className="text-muted-foreground">{unit.description}</p>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{unit.memberCount}</div>
            <p className="text-sm text-muted-foreground">Membres actifs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{teams?.totalCount ?? 0}</div>
            <p className="text-sm text-muted-foreground">Équipes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{unit.unitTypeName}</div>
            <p className="text-sm text-muted-foreground">Type d'unité</p>
          </CardContent>
        </Card>
      </div>

      {/* Teams */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="h-4 w-4" />
              Équipes
            </CardTitle>
            <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-3 w-3" />Nouvelle équipe</Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          {!teams || teams.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune équipe dans cette unité.</p>
          ) : (
            <div className="space-y-3">
              {teams.items.map(team => (
                <div key={team.id} className="flex items-center gap-3 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    {(team.color1 || team.color2) && (
                      <div className="flex gap-0.5">
                        {team.color1 && <div className="h-4 w-4 rounded-full border" style={{ backgroundColor: team.color1 }} />}
                        {team.color2 && <div className="h-4 w-4 rounded-full border" style={{ backgroundColor: team.color2 }} />}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{team.name}</span>
                      {team.isMaitrise && <Badge variant="secondary" className="text-xs">Maîtrise</Badge>}
                      {team.totem && <span className="text-sm text-muted-foreground">({team.totem}{team.adjective ? ` ${team.adjective}` : ''})</span>}
                    </div>
                    {team.description && <p className="text-sm text-muted-foreground">{team.description}</p>}
                    <span className="text-xs text-muted-foreground">{team.memberCount} membre{team.memberCount > 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(team)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleting(team)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Team Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier l'équipe" : 'Nouvelle équipe'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <RequiredLabel htmlFor="name" required>Nom</RequiredLabel>
              <Input id="name" className={fieldClass('name')} value={form.name} onChange={(e) => { setForm(f => ({ ...f, name: e.target.value })); clearField('name') }} required />
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
                <div className="flex items-center gap-2">
                  <Input id="color1" type="color" value={form.color1 || '#ffffff'} onChange={(e) => setForm(f => ({ ...f, color1: e.target.value }))} className="h-9 w-14 p-1 cursor-pointer" />
                  <Input value={form.color1 || ''} onChange={(e) => setForm(f => ({ ...f, color1: e.target.value }))} placeholder="#000000" className="flex-1" />
                </div>
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="color2">Couleur 2</RequiredLabel>
                <div className="flex items-center gap-2">
                  <Input id="color2" type="color" value={form.color2 || '#ffffff'} onChange={(e) => setForm(f => ({ ...f, color2: e.target.value }))} className="h-9 w-14 p-1 cursor-pointer" />
                  <Input value={form.color2 || ''} onChange={(e) => setForm(f => ({ ...f, color2: e.target.value }))} placeholder="#000000" className="flex-1" />
                </div>
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="displayOrder">Ordre</RequiredLabel>
                <Input id="displayOrder" type="number" min={0} value={form.displayOrder} onChange={(e) => setForm(f => ({ ...f, displayOrder: Number(e.target.value) }))} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isMaitrise || false} onChange={(e) => setForm(f => ({ ...f, isMaitrise: e.target.checked }))} className="h-4 w-4 rounded border-gray-300" />
              Équipe de maîtrise
            </label>
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
        description={`Êtes-vous sûr de vouloir supprimer « ${deleting?.name} » ?`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
