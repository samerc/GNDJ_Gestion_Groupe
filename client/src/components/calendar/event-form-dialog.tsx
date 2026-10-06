// Create / edit a calendar event. The « Pour qui » choices come from the server (GET /calendar/options): the Chef de
// Groupe team picks any audience; a chef d'unité only « Une unité » with their own unit(s). Editing loads the full
// event (repetition, reminder, publication). A repeating event is edited as a whole series, or — with occurrenceDate —
// only that one date (« Modifier cette date seulement »: the copy doesn't repeat).
import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DateInput } from '@/components/shared/date-input'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import {
  AUDIENCE_LABELS, useCalendarEvent, useCalendarOptions, useCreateCalendarEvent, useEditCalendarDate, useUpdateCalendarEvent,
  type CalendarAudience, type CalendarEventInput, type CalendarRecurrence,
} from '@/services/calendar-service'
import { REMINDER_OPTIONS } from './calendar-utils'

const blank = (date: string, audience: CalendarAudience, unitId: string | null): CalendarEventInput => ({
  title: '', description: null, location: null, startDate: date, endDate: null, startTime: null, endTime: null,
  audience, unitTypeId: null, unitId, recurrence: 'None', recurrenceInterval: 1, recurrenceUntil: null,
  reminderMinutes: null, publishOnSite: false,
})

// The series' details moved onto one of its dates (same length for a multi-day event), not repeating.
function onlyThisDate(e: CalendarEventInput, date: string): CalendarEventInput {
  const days = e.endDate ? Math.round((Date.parse(e.endDate) - Date.parse(e.startDate)) / 86_400_000) : 0
  const end = days > 0 ? new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10) : null
  return { ...e, startDate: date, endDate: end, recurrence: 'None', recurrenceInterval: 1, recurrenceUntil: null, publishOnSite: false }
}

export function EventFormDialog({ open, onOpenChange, eventId, defaultDate, occurrenceDate = null }: {
  open: boolean; onOpenChange: (o: boolean) => void; eventId: string | null; defaultDate: string; occurrenceDate?: string | null
}) {
  const { data: options } = useCalendarOptions()
  const { data: existing, isLoading } = useCalendarEvent(open ? eventId : null)
  if (!open) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[95vw] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{occurrenceDate ? 'Modifier cette date seulement' : eventId ? "Modifier l'événement" : 'Nouvel événement'}</DialogTitle>
          <DialogDescription>{occurrenceDate
            ? "Les changements ne concernent que cette date ; les autres dates de l'événement restent comme elles sont."
            : 'Il apparaît dans le calendrier des personnes concernées.'}</DialogDescription>
        </DialogHeader>
        {(eventId && (isLoading || !existing)) || !options ? <LoadingSpinner /> : (
          <EventForm key={`${eventId ?? 'new'}:${occurrenceDate ?? ''}`} eventId={eventId} occurrenceDate={occurrenceDate}
            options={options} onDone={() => onOpenChange(false)}
            initial={existing ? (occurrenceDate ? onlyThisDate(existing, occurrenceDate) : existing) : blank(defaultDate, options.audiences.includes('Group') ? 'Group' : 'Unit',
              options.audiences.includes('Group') ? null : options.units[0]?.id ?? null)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EventForm({ eventId, occurrenceDate, initial, options, onDone }: {
  eventId: string | null; occurrenceDate: string | null; initial: CalendarEventInput; options: NonNullable<ReturnType<typeof useCalendarOptions>['data']>; onDone: () => void
}) {
  const [f, setF] = useState<CalendarEventInput>(() => ({
    ...initial,
    startTime: initial.startTime?.slice(0, 5) ?? null,
    endTime: initial.endTime?.slice(0, 5) ?? null,
  }))
  const [multiDay, setMultiDay] = useState(!!initial.endDate)
  const create = useCreateCalendarEvent()
  const update = useUpdateCalendarEvent()
  const editDate = useEditCalendarDate()
  const set = <K extends keyof CalendarEventInput>(k: K, v: CalendarEventInput[K]) => setF((x) => ({ ...x, [k]: v }))
  const canPublish = ['Group', 'Branch', 'Unit'].includes(f.audience) && f.recurrence === 'None'
  const busy = create.isPending || update.isPending || editDate.isPending

  const save = async () => {
    if (!f.title.trim()) { toast.error('Le titre est requis.'); return }
    if (!f.startDate) { toast.error('La date est requise.'); return }
    const data: CalendarEventInput = {
      ...f,
      endDate: multiDay ? f.endDate : null,
      startTime: f.startTime || null,
      endTime: f.startTime ? f.endTime || null : null,
      publishOnSite: canPublish && f.publishOnSite,
    }
    try {
      if (eventId && occurrenceDate) await editDate.mutateAsync({ id: eventId, date: occurrenceDate, data })
      else if (eventId) await update.mutateAsync({ id: eventId, data })
      else await create.mutateAsync(data)
      toast.success(occurrenceDate ? 'Date modifiée.' : eventId ? 'Événement modifié.' : 'Événement ajouté au calendrier.')
      onDone()
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="ev-title">Titre</Label>
        <Input id="ev-title" value={f.title} maxLength={200} onChange={(e) => set('title', e.target.value)} placeholder="Ex. : Messe de rentrée" />
      </div>

      <div className="space-y-1.5">
        <Label>Pour qui</Label>
        <Select value={f.audience} onValueChange={(v) => setF((x) => ({ ...x, audience: v as CalendarAudience, unitId: v === 'Unit' ? x.unitId ?? options.units[0]?.id ?? null : null, unitTypeId: null }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{options.audiences.map((a) => <SelectItem key={a} value={a}>{AUDIENCE_LABELS[a]}</SelectItem>)}</SelectContent>
        </Select>
        {f.audience === 'Branch' && (
          <Select value={f.unitTypeId ?? ''} onValueChange={(v) => set('unitTypeId', v)}>
            <SelectTrigger><SelectValue placeholder="Choisir la branche" /></SelectTrigger>
            <SelectContent>{options.unitTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {f.audience === 'Unit' && (
          <Select value={f.unitId ?? ''} onValueChange={(v) => set('unitId', v)}>
            <SelectTrigger><SelectValue placeholder="Choisir l'unité" /></SelectTrigger>
            <SelectContent>{options.units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{multiDay ? 'Du' : 'Date'}</Label>
          <DateInput value={f.startDate} onChange={(v) => set('startDate', v ?? '')} />
        </div>
        {multiDay && (
          <div className="space-y-1.5">
            <Label>Au</Label>
            <DateInput value={f.endDate} onChange={(v) => set('endDate', v)} />
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={multiDay} onCheckedChange={setMultiDay} aria-label="Sur plusieurs jours" />Sur plusieurs jours
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ev-start">Heure de début</Label>
          <Input id="ev-start" type="time" value={f.startTime ?? ''} onChange={(e) => set('startTime', e.target.value || null)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-end">Heure de fin</Label>
          <Input id="ev-end" type="time" value={f.endTime ?? ''} disabled={!f.startTime} onChange={(e) => set('endTime', e.target.value || null)} />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Sans heure, l'événement dure toute la journée.</p>

      <div className="space-y-1.5">
        <Label htmlFor="ev-loc">Lieu</Label>
        <Input id="ev-loc" value={f.location ?? ''} maxLength={200} onChange={(e) => set('location', e.target.value || null)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ev-desc">Description</Label>
        <Textarea id="ev-desc" rows={3} value={f.description ?? ''} maxLength={4000} onChange={(e) => set('description', e.target.value || null)} />
      </div>

      {!occurrenceDate && <div className="space-y-1.5">
        <Label>Répétition</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select value={f.recurrence === 'None' ? 'None' : `${f.recurrence}:${f.recurrenceInterval}`}
            onValueChange={(v) => {
              const [r, n] = v.split(':')
              setF((x) => ({ ...x, recurrence: r as CalendarRecurrence, recurrenceInterval: Number(n ?? 1), publishOnSite: r === 'None' ? x.publishOnSite : false }))
            }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="None">Ne se répète pas</SelectItem>
              <SelectItem value="Weekly:1">Chaque semaine</SelectItem>
              <SelectItem value="Weekly:2">Toutes les 2 semaines</SelectItem>
              <SelectItem value="Monthly:1">Chaque mois</SelectItem>
            </SelectContent>
          </Select>
          {f.recurrence !== 'None' && (
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-muted-foreground">jusqu'au</span>
              <DateInput value={f.recurrenceUntil} onChange={(v) => set('recurrenceUntil', v)} />
            </div>
          )}
        </div>
        {f.recurrence !== 'None' && <p className="text-xs text-muted-foreground">Sans date de fin, il se répète jusqu'à ce que vous le supprimiez.</p>}
      </div>}

      <div className="space-y-1.5">
        <Label>Rappel</Label>
        <Select value={f.reminderMinutes == null ? 'none' : String(f.reminderMinutes)} onValueChange={(v) => set('reminderMinutes', v === 'none' ? null : Number(v))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{REMINDER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Une notification est envoyée à toutes les personnes concernées.{!f.startTime && ' Pour un événement sans heure, le rappel compte à partir de 8h00.'}</p>
      </div>

      {canPublish && (
        <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <Switch checked={f.publishOnSite} onCheckedChange={(v) => set('publishOnSite', v)} aria-label="Publier aussi sur le site" />
          <span>Publier aussi sur le site<span className="block text-xs text-muted-foreground">L'événement apparaît dans l'agenda public du site (titre, date, lieu, description).</span></span>
        </label>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={busy}>Annuler</Button>
        <Button onClick={save} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Button>
      </DialogFooter>
    </div>
  )
}
