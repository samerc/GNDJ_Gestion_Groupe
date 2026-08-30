// Reusable searchable member picker — a small dialog that searches the members list and calls onPick with the
// chosen member. Used wherever an admin needs to pick a member to act on (delegation, super-admin, …).
import { useState } from 'react'
import { useMembers } from '@/services/member-service'
import { useDebounce } from '@/hooks/use-debounce'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Users } from 'lucide-react'

export function MemberPickerDialog({ open, onOpenChange, onPick, title = 'Choisir un membre', description }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onPick: (m: { id: string; name: string }) => void
  title?: string
  description?: string
}) {
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search)
  const { data: results } = useMembers({ search: debounced || undefined, pageSize: 8 })

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearch('') }}>
      <DialogContent className="max-w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un membre…" />
        {debounced && results && (
          <div className="max-h-56 overflow-y-auto rounded-md border text-sm">
            {results.items.length === 0
              ? <p className="px-3 py-4 text-center text-muted-foreground">Aucun membre trouvé.</p>
              : results.items.map(m => (
                <button key={m.id} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                  onClick={() => onPick({ id: m.id, name: `${m.firstName} ${m.lastName}` })}>
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />{m.lastName} {m.firstName}
                </button>
              ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
