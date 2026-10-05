// « Envoi programmé des réponses » on the demandes review page: the CG picks a date + time (Lebanon time) and the
// server runs exactly the same « Envoyer les réponses » at that moment, then notifies the group managers.
// Warns while demandes are still undecided (the automatic send would then fail and send nothing).
import { ScheduledRunPanel } from '@/components/shared/scheduled-run-panel'
import { useResponsesSchedule, useSetResponsesSchedule } from '@/services/demande-admin-service'

export function DemandeResponsesSchedule({ undecided, pendingSend, canManage }: { undecided: number; pendingSend: number; canManage: boolean }) {
  const { data } = useResponsesSchedule()
  const save = useSetResponsesSchedule()
  return (
    <ScheduledRunPanel
      data={data}
      save={save}
      canManage={canManage}
      offer={pendingSend > 0}
      warning={undecided > 0
        ? `Il reste ${undecided} demande(s) à décider : si elles ne le sont pas d'ici là, l'envoi échouera et rien ne partira.`
        : undefined}
      texts={{
        scheduledTitle: 'Envoi programmé',
        scheduledBody: <p>Les réponses partiront automatiquement à ce moment-là, exactement comme avec « Envoyer les réponses ». Les décisions prises d'ici là seront incluses. Vous serez prévenu(e) du résultat dans les notifications.</p>,
        invite: "Vous pouvez programmer l'envoi des réponses à une date et une heure précises.",
        inviteButton: "Programmer l'envoi",
        doneTitle: 'Envoi automatique effectué',
        failedTitle: "L'envoi automatique a échoué",
        cancelTitle: "Annuler l'envoi programmé ?",
        cancelDescription: 'Les réponses ne partiront pas automatiquement. Vous pourrez toujours les envoyer à la main ou reprogrammer.',
        cancelButton: "Annuler l'envoi programmé",
        cancelledToast: 'Envoi programmé annulé',
        dialogTitle: "Programmer l'envoi des réponses",
        dialogDescription: "À ce moment-là (heure du Liban), les demandes acceptées deviennent des membres et chaque famille reçoit sa réponse à l'email qui a ouvert son compte — comme avec le bouton « Envoyer les réponses ».",
      }}
    />
  )
}
