// « Envoi programmé des réponses » on the demandes review page: the CG picks a date + time (Lebanon time) and the
// server runs exactly the same « Envoyer les réponses » at that moment (background job, checked every minute), then
// notifies the group managers. Shows the scheduled moment (Modifier / Annuler), a warning while demandes are still
// undecided (the automatic send would then fail and send nothing), and the result of the last automatic run.
import { useState } from 'react'
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
import { useResponsesSchedule, useSetResponsesSchedule } from '@/services/demande-admin-service'

// "2026-10-09T18:00" → « vendredi 9 octobre 2026 à 18:00 »
function describe(at: string) {
  const [day, time] = at.split('T')
  const weekday = new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long' })
  return `${weekday} ${formatDateLong(day)} à ${time}`
}

export function DemandeResponsesSchedule({ undecided, pendingSend, canManage }: { undecided: number; pendingSend: number; canManage: boolean }) {
  const { data } = useResponsesSchedule()
  const save = useSetResponsesSchedule()
  const [open, setOpen] = useState(false)
  const [day, setDay] = useState<string | null>(null)
  const [time, setTime] = useState('18:00')
  const [error, setError] = useState('')

  const scheduled = data?.scheduledAt ?? null
  const last = data?.lastRun ?? null
  // Nothing to show: no decision waiting, nothing scheduled, no past automatic run.
  if (!scheduled && !last && pendingSend === 0) return null

  const openDialog = () => {
    setDay(scheduled ? scheduled.slice(0, 10) : null)
    setTime(scheduled ? scheduled.slice(11, 16) : '18:00')
    setError('')
    setOpen(true)
  }
  const submit = async () => {
    if (!day || !/^\d{2}:\d{2}$/.test(time)) { setError('Choisissez une date et une heure.'); return }
    try {
      await save.mutateAsync(`${day}T${time}`)
      toast.success(`Envoi programmé le ${describe(`${day}T${time}`)}`)
      setOpen(false)
    } catch (e) { setError(parseApiError(e)) }
  }
  const cancel = async () => {
    if (!(await confirmAsync({ title: "Annuler l'envoi programmé ?", description: 'Les réponses ne partiront pas automatiquement. Vous pourrez toujours les envoyer à la main ou reprogrammer.', confirmLabel: "Annuler l'envoi", destructive: true }))) return
    try { await save.mutateAsync(null); toast.success('Envoi programmé annulé') }
    catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <>
      {scheduled ? (
        <Callout tone="info" icon={CalendarClock} title={`Envoi programmé le ${describe(scheduled)} (heure du Liban)`}>
          <p>Les réponses partiront automatiquement à ce moment-là, exactement comme avec « Envoyer les réponses ». Les décisions prises d'ici là seront incluses. Vous serez prévenu(e) du résultat dans les notifications.</p>
          {undecided > 0 && (
            <p className="mt-1 font-medium text-warning">Il reste {undecided} demande(s) à décider : si elles ne le sont pas d'ici là, l'envoi échouera et rien ne partira.</p>
          )}
          {canManage && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={openDialog}>Modifier</Button>
              <Button size="sm" variant="outline" className="text-destructive" onClick={cancel} disabled={save.isPending}>Annuler l'envoi programmé</Button>
            </div>
          )}
        </Callout>
      ) : (
        <>
          {last && (
            <Callout tone={last.ok ? 'success' : 'danger'} icon={last.ok ? CheckCircle2 : XCircle}
              title={last.ok ? 'Envoi automatique effectué' : "L'envoi automatique a échoué"}>
              {describe(last.at)} — {last.message}
            </Callout>
          )}
          {canManage && pendingSend > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4" />
              Vous pouvez programmer l'envoi des réponses à une date et une heure précises.
              <Button size="sm" variant="outline" onClick={openDialog}>Programmer l'envoi</Button>
            </div>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Programmer l'envoi des réponses</DialogTitle>
            <DialogDescription>À ce moment-là (heure du Liban), les demandes acceptées deviennent des membres et toutes les familles reçoivent leur réponse — comme avec le bouton « Envoyer les réponses ».</DialogDescription>
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
