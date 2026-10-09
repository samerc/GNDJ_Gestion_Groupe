// What an item of the calendar is: date, time, place, for whom, description. Editors of an event get Modifier,
// Supprimer (the whole series) and — for a repeating event — « Modifier cette date » / « Annuler cette date » (only
// this occurrence). An important date (from Paramètres) can get a start / end time from here (CG team); its date is
// changed in Paramètres.
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { CalendarDays, Clock, MapPin, Users, Repeat, Pencil, Trash2, CalendarX } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { confirmAsync } from '@/lib/confirm'
import { parseApiError } from '@/lib/error-utils'
import { useCancelCalendarDate, useDeleteCalendarEvent, useSetImportantDateTime, type CalendarItem } from '@/services/calendar-service'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { dayTitle, itemColor, timeLabel } from './calendar-utils'
import { cn } from '@/lib/utils'

// item = the clicked calendar entry (null = closed); onEdit / onEditDate open the event form for the series / one date.
export function EventDetailDialog({ item, onClose, onEdit, onEditDate, canOpenMeetings }: {
  item: CalendarItem | null; onClose: () => void; onEdit: (eventId: string) => void
  onEditDate: (eventId: string, date: string) => void; canOpenMeetings: boolean
}) {
  const del = useDeleteCalendarEvent()
  const cancelDate = useCancelCalendarDate()
  const setTime = useSetImportantDateTime()
  // Time editor of an important date: null = closed, else the times being typed (HH:mm, '' = none).
  const [timeEdit, setTimeEdit] = useState<{ start: string; end: string } | null>(null)
  if (!item) return null
  const isDate = item.kind === 'date'

  const saveTime = async () => {
    if (!timeEdit) return
    if (timeEdit.start && timeEdit.end && timeEdit.end <= timeEdit.start) { toast.error("L'heure de fin doit être après l'heure de début."); return }
    try {
      await setTime.mutateAsync({ key: item.id.replace(/^d:/, ''), startTime: timeEdit.start || null, endTime: timeEdit.start ? timeEdit.end || null : null })
      toast.success('Heure enregistrée.'); setTimeEdit(null); onClose()
    } catch (e) { toast.error(parseApiError(e)) }
  }
  const time = timeLabel(item)
  // Three kinds of items: unit réunions, important dates (from settings) and calendar events.
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
    <Dialog open onOpenChange={(o) => { if (!o) { setTimeEdit(null); onClose() } }}>
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
        {isDate && timeEdit && (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="d-start">Heure de début</Label>
                <Input id="d-start" type="time" value={timeEdit.start} onChange={(e) => setTimeEdit({ ...timeEdit, start: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d-end">Heure de fin</Label>
                <Input id="d-end" type="time" value={timeEdit.end} disabled={!timeEdit.start} onChange={(e) => setTimeEdit({ ...timeEdit, end: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Sans heure de début, la date reste « toute la journée ». La date se change dans Paramètres.</p>
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2">
          {/* Réunions are managed on the attendance page, not here. */}
          {item.kind === 'meeting' && canOpenMeetings && (
            <Button variant="outline" asChild><Link to="/attendance">Réunions & absences</Link></Button>
          )}
          {/* Only calendar events are editable, and only by their editors (the server sets canEdit). */}
          {item.kind === 'event' && item.canEdit && (
            <>
              {item.recurring && (
                <>
                  <Button variant="outline" onClick={cancelThis} disabled={cancelDate.isPending}><CalendarX className="mr-1.5 h-4 w-4" />Annuler cette date</Button>
                  <Button variant="outline" onClick={() => item.eventId && onEditDate(item.eventId, item.date)}><Pencil className="mr-1.5 h-4 w-4" />Modifier cette date</Button>
                </>
              )}
              <Button variant="outline" className="text-destructive" onClick={remove} disabled={del.isPending}><Trash2 className="mr-1.5 h-4 w-4" />{item.recurring ? 'Supprimer tout' : 'Supprimer'}</Button>
              <Button onClick={() => item.eventId && onEdit(item.eventId)}><Pencil className="mr-1.5 h-4 w-4" />{item.recurring ? 'Modifier tout' : 'Modifier'}</Button>
            </>
          )}
          {/* Important date: the CG team sets its time here (the date itself is in Paramètres). */}
          {isDate && item.canEdit && (timeEdit ? (
            <>
              <Button variant="outline" onClick={() => setTimeEdit(null)}>Annuler</Button>
              <Button onClick={saveTime} disabled={setTime.isPending}>Enregistrer</Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setTimeEdit({ start: item.startTime?.slice(0, 5) ?? '', end: item.endTime?.slice(0, 5) ?? '' })}>
              <Clock className="mr-1.5 h-4 w-4" />Modifier l'heure
            </Button>
          ))}
          {!(item.kind === 'event' && item.canEdit) && !timeEdit && <Button variant="outline" onClick={onClose}>Fermer</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
