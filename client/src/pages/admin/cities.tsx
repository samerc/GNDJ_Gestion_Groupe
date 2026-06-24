import { useState, useEffect, useMemo } from 'react'
import { useCities, useUpdateCities } from '@/services/settings-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parseApiError } from '@/lib/error-utils'
import { Plus, X, Search, MapPin } from 'lucide-react'
import { toast } from 'sonner'

function norm(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export default function CitiesAdminPage() {
  const stored = useCities()
  const updateCities = useUpdateCities()

  const [cities, setCities] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState('')
  const [dirty, setDirty] = useState(false)

  // Hydrate local state once the stored list loads (and when it changes externally while clean).
  useEffect(() => {
    if (!dirty) setCities(stored)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored.join('|')])

  const sorted = useMemo(
    () => [...cities].sort((a, b) => a.localeCompare(b, 'fr')),
    [cities],
  )
  const shown = useMemo(
    () => (filter ? sorted.filter((c) => norm(c).includes(norm(filter))) : sorted),
    [sorted, filter],
  )

  const addCity = () => {
    const v = draft.trim()
    if (!v) return
    if (cities.some((c) => norm(c) === norm(v))) {
      toast.error('Cette ville est déjà dans la liste.')
      return
    }
    setCities((cs) => [...cs, v])
    setDraft('')
    setDirty(true)
  }

  const removeCity = (city: string) => {
    setCities((cs) => cs.filter((c) => c !== city))
    setDirty(true)
  }

  const save = async () => {
    try {
      await updateCities.mutateAsync(cities)
      setDirty(false)
      toast.success('Liste des villes enregistrée')
    } catch (err) {
      toast.error(parseApiError(err))
    }
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
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCity() } }}
            placeholder="Ajouter une ville…"
          />
          <Button type="button" variant="outline" onClick={addCity}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer…" className="pl-8" />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {cities.length} ville{cities.length > 1 ? 's' : ''}{dirty && ' · modifications non enregistrées'}
      </p>

      {/* Chips */}
      <div className="flex flex-wrap gap-2">
        {shown.map((city) => (
          <span key={city} className="inline-flex items-center gap-1.5 rounded-full border bg-background py-1 pl-3 pr-1.5 text-sm shadow-2xs">
            {city}
            <button type="button" className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => removeCity(city)} aria-label={`Retirer ${city}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        {shown.length === 0 && <p className="text-sm text-muted-foreground">Aucune ville.</p>}
      </div>
    </div>
  )
}
