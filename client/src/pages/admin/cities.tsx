// Admin "Villes" page ("/admin/cities", perm maitrise.manage — CG + super-admin). Curates the managed list of
// cities (member.cities setting) offered in address pickers. Edits are local-only until "Enregistrer" persists
// the whole array. Add/rename/remove are deduped accent- & case-insensitively (norm). Editing the list only
// changes future suggestions — addresses already saved on members are untouched.
import { useState, useEffect, useMemo, Fragment } from 'react'
import { useCities, useUpdateCities } from '@/services/settings-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parseApiError } from '@/lib/error-utils'
import { cn } from '@/lib/utils'
import { Plus, X, Search, MapPin, Pencil, Check } from 'lucide-react'
import { toast } from 'sonner'

// Accent/case-insensitive key for dedup + filtering (strips diacritics via NFD).
function norm(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
// A–Z bucket letter for the alphabetical grouping; non-letters fall into "#".
function firstLetter(s: string): string {
  const n = norm(s)
  const c = (n[0] ?? '#').toUpperCase()
  return /[A-Z]/.test(c) ? c : '#'
}

export default function CitiesAdminPage() {
  const stored = useCities()
  const updateCities = useUpdateCities()

  const [cities, setCities] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState('')
  const [dirty, setDirty] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  // Sync from the fetched setting, but never clobber unsaved local edits (dirty guard).
  useEffect(() => {
    if (!dirty) setCities(stored)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored.join('|')])

  const shown = useMemo(() => {
    const s = [...cities].sort((a, b) => a.localeCompare(b, 'fr'))
    return filter ? s.filter((c) => norm(c).includes(norm(filter))) : s
  }, [cities, filter])

  // Group alphabetically for a scannable, columned layout.
  const groups = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const c of shown) { const l = firstLetter(c); if (!map.has(l)) map.set(l, []); map.get(l)!.push(c) }
    return [...map.entries()]
  }, [shown])

  const addCity = () => {
    const v = draft.trim()
    if (!v) return
    if (cities.some((c) => norm(c) === norm(v))) { toast.error('Cette ville est déjà dans la liste.'); return }
    setCities((cs) => [...cs, v]); setDraft(''); setDirty(true)
  }
  const removeCity = (city: string) => { setCities((cs) => cs.filter((c) => c !== city)); setDirty(true) }
  const startRename = (city: string) => { setEditing(city); setEditDraft(city) }
  const saveRename = () => {
    if (editing === null) return
    const v = editDraft.trim()
    if (!v) { setEditing(null); return }
    if (norm(v) !== norm(editing) && cities.some((c) => norm(c) === norm(v))) { toast.error('Cette ville existe déjà.'); return }
    setCities((cs) => cs.map((c) => (c === editing ? v : c))); setDirty(true); setEditing(null)
  }

  const save = async () => {
    try { await updateCities.mutateAsync(cities); setDirty(false); toast.success('Liste des villes enregistrée') }
    catch (err) { toast.error(parseApiError(err)) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><MapPin className="h-5 w-5 text-primary" />Villes</h1>
          <p className="text-sm text-muted-foreground">Liste des villes proposées dans les formulaires d'adresse.</p>
        </div>
        <Button onClick={save} disabled={!dirty || updateCities.isPending}>
          {updateCities.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>

      {/* Add + filter */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex gap-2 sm:max-w-sm sm:flex-1">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCity() } }} placeholder="Ajouter une ville…" />
          <Button type="button" variant="outline" onClick={addCity}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer…" className="pl-8 pr-8" />
          {filter && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setFilter('')}><X className="h-3.5 w-3.5" /></button>}
        </div>
        <span className="flex items-center text-xs text-muted-foreground">
          {cities.length} ville{cities.length > 1 ? 's' : ''}{dirty && ' · non enregistré'}
        </span>
      </div>

      {/* Alphabetical table */}
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Aucune ville.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {groups.map(([letter, items]) => (
              <Fragment key={letter}>
                <div className="col-span-full border-b border-t bg-muted/50 px-3 py-1 text-xs font-semibold text-muted-foreground first:border-t-0">{letter}</div>
                {items.map((city) => (
                  <div key={city} className="group flex items-center gap-1 border-b border-r px-3 py-1.5 text-sm">
                    {editing === city ? (
                      <div className="flex flex-1 items-center gap-1">
                        <Input autoFocus value={editDraft} onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditing(null) }}
                          onBlur={saveRename} className="h-7 text-sm" />
                        <button type="button" className="text-emerald-600" onMouseDown={(e) => e.preventDefault()} onClick={saveRename}><Check className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 truncate">{city}</span>
                        <button type="button" className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100" title="Renommer" onClick={() => startRename(city)}><Pencil className="h-3.5 w-3.5" /></button>
                        <button type="button" className={cn('text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100')} title="Retirer" onClick={() => removeCity(city)}><X className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Renommer ou retirer une ville modifie la liste proposée — les adresses déjà saisies ne changent pas.</p>
    </div>
  )
}
