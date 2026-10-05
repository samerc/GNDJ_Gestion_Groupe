// A one-off action the CG can schedule for a date + time (Lebanon time) instead of pressing the button —
// « Envoyer les réponses » (demandes) and « Publier le passage ». The server runs exactly the same action at that
// moment (background job, checked every minute) and notifies the group managers. Shows the scheduled moment
// (Modifier / Annuler), an optional warning (e.g. things still missing that would make the run fail), the result of
// the last automatic run, or — when nothing is scheduled — an invitation to schedule.
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { CalendarClock, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Callout } from '@/components/shared/callout'
import { DateInput } from '@/components/shared/date-input'
import { RequiredLabel } from '@/components/shared/required-label'
import { parseApiError } from '@/lib/error-utils'
import { confirmAsync } from '@/lib/confirm'
import { formatDateLong } from '@/lib/utils'

export interface ScheduledRunStatus { at: string; scheduledFor: string | null; ok: boolean; message: string }
export interface ScheduledRun { scheduledAt: string | null; lastRun: ScheduledRunStatus | null }

// "2026-10-09T18:00" → « vendredi 9 octobre 2026 à 18:00 »
function describeSchedule(at: string) {
  const [day, time] = at.split('T')
  const weekday = new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long' })
  return `${weekday} ${formatDateLong(day)} à ${time}`
}

export interface ScheduledRunTexts {
  /** e.g. « Envoi programmé » / « Publication programmée » — followed by « le <date> ». */
  scheduledTitle: string
  /** Body under the scheduled banner. */
  scheduledBody: ReactNode
  /** Invitation shown when nothing is scheduled. */
  invite: string
  inviteButton: string
  doneTitle: string
  failedTitle: string
  cancelTitle: string
  cancelDescription: string
  cancelButton: string
  /** Toast after cancelling. */
  cancelledToast: string
  dialogTitle: string
  dialogDescription: string
}

export function ScheduledRunPanel({
  data, save, canManage, offer, warning, texts, defaultDay, defaultTime = '18:00',
}: {
  data: ScheduledRun | undefined
  /** Saves the moment ("yyyy-MM-ddTHH:mm") or cancels with null. */
  save: { mutateAsync: (at: string | null) => Promise<unknown>; isPending: boolean }
  canManage: boolean
  /** Whether scheduling makes sense right now (there is something to run). */
  offer: boolean
  /** Shown inside the scheduled banner (e.g. what's still missing). */
  warning?: ReactNode
  texts: ScheduledRunTexts
  /** Pre-filled day (yyyy-MM-dd) when scheduling for the first time. */
  defaultDay?: string | null
  defaultTime?: string
}) {
  const [open, setOpen] = useState(false)
  const [day, setDay] = useState<string | null>(null)
  const [time, setTime] = useState(defaultTime)
  const [error, setError] = useState('')

  const scheduled = data?.scheduledAt ?? null
  const last = data?.lastRun ?? null
  // Nothing to show: nothing to run, nothing scheduled, no past automatic run.
  if (!scheduled && !last && !offer) return null

  const openDialog = () => {
    setDay(scheduled ? scheduled.slice(0, 10) : (defaultDay ?? null))
    setTime(scheduled ? scheduled.slice(11, 16) : defaultTime)
    setError('')
    setOpen(true)
  }
  const submit = async () => {
    if (!day || !/^\d{2}:\d{2}$/.test(time)) { setError('Choisissez une date et une heure.'); return }
    try {
      await save.mutateAsync(`${day}T${time}`)
      toast.success(`${texts.scheduledTitle} le ${describeSchedule(`${day}T${time}`)}`)
      setOpen(false)
    } catch (e) { setError(parseApiError(e)) }
  }
  const cancel = async () => {
    if (!(await confirmAsync({ title: texts.cancelTitle, description: texts.cancelDescription, confirmLabel: texts.cancelButton, destructive: true }))) return
    try { await save.mutateAsync(null); toast.success(texts.cancelledToast) }
    catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <>
      {scheduled ? (
        <Callout tone="info" icon={CalendarClock} title={`${texts.scheduledTitle} le ${describeSchedule(scheduled)} (heure du Liban)`}>
          {texts.scheduledBody}
          {warning && <div className="mt-1 font-medium text-warning">{warning}</div>}
          {canManage && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={openDialog}>Modifier</Button>
              <Button size="sm" variant="outline" className="text-destructive" onClick={cancel} disabled={save.isPending}>{texts.cancelButton}</Button>
            </div>
          )}
        </Callout>
      ) : (
        <>
          {last && (
            <Callout tone={last.ok ? 'success' : 'danger'} icon={last.ok ? CheckCircle2 : XCircle}
              title={last.ok ? texts.doneTitle : texts.failedTitle}>
              {describeSchedule(last.at)} — {last.message}
            </Callout>
          )}
          {canManage && offer && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4" />
              {texts.invite}
              <Button size="sm" variant="outline" onClick={openDialog}>{texts.inviteButton}</Button>
            </div>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{texts.dialogTitle}</DialogTitle>
            <DialogDescription>{texts.dialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error && <Callout tone="danger">{error}</Callout>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <RequiredLabel required>Date</RequiredLabel>
                <DateInput value={day} onChange={setDay} />
              </div>
              <div className="space-y-2">
                <RequiredLabel required>Heure</RequiredLabel>
                <Input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={submit} disabled={save.isPending}>{save.isPending ? 'Enregistrement…' : 'Programmer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
