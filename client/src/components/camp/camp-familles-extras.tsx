// Camp BP — naming the familles and (optionally) grouping them into superfamilles.
//  • FamilleInfoDialog: a famille's name (its character / emblem), a short description (printed on the passport)
//    and its superfamille.
//  • SuperFamillesDialog: the optional list of superfamilles (e.g. 5 "universes"), plus "Répartir" which splits
//    the familles evenly in number order (1–10, 11–20…). Only a label: the draft and the rotation ignore it.
import { useState } from 'react'
import { toast } from 'sonner'
import {
  useUpdateFamilleInfo, useCampSuperFamilles, useSaveSuperFamilles, useAutoSuperFamilles, type CampFamilleDto,
} from '@/services/camp-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tip } from '@/components/ui/tooltip'
import { EmptyState } from '@/components/shared/empty-state'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Shuffle, ArrowUp, ArrowDown, Layers } from 'lucide-react'

const NONE = '__none__'

export function FamilleInfoDialog({ campId, famille, onClose }: { campId: string; famille: CampFamilleDto; onClose: () => void }) {
  const update = useUpdateFamilleInfo(campId)
  const { data: supers } = useCampSuperFamilles(campId)
  const [name, setName] = useState(famille.name ?? '')
  const [description, setDescription] = useState(famille.description ?? '')
  const [superId, setSuperId] = useState(famille.superFamilleId ?? NONE)
  const save = async () => {
    try {
      await update.mutateAsync({ familleId: famille.id, name: name.trim() || null, description: description.trim() || null, superFamilleId: superId === NONE ? null : superId })
      toast.success('Famille enregistrée'); onClose()
    } catch (e) { toast.error(parseApiError(e)) }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg">
        <DialogHeader><DialogTitle>Famille {famille.number}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm"><span className="font-medium">Nom (personnage, emblème…)</span>
            <Input value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder="ex. Yoda" /></label>
          <label className="block space-y-1 text-sm"><span className="font-medium">Description (imprimée sur le passeport)</span>
            <Textarea value={description} maxLength={1000} rows={4} onChange={e => setDescription(e.target.value)} /></label>
          {(supers ?? []).length > 0 && (
            <div className="space-y-1 text-sm">
              <p className="font-medium">Superfamille</p>
              <Select value={superId} onValueChange={setSuperId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Aucune</SelectItem>
                  {supers!.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={update.isPending}>{update.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface Row { id: string | null; name: string; description: string; familles: number[] }

export function SuperFamillesDialog({ campId, readOnly, onClose }: { campId: string; readOnly: boolean; onClose: () => void }) {
  const { data } = useCampSuperFamilles(campId)
  const save = useSaveSuperFamilles(campId)
  const auto = useAutoSuperFamilles(campId)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [prev, setPrev] = useState(data)
  if (data !== prev) { setPrev(data); setRows((data ?? []).map(s => ({ id: s.id, name: s.name, description: s.description ?? '', familles: s.familleNumbers }))) }
  const list = rows ?? []
  const dirty = JSON.stringify(list.map(r => [r.id, r.name, r.description])) !== JSON.stringify((data ?? []).map(s => [s.id, s.name, s.description ?? '']))
  const set = (i: number, patch: Partial<Row>) => setRows(list.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const move = (i: number, d: number) => { const n = [...list]; [n[i], n[i + d]] = [n[i + d], n[i]]; setRows(n) }

  const persist = async () => {
    if (list.some(r => !r.name.trim())) { toast.error('Chaque superfamille doit avoir un nom.'); return false }
    try { await save.mutateAsync(list.map(r => ({ id: r.id, name: r.name.trim(), description: r.description.trim() || null }))); return true }
    catch (e) { toast.error(parseApiError(e)); return false }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl">
        <DialogHeader><DialogTitle>Superfamilles</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Facultatif : regroupez les familles (par exemple 5 univers de 10 familles). Utilisé sur les passeports et dans le classement ;
          sans effet sur le tirage ni sur la rotation.
        </p>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto">
          {list.length === 0 && <EmptyState icon={Layers} title="Aucune superfamille." />}
          {list.map((r, i) => (
            <div key={r.id ?? `new-${i}`} className="space-y-1.5 rounded-lg border p-2">
              <div className="flex items-center gap-2">
                <Input value={r.name} maxLength={100} disabled={readOnly} placeholder="Nom (ex. Superhéros)" onChange={e => set(i, { name: e.target.value })} />
                {!readOnly && <>
                  <Tip content="Monter"><Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter"><ArrowUp className="h-4 w-4" /></Button></Tip>
                  <Tip content="Descendre"><Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Descendre"><ArrowDown className="h-4 w-4" /></Button></Tip>
                  <Tip content="Supprimer la superfamille"><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setRows(list.filter((_, j) => j !== i))} aria-label="Supprimer la superfamille"><Trash2 className="h-4 w-4" /></Button></Tip>
                </>}
              </div>
              <Input value={r.description} maxLength={1000} disabled={readOnly} placeholder="Description (facultatif)" onChange={e => set(i, { description: e.target.value })} />
              <p className="text-xs text-muted-foreground">{r.familles.length > 0 ? `Familles : ${r.familles.map(n => `F${n}`).join(', ')}` : 'Aucune famille'}</p>
            </div>
          ))}
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setRows([...list, { id: null, name: '', description: '', familles: [] }])}><Plus className="mr-1 h-4 w-4" />Ajouter</Button>
            <Button variant="outline" size="sm" disabled={list.length === 0 || auto.isPending}
              onClick={async () => {
                if (dirty && !(await persist())) return
                try { await auto.mutateAsync(); toast.success('Familles réparties dans les superfamilles') } catch (e) { toast.error(parseApiError(e)) }
              }}>
              <Shuffle className="mr-1 h-4 w-4" />Répartir les familles (par numéro)
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fermer</Button>
          {!readOnly && <Button disabled={!dirty || save.isPending} onClick={async () => { if (await persist()) toast.success('Superfamilles enregistrées') }}>{save.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
