import { useState } from 'react'
import { Link } from 'react-router'
import { Cake } from 'lucide-react'
import { useUpcomingBirthdays, type UpcomingBirthday } from '@/services/member-service'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// French day/month for the birthday date (e.g. "14 sept.").
const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const label = (d: number) => (d === 0 ? "Aujourd'hui 🎉" : d === 1 ? 'Demain' : `dans ${d} j`)

// The shared list of birthday rows (each links to the member fiche).
function BirthdayRows({ data, onNavigate }: { data: UpcomingBirthday[]; onNavigate?: () => void }) {
  return (
    <ul className="divide-y">
      {data.slice(0, 20).map((b) => (
        <li key={b.memberId}>
          <Link to={`/members/${b.memberId}`} onClick={onNavigate} className="flex items-center gap-3 py-2 text-sm transition-colors hover:text-primary">
            <span className={`w-16 shrink-0 text-xs font-medium ${b.daysUntil === 0 ? 'text-pink-600' : 'text-muted-foreground'}`}>{fmt(b.nextBirthday)}</span>
            <span className="min-w-0 flex-1 truncate">{b.firstName} {b.lastName}{b.unitName && <span className="text-xs text-muted-foreground"> · {b.unitName}</span>}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{b.turningAge} ans · {label(b.daysUntil)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

// "Anniversaires à venir" — a compact dashboard card of members whose birthday falls in the next `days`.
// Leaders only, unit-scoped server-side (a CU sees their unit's members, a CG sees everyone). Hidden entirely
// when there are none, to avoid an empty card. Used on the group Accueil dashboard.
export function BirthdaysCard({ days = 30, className }: { days?: number; className?: string }) {
  const { data, isLoading } = useUpcomingBirthdays(days)
  if (isLoading || !data || data.length === 0) return null
  return (
    <div className={`rounded-xl border bg-card p-4 shadow-card ${className ?? ''}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-100 text-pink-600"><Cake className="h-4 w-4" /></span>
        <h3 className="text-sm font-semibold">Anniversaires à venir</h3>
        <span className="ml-auto text-xs text-muted-foreground">{days} prochains jours</span>
      </div>
      <BirthdayRows data={data} />
    </div>
  )
}

// Action-bar variant for the height-locked CU unit dashboard: a small button (with a count) that opens a dialog.
// Hidden when there are no upcoming birthdays.
export function BirthdaysButton({ days = 30 }: { days?: number }) {
  const { data } = useUpcomingBirthdays(days)
  const [open, setOpen] = useState(false)
  if (!data || data.length === 0) return null
  return (
    <>
      <Button variant="outline" size="sm" className="shrink-0" onClick={() => setOpen(true)}>
        <Cake className="mr-1 h-4 w-4" />Anniversaires ({data.length})
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Anniversaires à venir ({days} prochains jours)</DialogTitle></DialogHeader>
          <BirthdayRows data={data} onNavigate={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}
