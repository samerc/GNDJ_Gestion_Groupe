// Camp BP — sub-commissions (Trésor, Jeu, Code, Logistique…): the commission members are split into them.
//  • SubCommissionChips: on each member row — the chefs de commission / CG click a chip to put the member in or out.
//  • SubCommissionsOverview: who is in each sub-commission (and who isn't in any yet).
//  • SubCommissionsDialog: edit the camp's list of sub-commissions (a removed one is dropped from its members).
import { useState } from 'react'
import { toast } from 'sonner'
import { useSetMemberSubCommissions, useSetCampSubCommissions, type CampCommissionMemberDto } from '@/services/camp-service'
import { parseApiError } from '@/lib/error-utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tip } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Trash2 } from 'lucide-react'

export function SubCommissionChips({ campId, member, names, editable }: {
  campId: string; member: CampCommissionMemberDto; names: string[]; editable: boolean
}) {
  const set = useSetMemberSubCommissions(campId)
  const mine = member.subCommissions ?? []
  const toggle = async (n: string) => {
    const next = mine.includes(n) ? mine.filter(x => x !== n) : [...mine, n]
    try { await set.mutateAsync({ memberId: member.memberId, names: next }) } catch (e) { toast.error(parseApiError(e)) }
  }
  const shown = editable ? names : names.filter(n => mine.includes(n))
  if (shown.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {shown.map(n => {
        const on = mine.includes(n)
        return editable ? (
          <button key={n} type="button" disabled={set.isPending} onClick={() => toggle(n)}
            className={cn('rounded-full border px-2 py-0.5 text-xs transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
            {n}
          </button>
        ) : <Badge key={n} variant="secondary">{n}</Badge>
      })}
    </div>
  )
}

export function SubCommissionsOverview({ members, names }: { members: CampCommissionMemberDto[]; names: string[] }) {
  if (members.length === 0) return null
  const none = members.filter(m => (m.subCommissions ?? []).length === 0)
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {names.map(n => {
        const inIt = members.filter(m => (m.subCommissions ?? []).includes(n))
        return (
          <div key={n} className="rounded-lg border p-3">
            <p className="text-sm font-semibold">{n} <span className="font-normal text-muted-foreground">({inIt.length})</span></p>
            <p className="mt-1 text-xs text-muted-foreground">{inIt.length ? inIt.map(m => `${m.firstName} ${m.lastName}`).join(', ') : 'Personne pour l’instant.'}</p>
          </div>
        )
      })}
      {none.length > 0 && (
        <div className="rounded-lg border border-dashed p-3">
          <p className="text-sm font-semibold text-muted-foreground">Sans sous-commission ({none.length})</p>
          <p className="mt-1 text-xs text-muted-foreground">{none.map(m => `${m.firstName} ${m.lastName}`).join(', ')}</p>
        </div>
      )}
    </div>
  )
}

export function SubCommissionsDialog({ campId, names, onClose }: { campId: string; names: string[]; onClose: () => void }) {
  const save = useSetCampSubCommissions(campId)
  const [list, setList] = useState(names)
  const submit = async () => {
    const clean = list.map(n => n.trim()).filter(Boolean)
    try { await save.mutateAsync(clean); toast.success('Sous-commissions enregistrées'); onClose() } catch (e) { toast.error(parseApiError(e)) }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Sous-commissions</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Une sous-commission retirée est enlevée des membres qui y étaient.</p>
        <div className="space-y-2">
          {list.map((n, i) => (
            <div key={i} className="flex gap-2">
              <Input value={n} maxLength={60} onChange={e => setList(list.map((x, j) => (j === i ? e.target.value : x)))} />
              <Tip content="Retirer la sous-commission"><Button variant="ghost" size="icon" className="text-destructive" aria-label="Retirer la sous-commission" onClick={() => setList(list.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></Tip>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setList([...list, ''])}><Plus className="mr-1 h-4 w-4" />Ajouter</Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
