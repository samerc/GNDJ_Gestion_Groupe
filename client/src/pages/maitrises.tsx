import { useState } from 'react'
import {
  useMaitrises, useRemoveFromMaitrise, useTransferMaitrise, type MaitriseMemberDto,
} from '@/services/maitrise-service'
import { useUnits } from '@/services/unit-service'
import { useFunctionalRoles } from '@/services/role-service'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { UserMinus, ArrowRightLeft, Crown, ChevronRight } from 'lucide-react'
import { Tip } from '@/components/ui/tooltip'
import { toast } from 'sonner'

// CG-only page (perm maitrise.manage): the leaders (maîtrise) of every unit, grouped into
// collapsible per-unit cards ordered by rank. CG can remove a leader (ends the function) or
// transfer them to another unit/function.
export default function MaitrisesPage() {
  const { data: units, isLoading } = useMaitrises()
  const removeMutation = useRemoveFromMaitrise()
  // The member targeted by the remove-confirm dialog / the transfer dialog (null = closed).
  const [removeTarget, setRemoveTarget] = useState<MaitriseMemberDto | null>(null)
  const [transferTarget, setTransferTarget] = useState<MaitriseMemberDto | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set()) // set of expanded unit ids; collapsed by default
  const toggle = (unitId: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(unitId) ? next.delete(unitId) : next.add(unitId)
    return next
  })

  const handleRemove = async () => {
    if (!removeTarget) return
    try {
      await removeMutation.mutateAsync(removeTarget.assignmentId)
      toast.success('Membre retiré de la maîtrise')
      setRemoveTarget(null)
    } catch (e) { toast.error(parseApiError(e)) }
  }

  if (isLoading) return <LoadingSpinner variant="table" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Maîtrises</h1>
        <p className="text-sm text-muted-foreground">Les responsables de chaque unité, classés par rang (du plus ancien au plus récent).</p>
      </div>

      {(!units || units.length === 0) && (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Aucune maîtrise à afficher.</CardContent></Card>
      )}

      <div className="space-y-4">
        {units?.map(u => {
          const isOpen = expanded.has(u.unitId)
          return (
          <Card key={u.unitId}>
            <button
              type="button"
              onClick={() => toggle(u.unitId)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40"
            >
              <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
              {u.isGroupUnit
                ? <Badge className="gap-1" style={u.unitTypeColor ? { backgroundColor: u.unitTypeColor } : undefined}><Crown className="h-3 w-3" />Maîtrise de Groupe</Badge>
                : <Badge variant="outline" style={u.unitTypeColor ? { borderColor: u.unitTypeColor, color: u.unitTypeColor, backgroundColor: `${u.unitTypeColor}14` } : undefined}>{u.unitCode}</Badge>}
              <span className="font-medium">{u.unitName}</span>
              <span className="ml-auto text-xs text-muted-foreground">{u.members.length} membre{u.members.length > 1 ? 's' : ''}</span>
            </button>
            {isOpen && (
              <CardContent className="border-t p-0">
                <div className="divide-y">
                  {u.members.map(m => (
                    <div key={m.assignmentId} className="flex items-center gap-2 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{m.lastName} {m.firstName}</div>
                        <div className="text-xs text-muted-foreground">{m.functionName}</div>
                      </div>
                      <Tip content="Transférer vers une autre unité"><Button variant="ghost" size="sm" onClick={() => setTransferTarget(m)}>
                        <ArrowRightLeft className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Transférer</span>
                      </Button></Tip>
                      <Tip content="Retirer de la maîtrise"><Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setRemoveTarget(m)}>
                        <UserMinus className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Retirer</span>
                      </Button></Tip>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
          )
        })}
      </div>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => { if (!o) setRemoveTarget(null) }}
        title="Retirer de la maîtrise"
        description={removeTarget
          ? `Retirer ${removeTarget.firstName} ${removeTarget.lastName} de la maîtrise ? Sa fonction « ${removeTarget.functionName} » sera clôturée et il n'apparaîtra plus dans son unité.`
          : ''}
        confirmLabel="Retirer"
        variant="destructive"
        loading={removeMutation.isPending}
        onConfirm={handleRemove}
      />

      {transferTarget && <TransferDialog member={transferTarget} onClose={() => setTransferTarget(null)} />}
    </div>
  )
}

// Move a leader to another unit. `keepOld` chooses cumul (add the new function, keep the old)
// vs. mutation (close the old, open the new). Function list is scoped to the chosen unit's type.
function TransferDialog({ member, onClose }: { member: MaitriseMemberDto; onClose: () => void }) {
  const { data: units } = useUnits({ isActive: true, pageSize: 300 })
  const transferMutation = useTransferMaitrise()
  const [newUnitId, setNewUnitId] = useState('')
  const [newRoleId, setNewRoleId] = useState('')
  const [keepOld, setKeepOld] = useState(false)

  // Roles depend on the picked unit's type; only non-archived maîtrise (leadership) functions are offered.
  const selectedUnit = units?.items.find(u => u.id === newUnitId)
  const { data: roles } = useFunctionalRoles(selectedUnit?.unitTypeId)
  const leaderRoles = roles?.filter(r => r.isMaitrise && !r.isArchived)

  const handleTransfer = async () => {
    if (!newUnitId || !newRoleId) return
    try {
      await transferMutation.mutateAsync({ assignmentId: member.assignmentId, newUnitId, newFunctionalRoleId: newRoleId, keepOld })
      toast.success(keepOld ? 'Nouvelle fonction ajoutée' : 'Membre transféré')
      onClose()
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Transférer {member.firstName} {member.lastName}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Nouvelle unité</label>
            <Select value={newUnitId} onValueChange={(v) => { setNewUnitId(v); setNewRoleId('') }}>
              <SelectTrigger><SelectValue placeholder="Sélectionner une unité..." /></SelectTrigger>
              <SelectContent>
                {units?.items.map(u => <SelectItem key={u.id} value={u.id}>{u.code} — {u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {selectedUnit && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Nouvelle fonction</label>
              <Select value={newRoleId} onValueChange={setNewRoleId}>
                <SelectTrigger><SelectValue placeholder="Sélectionner une fonction..." /></SelectTrigger>
                <SelectContent>
                  {leaderRoles?.length
                    ? leaderRoles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)
                    : <div className="px-2 py-1.5 text-sm text-muted-foreground">Aucune fonction de maîtrise pour ce type d'unité.</div>}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2 rounded-md border p-3">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="radio" checked={!keepOld} onChange={() => setKeepOld(false)} className="mt-1" />
              <span><b>Clôturer l'ancienne fonction</b> et ouvrir la nouvelle (mutation d'unité)</span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="radio" checked={keepOld} onChange={() => setKeepOld(true)} className="mt-1" />
              <span><b>Garder l'ancienne fonction</b> et ajouter la nouvelle (cumul des deux)</span>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleTransfer} disabled={!newUnitId || !newRoleId || transferMutation.isPending}>
            {transferMutation.isPending ? 'Transfert...' : 'Transférer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
