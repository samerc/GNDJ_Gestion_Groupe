// Camp BP — the « liste de matériel » of one game: items (optional quantity + name) with an add field and a ✕ per
// item. Every add / remove saves the whole list at once (PUT /camps/games/{id}/materials). Editable by the commission
// with Jeux "edit" and by the game's étapistes (the server checks); read-only otherwise.
import { useState } from 'react'
import { toast } from 'sonner'
import { Package, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parseApiError } from '@/lib/error-utils'
import { useSetGameMaterials, type CampGameMaterial } from '@/services/camp-service'

export function GameMaterials({ gameId, campId, items, canEdit }: {
  gameId: string; campId: string; items: CampGameMaterial[]; canEdit: boolean
}) {
  const save = useSetGameMaterials(campId)
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')

  const commit = async (next: CampGameMaterial[]) => {
    try { await save.mutateAsync({ gameId, items: next }); return true }
    catch (e) { toast.error(parseApiError(e)); return false }
  }
  const add = async () => {
    const n = name.trim()
    if (!n) return
    const q = qty.trim() ? Math.max(1, Math.floor(Number(qty))) : null
    if (await commit([...items, { name: n, quantity: Number.isFinite(q) ? q : null }])) { setName(''); setQty('') }
  }

  if (!canEdit && items.length === 0) return null
  return (
    <div className="rounded-md border px-3 py-2 text-sm">
      <p className="flex items-center gap-1.5 font-medium"><Package className="h-4 w-4 text-primary" />Matériel{items.length > 0 && <span className="font-normal text-muted-foreground">({items.length})</span>}</p>
      {items.length === 0
        ? <p className="mt-1 text-xs text-muted-foreground">Aucun matériel pour l'instant.</p>
        : <ul className="mt-1 space-y-0.5">
            {items.map((m, i) => (
              <li key={i} className="group flex items-center gap-2">
                <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{m.quantity != null ? `${m.quantity} ×` : '•'}</span>
                <span className="min-w-0 flex-1 break-words">{m.name}</span>
                {canEdit && (
                  <button type="button" aria-label={`Retirer ${m.name}`} disabled={save.isPending}
                    className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => commit(items.filter((_, j) => j !== i))}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>}
      {canEdit && (
        <div className="mt-2 flex gap-1.5">
          <Input value={qty} onChange={e => setQty(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Qté" inputMode="numeric"
            aria-label="Quantité" className="h-8 w-16" onKeyDown={e => { if (e.key === 'Enter') add() }} />
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ajouter du matériel…" maxLength={150}
            aria-label="Matériel" className="h-8 flex-1" onKeyDown={e => { if (e.key === 'Enter') add() }} />
          <Button size="sm" variant="outline" className="h-8" onClick={add} disabled={!name.trim() || save.isPending}><Plus className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  )
}
