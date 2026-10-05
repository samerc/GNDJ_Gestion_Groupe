// « Publication programmée du passage » on the Validation des passages page: the CG picks a date + time (Lebanon
// time) and the server runs exactly the same « Publier le passage » at that moment, then notifies the group managers.
// Same gates as the button: if a member still has no line or a unit hasn't finished, nothing is published.
// Pre-fills the day with « Date du passage » when it's still ahead.
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ScheduledRunPanel } from '@/components/shared/scheduled-run-panel'
import { usePassageFinalizeSchedule, useSetPassageFinalizeSchedule } from '@/services/passage-service'
import { useSettingValue } from '@/services/settings-service'

export function PassageFinalizeSchedule({ published, hasLines, missing, unitsNotFinished, canManage }: {
  /** The year's passage is already published. */
  published: boolean
  /** There are lines to publish (accepted or waiting). */
  hasLines: boolean
  missing: number
  unitsNotFinished: number
  canManage: boolean
}) {
  const { data } = usePassageFinalizeSchedule()
  const save = useSetPassageFinalizeSchedule()
  const passageDate = useSettingValue('passage.date')
  const qc = useQueryClient()

  // When the automatic publication has just run, refresh the whole page (summary, lines, units).
  const lastAt = data?.lastRun?.at
  const seen = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (seen.current !== undefined && lastAt && lastAt !== seen.current) qc.invalidateQueries({ queryKey: ['passages'] })
    seen.current = lastAt ?? ''
  }, [lastAt, qc])

  const today = new Date().toISOString().slice(0, 10)
  const blockers = [
    missing > 0 ? `${missing} membre(s) sans ligne de passage` : '',
    unitsNotFinished > 0 ? `${unitsNotFinished} unité(s) pas terminée(s)` : '',
  ].filter(Boolean)

  return (
    <ScheduledRunPanel
      data={data}
      save={save}
      canManage={canManage}
      offer={!published && hasLines}
      defaultDay={passageDate && passageDate >= today ? passageDate : null}
      defaultTime="08:00"
      warning={blockers.length > 0
        ? `Encore ${blockers.join(' et ')} : si ce n'est pas réglé d'ici là, la publication échouera et rien ne sera publié.`
        : undefined}
      texts={{
        scheduledTitle: 'Publication programmée',
        scheduledBody: <p>Le passage sera publié automatiquement à ce moment-là, exactement comme avec « Publier le passage » : les lignes encore en attente seront acceptées, les anciens postes terminés et les nouveaux créés, et chaque chef d'unité recevra ses nouveaux membres. Vous serez prévenu(e) du résultat dans les notifications.</p>,
        invite: 'Vous pouvez programmer la publication du passage à une date et une heure précises.',
        inviteButton: 'Programmer la publication',
        doneTitle: 'Publication automatique effectuée',
        failedTitle: 'La publication automatique a échoué',
        cancelTitle: 'Annuler la publication programmée ?',
        cancelDescription: 'Le passage ne sera pas publié automatiquement. Vous pourrez toujours le publier à la main ou reprogrammer.',
        cancelButton: 'Annuler la publication programmée',
        cancelledToast: 'Publication programmée annulée',
        dialogTitle: 'Programmer la publication du passage',
        dialogDescription: "À ce moment-là (heure du Liban), le passage est publié pour tout le groupe — comme avec le bouton « Publier le passage ». Il faut que chaque membre ait une ligne et que toutes les unités aient terminé, sinon rien n'est publié.",
      }}
    />
  )
}
