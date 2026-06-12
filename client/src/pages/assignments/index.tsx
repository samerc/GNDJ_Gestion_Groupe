import { parseApiError } from '@/lib/error-utils'
import { useState, useRef } from 'react'
import { useAssignments, useCreateAssignment, useEndAssignment, useDeleteAssignment, useFunctionalRoles, type AssignmentDto, type AssignmentFormData } from '@/services/assignment-service'
import { useUnits } from '@/services/unit-service'
import { useTeams } from '@/services/team-service'
import { useMembers } from '@/services/member-service'
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
import { Plus, Trash2, ClipboardList, StopCircle } from 'lucide-react'

export default function AssignmentsPage() {
  const [unitFilter, setUnitFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState<string>('true')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [endingAssignment, setEndingAssignment] = useState<AssignmentDto | null>(null)
  const [endDate, setEndDate] = useState('')
  const [deleting, setDeleting] = useState<AssignmentDto | null>(null)
  const [form, setForm] = useState<AssignmentFormData>({ memberId: '', unitId: '', functionalRoleId: '', startDate: '' })
  const [error, setError] = useState('')
  const hasLoadedOnce = useRef(false)

  const isActive = activeFilter === 'true' ? true : activeFilter === 'false' ? false : undefined
  const { data, isLoading } = useAssignments({ unitId: unitFilter || undefined, isActive, page })
  const { data: units } = useUnits({ pageSize: 100 })
  const { data: teams } = useTeams({ unitId: form.unitId || undefined, pageSize: 100 })
  const { data: members } = useMembers({ pageSize: 200 })
  const { data: roles } = useFunctionalRoles()
  const createMutation = useCreateAssignment()
  const endMutation = useEndAssignment()
  const deleteMutation = useDeleteAssignment()

  if (data && data.totalCount > 0) hasLoadedOnce.current = true
  const showFilters = hasLoadedOnce.current || (data && data.totalCount > 0)

  const openCreate = () => {
    setForm({ memberId: '', unitId: unitFilter || '', teamId: '', functionalRoleId: '', startDate: new Date().toISOString().split('T')[0], notes: '' })
    setError('')
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await createMutation.mutateAsync({
        ...form,
        teamId: form.teamId || null,
        endDate: form.endDate || null,
        notes: form.notes || null,
      })
      setFormOpen(false)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleEnd = async () => {
    if (!endingAssignment || !endDate) return
    try {
      await endMutation.mutateAsync({ id: endingAssignment.id, endDate })
      setEndingAssignment(null)
      setEndDate('')
    } catch (err) {
      setError(parseApiError(err))
      setEndingAssignment(null)
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Affectations</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle affectation
        </Button>
      </div>

      {showFilters && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={unitFilter} onValueChange={(v) => { setUnitFilter(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Toutes les unités" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les unités</SelectItem>
              {units?.items.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v); setPage(1) }}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              <SelectItem value="true">Actives</SelectItem>
              <SelectItem value="false">Terminées</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Aucune affectation"
          description="Créez une affectation pour lier un membre à une unité."
          action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Créer</Button>}
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Membre</TableHead>
                  <TableHead>Unité</TableHead>
                  <TableHead>Équipe</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Début</TableHead>
                  <TableHead>Fin</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.memberLastName} {item.memberFirstName}</TableCell>
                    <TableCell>{item.unitName}</TableCell>
                    <TableCell className="text-muted-foreground">{item.teamName ?? '—'}</TableCell>
                    <TableCell>{item.functionalRoleName}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(item.startDate).toLocaleDateString('fr-FR')}</TableCell>
                    <TableCell className="text-muted-foreground">{item.endDate ? new Date(item.endDate).toLocaleDateString('fr-FR') : '—'}</TableCell>
                    <TableCell>
                      <Badge variant={item.isActive ? 'default' : 'secondary'}>
                        {item.isActive ? 'Active' : 'Terminée'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {item.isActive && (
                          <Button variant="ghost" size="icon" title="Terminer" onClick={() => { setEndingAssignment(item); setEndDate(new Date().toISOString().split('T')[0]) }}>
                            <StopCircle className="h-4 w-4 text-orange-500" />
                          </Button>
                        )}
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

      {/* Create Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouvelle affectation</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <RequiredLabel required>Membre</RequiredLabel>
              <Select value={form.memberId} onValueChange={(v) => setForm(f => ({ ...f, memberId: v }))}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un membre..." /></SelectTrigger>
                <SelectContent>
                  {members?.items.map(m => <SelectItem key={m.id} value={m.id}>{m.lastName} {m.firstName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <RequiredLabel required>Unité</RequiredLabel>
              <Select value={form.unitId} onValueChange={(v) => setForm(f => ({ ...f, unitId: v, teamId: '' }))}>
                <SelectTrigger><SelectValue placeholder="Sélectionner une unité..." /></SelectTrigger>
                <SelectContent>
                  {units?.items.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
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
              <RequiredLabel required>Rôle</RequiredLabel>
              <Select value={form.functionalRoleId} onValueChange={(v) => setForm(f => ({ ...f, functionalRoleId: v }))}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un rôle..." /></SelectTrigger>
                <SelectContent>
                  {roles?.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel required>Date de début</RequiredLabel>
                <Input type="date" value={form.startDate} onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Date de fin</RequiredLabel>
                <Input type="date" value={form.endDate ?? ''} onChange={(e) => setForm(f => ({ ...f, endDate: e.target.value || null }))} />
              </div>
            </div>
            <div className="space-y-2">
              <RequiredLabel>Notes</RequiredLabel>
              <Input value={form.notes ?? ''} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value || null }))} />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Création...' : 'Créer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* End Assignment Dialog */}
      <Dialog open={!!endingAssignment} onOpenChange={() => setEndingAssignment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terminer l'affectation</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Terminer l'affectation de <strong>{endingAssignment?.memberLastName} {endingAssignment?.memberFirstName}</strong> dans <strong>{endingAssignment?.unitName}</strong>.
          </p>
          <div className="space-y-2">
            <RequiredLabel required>Date de fin</RequiredLabel>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndingAssignment(null)}>Annuler</Button>
            <Button onClick={handleEnd} disabled={!endDate || endMutation.isPending}>
              {endMutation.isPending ? 'Enregistrement...' : 'Terminer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Supprimer l'affectation"
        description={`Êtes-vous sûr de vouloir supprimer l'affectation de « ${deleting?.memberLastName} ${deleting?.memberFirstName} » ?`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
