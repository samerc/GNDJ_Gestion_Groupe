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
import { useMembers } from '@/services/member-service'
import { ArrowLeft, Plus, Pencil, Trash2, UsersRound, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'

interface UnitDetail {
  id: string; name: string; code: string; description: string | null; isActive: boolean
  associationId: string | null; associationName: string | null; unitTypeId: string; unitTypeName: string
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

  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
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

  const handleMoveTeam = async (teamId: string, direction: number) => {
    if (!teams) return
    const sorted = [...teams.items].filter(t => !t.isMaitrise).sort((a, b) => a.displayOrder - b.displayOrder)
    const idx = sorted.findIndex(t => t.id === teamId)
    if (idx < 0) return
    const swapIdx = idx + direction
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    try {
      await updateMutation.mutateAsync({ id: sorted[idx].id, name: sorted[idx].name, unitId: id!, displayOrder: sorted[swapIdx].displayOrder })
      await updateMutation.mutateAsync({ id: sorted[swapIdx].id, name: sorted[swapIdx].name, unitId: id!, displayOrder: sorted[idx].displayOrder })
    } catch { /* refresh will show correct order */ }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  if (isLoading) return <LoadingSpinner variant="detail" />
  if (!unit) return <div className="py-12 text-center text-muted-foreground">Unité introuvable.</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/units')}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-bold">{unit.name}</h1>
            <p className="text-sm text-muted-foreground">{unit.associationName ?? 'Inter-associations'} — {unit.unitTypeName} — Code: {unit.code}</p>
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
              {[...teams.items].sort((a, b) => {
                // Maîtrise always first
                if (a.isMaitrise && !b.isMaitrise) return -1
                if (!a.isMaitrise && b.isMaitrise) return 1
                return a.displayOrder - b.displayOrder
              }).map(team => (
                <div key={team.id} className={`rounded-lg border ${team.isMaitrise ? 'border-amber-300 bg-amber-50/30' : ''}`}>
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}
                  >
                    {!team.isMaitrise && (
                      <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
                        <button className="text-muted-foreground hover:text-foreground p-0.5" onClick={() => handleMoveTeam(team.id, -1)} title="Monter"><ChevronUp className="h-3.5 w-3.5" /></button>
                        <button className="text-muted-foreground hover:text-foreground p-0.5" onClick={() => handleMoveTeam(team.id, 1)} title="Descendre"><ChevronDown className="h-3.5 w-3.5" /></button>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {(team.color1 || team.color2) ? (
                        <div className="flex gap-0.5">
                          {team.color1 && <div className="h-5 w-5 rounded-full border" style={{ backgroundColor: team.color1 }} />}
                          {team.color2 && <div className="h-5 w-5 rounded-full border" style={{ backgroundColor: team.color2 }} />}
                        </div>
                      ) : (
                        <UsersRound className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{team.name}</span>
                        {team.isMaitrise && <Badge className="bg-amber-600 text-xs">Maîtrise</Badge>}
                        {team.totem && team.totem !== team.name && <span className="text-sm text-muted-foreground">({team.totem}{team.adjective ? ` ${team.adjective}` : ''})</span>}
                      </div>
                      <span className="text-xs text-muted-foreground">{team.memberCount} membre{team.memberCount > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex gap-1 items-center">
                      {expandedTeam === team.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(team) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setDeleting(team) }}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  {expandedTeam === team.id && (
                    <TeamMembers unitId={id!} teamId={team.id} />
                  )}
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
            <div className="grid grid-cols-2 gap-4">
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

function TeamMembers({ unitId, teamId }: { unitId: string; teamId: string }) {
  const { data, isLoading } = useMembers({ unitId, teamId, pageSize: 100 })

  if (isLoading) return <div className="px-4 pb-3 text-sm text-muted-foreground">Chargement...</div>

  // Sort by role rank (most senior first), then alphabetically.
  const members = [...(data?.items ?? [])].sort((a, b) => {
    const ra = a.roleRank ?? -1, rb = b.roleRank ?? -1
    if (ra !== rb) return rb - ra
    return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
  })
  if (members.length === 0) return <div className="px-4 pb-3 text-sm text-muted-foreground">Aucun membre dans cette équipe.</div>

  return (
    <div className="border-t px-4 pb-3 pt-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th className="text-left py-1 font-medium">Nom</th>
            <th className="text-left py-1 font-medium">Fonction</th>
            <th className="text-left py-1 font-medium">Père</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m, idx) => (
            <tr key={m.id} className={idx % 2 === 1 ? 'bg-muted/10' : ''}>
              <td className="py-1.5 font-medium">{m.firstName} {m.lastName}</td>
              <td className="py-1.5 text-muted-foreground">{m.roleName ?? '—'}</td>
              <td className="py-1.5 text-muted-foreground">{m.fatherName ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
