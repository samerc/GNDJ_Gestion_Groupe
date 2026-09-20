// CG cleanup page for "zero-day" assignments (start_date == end_date, 1-day markers from the WEBDEV migration
// where a real placement had a start but no end date). The member really passed through that unit/role but the
// duration is unknown. For each, the CG decides: DELETE it (spurious/duplicate) or give it real dates (which
// removes it from the list). Group-manager only (maitrise.manage / super-admin).
import { useState } from 'react'
import { Link } from 'react-router'
import { useZeroDayAssignments, useUpdateAssignment, useDeleteAssignment, type ZeroDayAssignment } from '@/services/assignment-service'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { DateInput } from '@/components/shared/date-input'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { CalendarClock, Trash2, Pencil, CheckCircle2 } from 'lucide-react'

function fmt(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function ZeroDayAssignmentsPage() {
  const { data, isLoading } = useZeroDayAssignments()
  const update = useUpdateAssignment()
  const del = useDeleteAssignment()

  const rows = data ?? []
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<ZeroDayAssignment | null>(null)
  const [editStart, setEditStart] = useState<string | null>(null)
  const [editEnd, setEditEnd] = useState<string | null>(null)
  const [deleteOne, setDeleteOne] = useState<ZeroDayAssignment | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)))

  const openEdit = (a: ZeroDayAssignment) => { setEditing(a); setEditStart(a.date); setEditEnd(null) }

  const saveEdit = async () => {
    if (!editing || !editStart || !editEnd) return
    try {
      await update.mutateAsync({
        id: editing.id, memberId: editing.memberId, unitId: editing.unitId,
        teamId: editing.teamId, functionalRoleId: editing.roleId,
        startDate: editStart, endDate: editEnd, notes: null,
      })
      toast.success('Dates mises à jour')
      setEditing(null)
      setSelected(s => { const n = new Set(s); n.delete(editing.id); return n })
    } catch (e) { toast.error(parseApiError(e)) }
  }

  const doDelete = async () => {
    if (!deleteOne) return
    try {
      await del.mutateAsync(deleteOne.id)
      toast.success('Affectation supprimée')
      setSelected(s => { const n = new Set(s); n.delete(deleteOne.id); return n })
      setDeleteOne(null)
    } catch (e) { toast.error(parseApiError(e)); setDeleteOne(null) }
  }

  const doBulkDelete = async () => {
    const ids = [...selected]
    const results = await Promise.allSettled(ids.map(id => del.mutateAsync(id)))
    const ok = results.filter(r => r.status === 'fulfilled').length
    const fail = results.length - ok
    toast.success(`${ok} supprimée(s)${fail ? ` · ${fail} échec(s)` : ''}`)
    setSelected(new Set())
    setBulkDeleteOpen(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarClock className="h-6 w-6" />Affectations à dater</h1>
        <p className="text-muted-foreground mt-1 text-sm max-w-3xl">
          Ces affectations ont une date de début égale à la date de fin (marqueurs d'un seul jour issus de la
          migration) : le membre est bien passé par cette unité/fonction, mais la durée réelle est inconnue. Pour
          chacune, vous pouvez <strong>corriger les dates</strong> (si vous les connaissez) ou la
          <strong> supprimer</strong> si elle est erronée ou en double. Les fiches des membres ne sont pas touchées.
        </p>
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : rows.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Rien à dater" description="Aucune affectation d'un seul jour à examiner." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">{rows.length} affectation(s)</span>
            {selected.size > 0 && (
              <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 className="mr-1 h-4 w-4" />Supprimer la sélection ({selected.size})
              </Button>
            )}
          </div>

          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="px-3 py-2 w-10"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                  <th className="px-3 py-2 font-medium">Membre</th>
                  <th className="px-3 py-2 font-medium">Unité</th>
                  <th className="px-3 py-2 font-medium">Fonction</th>
                  <th className="px-3 py-2 font-medium">Équipe</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2 w-40" />
                </tr>
              </thead>
              <tbody>
                {rows.map((a, i) => (
                  <tr key={a.id} className={`border-b hover:bg-muted/20 ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                    <td className="px-3 py-2"><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} /></td>
                    <td className="px-3 py-2">
                      <Link to={`/members/${a.memberId}?tab=unites`}
                        state={{ from: '/admin/zero-day-assignments', fromLabel: 'Affectations à dater' }}
                        className="font-medium text-primary hover:underline">{a.memberName}</Link>
                      {a.cardNumber && <div className="text-xs text-muted-foreground">{a.cardNumber}</div>}
                    </td>
                    <td className="px-3 py-2">{a.unitCode}<span className="text-xs text-muted-foreground"> · {a.unitName}</span></td>
                    <td className="px-3 py-2">{a.roleName}</td>
                    <td className="px-3 py-2">{a.teamName ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(a.date)}</td>
                    <td className="px-3 py-2">
                      {a.memberHasActiveAssignment
                        ? <Badge className="bg-emerald-600">Membre actif</Badge>
                        : <Badge variant="secondary">Ancien</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" className="h-8" onClick={() => openEdit(a)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />Dater
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Supprimer" onClick={() => setDeleteOne(a)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Correct dates dialog */}
      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Corriger les dates — {editing?.memberName}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {editing?.unitCode} · {editing?.roleName}. Renseignez la période réelle ; la date de fin doit être
              postérieure à la date de début.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Date de début</label>
                <DateInput value={editStart} onChange={setEditStart} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Date de fin</label>
                <DateInput value={editEnd} onChange={setEditEnd} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
            <Button onClick={saveEdit} disabled={update.isPending || !editStart || !editEnd || (!!editEnd && !!editStart && editEnd <= editStart)}>
              {update.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteOne} onOpenChange={o => !o && setDeleteOne(null)} title="Supprimer l'affectation"
        description={deleteOne ? `Supprimer l'affectation ${deleteOne.unitCode} · ${deleteOne.roleName} de ${deleteOne.memberName} ? Cette action retire cette ligne d'historique.` : ''}
        confirmLabel="Supprimer" loading={del.isPending} onConfirm={doDelete} />
      <ConfirmDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen} title="Supprimer les affectations sélectionnées"
        description={`Supprimer ${selected.size} affectation(s) d'un seul jour ? Cette action retire ces lignes d'historique.`}
        confirmLabel="Supprimer" onConfirm={doBulkDelete} />
    </div>
  )
}
