// Editor for the camp.places setting (Paramètres → Camp BP): one row per place — name, usable as lieu A and/or
// lieu B, size, and how many games it hosts at the same time. Staged: the settings row's Enregistrer button saves.
import { useMemo, useState } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { parsePlaces, SIZE_LABELS, type CampPlace } from '@/lib/camp-places'

export function CampPlacesEditor({ value, onChange }: { value: string; onChange: (json: string) => void }) {
  const places = useMemo(() => parsePlaces(value), [value])
  const [filter, setFilter] = useState('')
  const [newName, setNewName] = useState('')
  const set = (next: CampPlace[]) => onChange(JSON.stringify(next))
  const patch = (i: number, p: Partial<CampPlace>) => set(places.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const exists = (n: string) => places.some(p => p.name.trim().toLowerCase() === n.trim().toLowerCase())
  const add = () => {
    const n = newName.trim()
    if (!n || exists(n) || /[<>]/.test(n)) return
    set([...places, { name: n, a: true, b: false, size: 2, capacity: 1 }]); setNewName('')
  }
  const shown = places.map((p, i) => ({ p, i })).filter(({ p }) => p.name.toLowerCase().includes(filter.toLowerCase()))
  const countA = places.filter(p => p.a).length, countB = places.filter(p => p.b).length

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filtrer…" className="pl-8" />
        </div>
        <span className="text-xs text-muted-foreground">{places.length} lieux · {countA} lieux A · {countB} lieux B</span>
      </div>
      <div className="max-h-[60vh] overflow-auto rounded-lg border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">Lieu</th>
              <th className="px-2 py-1.5 font-medium" title="Lieu principal">Lieu A</th>
              <th className="px-2 py-1.5 font-medium" title="Lieu de repli (mauvais temps)">Lieu B</th>
              <th className="px-2 py-1.5 font-medium">Taille</th>
              <th className="px-2 py-1.5 font-medium" title="Nombre de jeux qu'il accueille en même temps">Jeux en même temps</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map(({ p, i }) => (
              <tr key={i}>
                <td className="px-2 py-1"><Input value={p.name} maxLength={150} className="h-8" onChange={e => patch(i, { name: e.target.value })} /></td>
                <td className="px-2 py-1 text-center"><input type="checkbox" className="h-4 w-4" checked={p.a} onChange={e => patch(i, { a: e.target.checked })} aria-label={`${p.name} : lieu A`} /></td>
                <td className="px-2 py-1 text-center"><input type="checkbox" className="h-4 w-4" checked={p.b} onChange={e => patch(i, { b: e.target.checked })} aria-label={`${p.name} : lieu B`} /></td>
                <td className="px-2 py-1">
                  <Select value={String(p.size)} onValueChange={v => patch(i, { size: Number(v) })}>
                    <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>{[1, 2, 3].map(s => <SelectItem key={s} value={String(s)}>{SIZE_LABELS[s]}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-1 text-center">
                  <Input type="number" min={1} max={25} value={p.capacity} className="mx-auto h-8 w-16"
                    onChange={e => patch(i, { capacity: Math.min(25, Math.max(1, Number(e.target.value) || 1)) })} />
                </td>
                <td className="px-1 py-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => set(places.filter((_, j) => j !== i))} aria-label={`Supprimer ${p.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-xs text-muted-foreground">Aucun lieu.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex max-w-md gap-2">
        <Input value={newName} maxLength={150} placeholder="Nouveau lieu…" onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <Button variant="outline" onClick={add} disabled={!newName.trim() || exists(newName)}><Plus className="mr-1 h-4 w-4" />Ajouter</Button>
      </div>
      {newName.trim() && exists(newName) && <p className="text-xs text-destructive">Ce lieu existe déjà.</p>}
    </div>
  )
}
