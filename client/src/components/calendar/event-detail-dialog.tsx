// What an item of the calendar is: date, time, place, for whom, description. Editors of an event get Modifier,
// Supprimer (the whole series) and — for a repeating event — « Annuler cette date » (only this occurrence).
import { Link } from 'react-router'
import { toast } from 'sonner'
import { CalendarDays, Clock, MapPin, Users, Repeat, Pencil, Trash2, CalendarX } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { confirmAsync } from '@/lib/confirm'
import { parseApiError } from '@/lib/error-utils'
import { useCancelCalendarDate, useDeleteCalendarEvent, type CalendarItem } from '@/services/calendar-service'
import { dayTitle, itemColor, timeLabel } from './calendar-utils'
import { cn } from '@/lib/utils'

export function EventDetailDialog({ item, onClose, onEdit, canOpenMeetings }: {
  item: CalendarItem | null; onClose: () => void; onEdit: (eventId: string) => void; canOpenMeetings: boolean
}) {
  const del = useDeleteCalendarEvent()
  const cancelDate = useCancelCalendarDate()
  if (!item) return null
  const time = timeLabel(item)
  const kindLabel = item.kind === 'meeting' ? 'Réunion de l\'unité' : item.kind === 'date' ? 'Date importante' : 'Événement'

  const remove = async () => {
    if (!item.eventId) return
    const ok = await confirmAsync({
      title: 'Supprimer cet événement ?',
      description: item.recurring ? 'Toutes les dates de cet événement seront supprimées.' : 'Il disparaîtra du calendrier de tout le monde.',
      confirmLabel: 'Supprimer', destructive: true,
    })
    if (!ok) return
    try { await del.mutateAsync(item.eventId); toast.success('Événement supprimé.'); onClose() } catch (e) { toast.error(parseApiError(e)) }
  }

  const cancelThis = async () => {
    if (!item.eventId) return
    const ok = await confirmAsync({
      title: 'Annuler cette date ?', description: `Seule la date du ${dayTitle(item.date).toLowerCase()} est annulée ; les autres restent.`,
      confirmLabel: 'Annuler cette date', destructive: true,
    })
    if (!ok) return
    try { await cancelDate.mutateAsync({ id: item.eventId, date: item.date }); toast.success('Date annulée.'); onClose() } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-[95vw] sm:max-w-md">
        <DialogHeader>
          <span className={cn('w-fit rounded border px-2 py-0.5 text-xs font-medium', itemColor(item))}>{kindLabel}</span>
          <DialogTitle className="break-words">{item.title}</DialogTitle>
          <DialogDescription className="sr-only">Détail de l'élément du calendrier</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm">
          <li className="flex gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            {dayTitle(item.date)}{item.endDate ? ` → ${dayTitle(item.endDate).toLowerCase()}` : ''}</li>
          <li className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />{time || 'Toute la journée'}</li>
          {item.location && <li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />{item.location}</li>}
          <li className="flex gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />{item.audienceLabel}</li>
          {item.recurring && <li className="flex gap-2"><Repeat className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />Événement qui se répète</li>}
        </ul>
        {item.description && <p className="whitespace-pre-line break-words rounded-lg bg-muted/50 p-3 text-sm">{item.description}</p>}
        <DialogFooter className="flex-wrap gap-2">
          {item.kind === 'meeting' && canOpenMeetings && (
            <Button variant="outline" asChild><Link to="/attendance">Réunions & absences</Link></Button>
          )}
          {item.kind === 'event' && item.canEdit && (
            <>
              {item.recurring && (
                <Button variant="outline" onClick={cancelThis} disabled={cancelDate.isPending}><CalendarX className="mr-1.5 h-4 w-4" />Annuler cette date</Button>
              )}
              <Button variant="outline" className="text-destructive" onClick={remove} disabled={del.isPending}><Trash2 className="mr-1.5 h-4 w-4" />Supprimer</Button>
              <Button onClick={() => item.eventId && onEdit(item.eventId)}><Pencil className="mr-1.5 h-4 w-4" />Modifier</Button>
            </>
          )}
          {!(item.kind === 'event' && item.canEdit) && <Button variant="outline" onClick={onClose}>Fermer</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
