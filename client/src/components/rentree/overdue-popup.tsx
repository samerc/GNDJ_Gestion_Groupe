import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMyOverdueRentree } from '@/services/rentree-service'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CalendarClock } from 'lucide-react'

const SEEN_KEY = 'rentree-overdue-seen'

// A stable signature of the current overdue set (sorted task ids). Stored on dismiss so the popup RE-surfaces
// when the set changes (a new task falls overdue), instead of hiding forever after the first dismissal.
const signatureOf = (ids: string[]) => [...ids].sort().join(',')

// Reminds the assignee of their overdue rentrée tasks (past a fixed/anchored due date). Shows once per distinct
// overdue set — dismissing hides it until the set of overdue tasks changes.
export function RentreeOverduePopup() {
  const { data } = useMyOverdueRentree()
  const navigate = useNavigate()
  const signature = signatureOf((data ?? []).map((t) => t.id))
  // Derived (no effect): dismissed only if the SAME set was already dismissed this session.
  const [seenSig, setSeenSig] = useState(() => sessionStorage.getItem(SEEN_KEY) ?? '')
  const open = !!(data && data.length > 0) && seenSig !== signature

  const dismiss = () => { sessionStorage.setItem(SEEN_KEY, signature); setSeenSig(signature) }

  if (!data || data.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <CalendarClock className="h-5 w-5" />Tâches de rentrée en retard
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Vous avez {data.length} tâche{data.length > 1 ? 's' : ''} dont la date limite est dépassée :</p>
        <ul className="max-h-60 space-y-1.5 overflow-y-auto">
          {data.map((t) => (
            <li key={t.id} className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
              <p className="font-medium">{t.title}</p>
              <p className="text-xs text-muted-foreground">{t.scoutYear}{t.dueDate ? ` · échéance ${new Date(t.dueDate).toLocaleDateString('fr-FR')}` : ''}</p>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={dismiss}>Plus tard</Button>
          <Button onClick={() => { dismiss(); navigate('/rentree') }}>Voir mes tâches</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
