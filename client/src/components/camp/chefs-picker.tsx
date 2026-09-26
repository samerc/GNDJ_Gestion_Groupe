// Checkbox list of the assistants chef de groupe (active group-level role) the CG can name "Chef de commission":
// they lead that camp with full rights on it. Used when creating a camp and on the camp's Commission tab.
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useCampCommissionCandidates } from '@/services/camp-service'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/shared/loading-spinner'

export function ChefsPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { data: candidates, isLoading } = useCampCommissionCandidates(true, true)
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    const q = norm(search.trim())
    return (candidates ?? []).filter((c) => !q || norm(`${c.firstName} ${c.lastName} ${c.roles ?? ''}`).includes(q))
  }, [candidates, search])
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Rechercher un assistant…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {isLoading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">Aucun assistant chef de groupe trouvé.</p>
        ) : filtered.map((c) => (
          <label key={c.memberId} className="flex cursor-pointer items-start gap-2 rounded border px-2 py-1.5 text-sm hover:bg-muted/40">
            <input type="checkbox" className="mt-1" checked={value.includes(c.memberId)} onChange={() => toggle(c.memberId)} />
            <span className="min-w-0">
              <span className="font-medium">{c.lastName} {c.firstName}</span>
              {c.roles && <span className="block truncate text-xs text-muted-foreground">{c.roles}</span>}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
