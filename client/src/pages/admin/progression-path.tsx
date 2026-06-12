import { useState, useMemo } from 'react'
import { useUnitTypeProgressions, useCreateUnitTypeProgression, useUpdateUnitTypeProgression, useDeleteUnitTypeProgression, type UnitTypeProgressionDto } from '@/services/unit-type-progression-service'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { PaginatedResult } from '@/types/api'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Plus, Trash2, Pencil, ArrowRight, Users, Shield } from 'lucide-react'
import { toast } from 'sonner'

interface AssociationDto { id: string; name: string }
interface UnitTypeDto { id: string; name: string; code: string; ageMin: number | null; ageMax: number | null }

const GENDER_OPTIONS = [
  { value: '_all', label: 'Tous' },
  { value: 'Masculin', label: 'Garçons' },
  { value: 'Féminin', label: 'Filles' },
]

const PATH_TYPE_OPTIONS = [
  { value: 'member', label: 'Membre' },
  { value: 'leader', label: 'Chef / CU' },
]

function ageLabel(min: number | null, max: number | null) {
  if (min != null && max != null) return `${min}-${max} ans`
  if (min != null) return `${min}+ ans`
  if (max != null) return `≤${max} ans`
  return ''
}

// Build a linear chain from edges for a given path
function buildChain(edges: UnitTypeProgressionDto[], unitTypes: UnitTypeDto[]): { id: string; name: string; ageMin: number | null; ageMax: number | null }[] {
  if (edges.length === 0) return []

  // Find start nodes (fromUnitTypeId not in any toUnitTypeId)
  const toIds = new Set(edges.map(e => e.toUnitTypeId))
  const fromIds = new Set(edges.map(e => e.fromUnitTypeId))
  const starts = [...fromIds].filter(id => !toIds.has(id))
  const startId = starts[0] ?? edges[0].fromUnitTypeId

  // Walk the chain
  const chain: string[] = [startId]
  const edgeMap = new Map(edges.map(e => [e.fromUnitTypeId, e.toUnitTypeId]))
  let current = startId
  const visited = new Set<string>()
  while (edgeMap.has(current) && !visited.has(current)) {
    visited.add(current)
    current = edgeMap.get(current)!
    chain.push(current)
  }

  return chain.map(id => {
    const ut = unitTypes.find(u => u.id === id)
    return { id, name: ut?.name ?? '?', ageMin: ut?.ageMin ?? null, ageMax: ut?.ageMax ?? null }
  })
}

interface PathRow {
  label: string
  color: string
  bgColor: string
  borderColor: string
  icon: 'member' | 'leader'
  chain: { id: string; name: string; ageMin: number | null; ageMax: number | null }[]
}

export default function ProgressionPathPage() {
  const { data: associations } = useQuery({
    queryKey: ['associations', 'list'],
    queryFn: () => apiClient.get<PaginatedResult<AssociationDto>>('/associations', { params: { pageSize: 100 } }).then(r => r.data.items),
  })
  const { data: unitTypes } = useQuery({
    queryKey: ['unit-types', 'list'],
    queryFn: () => apiClient.get<PaginatedResult<UnitTypeDto>>('/unit-types', { params: { pageSize: 100 } }).then(r => r.data.items),
  })

  // Load progressions for the first association (most common case — single association)
  const firstAssocId = associations?.[0]?.id ?? ''
  const { data: progressions, isLoading } = useUnitTypeProgressions(firstAssocId)

  // For create, we need to know which association
  const [formAssocId, setFormAssocId] = useState('')

  const createMutation = useCreateUnitTypeProgression()
  const updateMutation = useUpdateUnitTypeProgression()
  const deleteMutation = useDeleteUnitTypeProgression()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<UnitTypeProgressionDto | null>(null)
  const [deleting, setDeleting] = useState<UnitTypeProgressionDto | null>(null)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    fromUnitTypeId: '', toUnitTypeId: '', gender: '_all', pathType: 'member', displayOrder: 0, notes: '',
  })

  // Build diagram rows: one per gender+pathType combination
  const pathRows: PathRow[] = useMemo(() => {
    if (!progressions || !unitTypes) return []

    const rows: PathRow[] = []

    // Group edges by (gender, pathType)
    const groups = new Map<string, UnitTypeProgressionDto[]>()
    for (const p of progressions) {
      const key = `${p.pathType}|${p.gender ?? 'all'}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    }

    // Sort: member paths first, then leader; within each, all > boys > girls
    const sortOrder = ['member|all', 'member|Masculin', 'member|Féminin', 'leader|all', 'leader|Masculin', 'leader|Féminin']
    const sortedKeys = [...groups.keys()].sort((a, b) => {
      const ai = sortOrder.indexOf(a)
      const bi = sortOrder.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })

    for (const key of sortedKeys) {
      const edges = groups.get(key)!
      const [pathType, gender] = key.split('|')
      const chain = buildChain(edges, unitTypes)
      if (chain.length === 0) continue

      const isLeader = pathType === 'leader'
      const genderLabel = gender === 'Masculin' ? 'Garçons' : gender === 'Féminin' ? 'Filles' : 'Tous'
      const label = isLeader
        ? `Parcours chefs — ${genderLabel}`
        : `Parcours membres — ${genderLabel}`

      const color = gender === 'Masculin' ? 'text-blue-700' : gender === 'Féminin' ? 'text-pink-700' : 'text-gray-700'
      const bgColor = gender === 'Masculin' ? 'bg-blue-50' : gender === 'Féminin' ? 'bg-pink-50' : 'bg-gray-50'
      const borderColor = gender === 'Masculin' ? 'border-blue-300' : gender === 'Féminin' ? 'border-pink-300' : 'border-gray-300'

      rows.push({ label, color, bgColor, borderColor, icon: isLeader ? 'leader' : 'member', chain })
    }

    return rows
  }, [progressions, unitTypes])

  const openCreate = () => {
    setEditing(null)
    setFormAssocId(firstAssocId)
    setForm({ fromUnitTypeId: '', toUnitTypeId: '', gender: '_all', pathType: 'member', displayOrder: (progressions?.length ?? 0) + 1, notes: '' })
    setError('')
    setFormOpen(true)
  }

  const openEdit = (p: UnitTypeProgressionDto) => {
    setEditing(p)
    setForm({
      fromUnitTypeId: p.fromUnitTypeId, toUnitTypeId: p.toUnitTypeId,
      gender: p.gender ?? '_all', pathType: p.pathType,
      displayOrder: p.displayOrder, notes: p.notes ?? '',
    })
    setError('')
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const payload = {
      fromUnitTypeId: form.fromUnitTypeId, toUnitTypeId: form.toUnitTypeId,
      gender: form.gender === '_all' ? null : form.gender,
      pathType: form.pathType, displayOrder: form.displayOrder,
      notes: form.notes || null,
    }
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload })
        toast.success('Parcours modifié')
      } else {
        await createMutation.mutateAsync({ associationId: formAssocId, ...payload })
        toast.success('Parcours créé')
      }
      setFormOpen(false)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { await deleteMutation.mutateAsync(deleting.id); toast.success('Parcours supprimé'); setDeleting(null) }
    catch (err) { setError(parseApiError(err)); setDeleting(null) }
  }

  if (!associations || !unitTypes) return <LoadingSpinner variant="page" />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Parcours de progression</h1>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Ajouter un lien</Button>
      </div>

      {/* Visual diagram */}
      {isLoading ? <LoadingSpinner variant="page" /> : (
        <>
          {pathRows.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <p className="text-lg font-medium mb-2">Aucun parcours défini</p>
                <p className="text-sm">Ajoutez des liens entre les types d'unité pour créer le diagramme de progression.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Diagramme</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {pathRows.map((row, ri) => (
                  <div key={ri} className={`rounded-lg border ${row.borderColor} ${row.bgColor} p-4`}>
                    <div className="flex items-center gap-2 mb-3">
                      {row.icon === 'leader' ? <Shield className={`h-4 w-4 ${row.color}`} /> : <Users className={`h-4 w-4 ${row.color}`} />}
                      <span className={`text-sm font-semibold ${row.color}`}>{row.label}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {row.chain.map((node, ni) => (
                        <div key={node.id} className="flex items-center gap-2">
                          <div className={`rounded-lg border-2 ${row.borderColor} bg-white px-4 py-2.5 text-center min-w-[110px]`}>
                            <p className="font-semibold text-sm">{node.name}</p>
                            {ageLabel(node.ageMin, node.ageMax) && (
                              <p className="text-xs text-muted-foreground mt-0.5">{ageLabel(node.ageMin, node.ageMax)}</p>
                            )}
                          </div>
                          {ni < row.chain.length - 1 && (
                            <ArrowRight className={`h-5 w-5 ${row.color} shrink-0`} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Legend */}
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground border-t pt-3">
                  <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Parcours membres</span>
                  <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Parcours chefs</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Garçons</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-pink-500" /> Filles</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gray-400" /> Tous</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detailed list of all links */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Liens de progression</CardTitle>
            </CardHeader>
            <CardContent>
              {!progressions || progressions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun lien défini.</p>
              ) : (
                <div className="space-y-2">
                  {progressions.map(p => {
                    const genderColor = p.gender === 'Masculin' ? 'bg-blue-100 text-blue-700' : p.gender === 'Féminin' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-700'
                    return (
                      <div key={p.id} className="flex items-center gap-3 rounded-lg border p-3">
                        <div className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${p.pathType === 'leader' ? 'bg-amber-100 text-amber-800' : 'bg-primary/10 text-primary'}`}>
                          {p.pathType === 'leader' ? 'Chef' : 'Membre'}
                        </div>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="font-medium text-sm">{p.fromUnitTypeName}</span>
                          {ageLabel(p.fromAgeMin, p.fromAgeMax) && (
                            <span className="text-xs text-muted-foreground">({ageLabel(p.fromAgeMin, p.fromAgeMax)})</span>
                          )}
                          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm">{p.toUnitTypeName}</span>
                          {ageLabel(p.toAgeMin, p.toAgeMax) && (
                            <span className="text-xs text-muted-foreground">({ageLabel(p.toAgeMin, p.toAgeMax)})</span>
                          )}
                        </div>
                        <Badge className={genderColor}>
                          {p.gender === 'Masculin' ? 'Garçons' : p.gender === 'Féminin' ? 'Filles' : 'Tous'}
                        </Badge>
                        {p.notes && <span className="text-xs text-muted-foreground max-w-[150px] truncate">{p.notes}</span>}
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(p)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le lien' : 'Nouveau lien de progression'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

            {!editing && associations && associations.length > 1 && (
              <div className="space-y-2">
                <RequiredLabel required>Association</RequiredLabel>
                <Select value={formAssocId} onValueChange={setFormAssocId}>
                  <SelectTrigger><SelectValue placeholder="Association..." /></SelectTrigger>
                  <SelectContent>
                    {associations.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel required>De (type d'unité)</RequiredLabel>
                <Select value={form.fromUnitTypeId} onValueChange={v => setForm(f => ({ ...f, fromUnitTypeId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Source..." /></SelectTrigger>
                  <SelectContent>
                    {unitTypes?.map(ut => (
                      <SelectItem key={ut.id} value={ut.id}>{ut.name} {ageLabel(ut.ageMin, ut.ageMax) ? `(${ageLabel(ut.ageMin, ut.ageMax)})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <RequiredLabel required>Vers (type d'unité)</RequiredLabel>
                <Select value={form.toUnitTypeId} onValueChange={v => setForm(f => ({ ...f, toUnitTypeId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Destination..." /></SelectTrigger>
                  <SelectContent>
                    {unitTypes?.map(ut => (
                      <SelectItem key={ut.id} value={ut.id}>{ut.name} {ageLabel(ut.ageMin, ut.ageMax) ? `(${ageLabel(ut.ageMin, ut.ageMax)})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel required>Genre</RequiredLabel>
                <Select value={form.gender} onValueChange={v => setForm(f => ({ ...f, gender: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <RequiredLabel required>Type de parcours</RequiredLabel>
                <Select value={form.pathType} onValueChange={v => setForm(f => ({ ...f, pathType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PATH_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <RequiredLabel>Notes</RequiredLabel>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Ex: ACU puis CU..." />
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Supprimer le lien"
        description={`Supprimer le lien ${deleting?.fromUnitTypeName} → ${deleting?.toUnitTypeName} ?`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
