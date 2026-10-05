// « Ma rentrée » — the member's to-do for the year, at the top of Ma fiche. One place that says what is left:
// confirm the family's contacts, send the documents, pay the cotisation (+ install the app, optional). Each line
// ticks itself off from the real data (GET /my-profile/todo). While something is left the card is open; once
// everything is done it shrinks to one green line (« Tout est en ordre »), and it opens again by itself if
// something new comes up (a document refused or expiring, a new year's campaign).
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { CheckCircle2, Circle, Clock, AlertTriangle, ChevronDown, ChevronUp, Smartphone, ShieldAlert, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/shared/callout'
import { useMyTodo } from '@/services/my-profile-service'
import { useContactReviewStore } from '@/stores/contact-review-store'
import { useInstallGuide } from '@/hooks/use-install-guide'
import { usePwaEnabled } from '@/hooks/use-pwa-audience'
import { PwaInstallDialog } from '@/components/shared/pwa-install'
import { promptInstall } from '@/lib/pwa'
import { formatDateLong, cn } from '@/lib/utils'

type State = 'done' | 'waiting' | 'todo' | 'problem'

const ICON: Record<State, ReactNode> = {
  done: <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />,
  waiting: <Clock className="h-5 w-5 text-amber-500" />,
  todo: <Circle className="h-5 w-5 text-muted-foreground" />,
  problem: <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />,
}

function Step({ state, title, text, action, optional }: { state: State; title: string; text: ReactNode; action?: ReactNode; optional?: boolean }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5 shrink-0">{ICON[state]}</span>
      <div className="min-w-0 flex-1">
        <p className={cn('font-medium', state === 'done' && 'text-muted-foreground')}>
          {title}{optional && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(facultatif)</span>}
        </p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </li>
  )
}

export function MyRentree() {
  const { data: todo } = useMyTodo()
  const reopenContacts = useContactReviewStore((s) => s.reopen)
  const guide = useInstallGuide()
  const pwaEnabled = usePwaEnabled()
  const [showDetail, setShowDetail] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)
  if (!todo) return null

  // ── Documents ──
  const docsToRedo = todo.docsMissing + todo.docsRejected
  const docsState: State = todo.docsTotal === 0 ? 'done'
    : todo.docsRejected > 0 ? 'problem'
      : todo.docsMissing > 0 ? 'todo'
        : todo.docsPending > 0 ? 'waiting' : 'done'
  const uploadClosed = !todo.uploadOpen && docsToRedo > 0
  const docsText = todo.docsTotal === 0 ? 'Aucun document demandé.'
    : todo.docsRejected > 0
      ? `${todo.docsRejected} document(s) refusé(s) à renvoyer` + (todo.docsMissing > 0 ? `, ${todo.docsMissing} à envoyer` : '') + '.'
      : todo.docsMissing > 0
        ? `${todo.docsMissing} document(s) à envoyer sur ${todo.docsTotal}.`
        : todo.docsPending > 0
          ? `Tout est envoyé. Votre chef d'unité vérifie ${todo.docsPending > 1 ? `vos ${todo.docsPending} documents` : 'votre document'}.`
          : 'Tous vos documents sont acceptés.'
  const docsWhen = uploadClosed
    ? (todo.uploadReopensOn ? ` L'envoi rouvrira le ${formatDateLong(todo.uploadReopensOn)}.` : " L'envoi est fermé pour le moment : contactez votre chef d'unité.")
    : (docsToRedo > 0 && todo.uploadClosesOn ? ` Date limite : ${formatDateLong(todo.uploadClosesOn)}.` : '')

  // ── Cotisation ──
  const cotis = todo.cotisationStatus
  const cotisState: State = cotis === 'Paid' || cotis === 'Exempt' ? 'done' : cotis === 'Partial' ? 'waiting' : 'todo'
  const cotisText = cotis === 'Paid' ? 'Payée. Merci !'
    : cotis === 'Exempt' ? 'Rien à payer cette année.'
      : cotis === 'Partial' ? `Payée en partie (${todo.cotisationPercent} %). Le reste est à régler auprès de votre chef d'unité.`
        : "À régler auprès de votre chef d'unité."

  // ── App (optional, never blocks « Tout est en ordre ») ──
  const showApp = pwaEnabled && guide.supported
  const appDone = todo.appInstalled || guide.installed

  const required: State[] = [todo.contactsDone ? 'done' : 'todo', docsState, ...(cotis ? [cotisState] : [])]
  // « Waiting » = nothing left for the member to do (the chef is checking) → counts as done for the card.
  const left = required.filter((s) => s === 'todo' || s === 'problem').length
  const allDone = left === 0
  const open = !allDone || showDetail
  const year = todo.scoutYear ? ` ${todo.scoutYear}` : ''

  return (
    <div className="space-y-3">
      {todo.onHold && (
        <Callout tone="danger" icon={ShieldAlert} title="Votre inscription est suspendue">
          Votre dossier n'était pas complet à la date limite. Contactez votre chef d'unité pour le régulariser.
        </Callout>
      )}

      <div className={cn('rounded-xl border bg-card shadow-card', allDone && !showDetail && 'border-green-200 dark:border-green-900')}>
        <button type="button" onClick={() => allDone && setShowDetail((v) => !v)}
          className={cn('flex w-full items-center gap-3 p-4 text-left', allDone ? 'cursor-pointer' : 'cursor-default')}>
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            allDone ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300' : 'bg-primary/10 text-primary')}>
            {allDone ? <CheckCircle2 className="h-5 w-5" /> : <ClipboardCheck className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Ma rentrée{year}</p>
            <p className="text-sm text-muted-foreground">
              {allDone ? 'Tout est en ordre. Merci !' : `Encore ${left} étape${left > 1 ? 's' : ''} à faire`}
            </p>
          </div>
          {allDone && (showDetail ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />)}
        </button>

        {open && (
          <ul className="divide-y border-t px-4">
            <Step
              state={todo.contactsDone ? 'done' : 'todo'}
              title="Vérifier les coordonnées de la famille"
              text={todo.contactsDone ? 'Confirmées.' : "Vérifiez les emails et téléphones, et choisissez ceux où l'on doit vous joindre."}
              action={!todo.contactsDone && <Button size="sm" onClick={reopenContacts}>Vérifier</Button>}
            />
            <Step
              state={docsState}
              title="Envoyer mes documents"
              text={<>{docsText}{docsWhen}</>}
              action={todo.docsTotal > 0 && (
                <Button size="sm" variant={docsToRedo > 0 && todo.uploadOpen ? 'default' : 'outline'} asChild>
                  <Link to="/my-documents">{docsToRedo > 0 && todo.uploadOpen ? 'Envoyer' : 'Voir'}</Link>
                </Button>
              )}
            />
            {cotis && (
              <Step state={cotisState} title="Cotisation" text={cotisText}
                action={<Button size="sm" variant="outline" asChild><Link to="/my-documents">Voir</Link></Button>} />
            )}
            {showApp && (
              <Step optional state={appDone ? 'done' : 'todo'} title="Installer l'application"
                text={appDone ? 'Installée.' : 'Pour recevoir les notifications et ouvrir le site en un geste depuis votre téléphone.'}
                action={!appDone && (
                  <Button size="sm" variant="outline" onClick={() => (guide.canPrompt ? void promptInstall() : setInstallOpen(true))}>
                    <Smartphone className="mr-1.5 h-4 w-4" />Installer
                  </Button>
                )}
              />
            )}
          </ul>
        )}
      </div>
      <PwaInstallDialog open={installOpen} onOpenChange={setInstallOpen} />
    </div>
  )
}
