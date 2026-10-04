// Camp BP — the « liste de matériel » of one game: items (optional quantity + name), a ✕ per item and one add row.
// Every add / remove saves the whole list at once (PUT /camps/games/{id}/materials). Editable by the commission with
// Jeux "edit" and by the game's étapistes (the server checks); read-only otherwise.
// `framed` draws its own box + title (« Mes jeux »); without it the list sits inside the game card's own panel.
import { useState } from 'react'
import { toast } from 'sonner'
import { Package, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/ui/tooltip'
import { parseApiError } from '@/lib/error-utils'
import { useSetGameMaterials, type CampGameMaterial } from '@/services/camp-service'

export function GameMaterials({ gameId, campId, items, canEdit, framed = false }: {
  gameId: string; campId: string; items: CampGameMaterial[]; canEdit: boolean; framed?: boolean
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
    const q = qty ? Math.max(1, parseInt(qty, 10)) : null
    if (await commit([...items, { name: n, quantity: q }])) { setName(''); setQty('') }
  }

  if (!canEdit && items.length === 0 && framed) return null
  const body = (
    <>
      {items.length === 0
        ? <p className="py-1 text-sm text-muted-foreground">Aucun matériel.</p>
        : <ul className="divide-y">
            {items.map((m, i) => (
              <li key={i} className="group flex items-center gap-2.5 py-1.5 text-sm">
                <span className={cn('inline-flex h-6 min-w-9 shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums',
                  m.quantity != null ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                  {m.quantity ?? '—'}
                </span>
                <span className="min-w-0 flex-1 break-words">{m.name}</span>
                {canEdit && (
                  <Tip content="Retirer de la liste">
                    <button type="button" aria-label={`Retirer ${m.name}`} disabled={save.isPending}
                      className="rounded p-1 text-muted-foreground/60 transition hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                      onClick={() => commit(items.filter((_, j) => j !== i))}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Tip>
                )}
              </li>
            ))}
          </ul>}
      {canEdit && (
        // One add row: quantity (optional) + item, Enter or + to add.
        <div className="mt-2 flex items-center overflow-hidden rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring/40">
          <input value={qty} onChange={e => setQty(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} placeholder="Qté" inputMode="numeric"
            aria-label="Quantité" className="h-9 w-14 border-r bg-transparent px-2 text-center text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={e => { if (e.key === 'Enter') add() }} />
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ajouter du matériel…" maxLength={150}
            aria-label="Matériel" className="h-9 min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={e => { if (e.key === 'Enter') add() }} />
          <Tip content="Ajouter le matériel">
            <button type="button" onClick={add} disabled={!name.trim() || save.isPending} aria-label="Ajouter le matériel"
              className="flex h-9 w-9 shrink-0 items-center justify-center text-primary transition hover:bg-primary/10 disabled:text-muted-foreground/40 disabled:hover:bg-transparent">
              <Plus className="h-4 w-4" />
            </button>
          </Tip>
        </div>
      )}
    </>
  )
  if (!framed) return body
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-medium"><Package className="h-4 w-4 text-primary" />Matériel
        {items.length > 0 && <span className="font-normal text-muted-foreground">· {items.length}</span>}</p>
      {body}
    </div>
  )
}
