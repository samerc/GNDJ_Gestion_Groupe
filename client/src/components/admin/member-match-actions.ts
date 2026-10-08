// The two answers to a « Déjà membre ? » flag, shared by the demande drawer card and the « À vérifier » window:
//   • same person → not sent yet: the send updates that member; already sent: the new file is merged into it now.
//   • different person → a new member file is created as usual (or the pair is never flagged again after the send).
import { toast } from 'sonner'
import { confirmAsync } from '@/lib/confirm'
import { parseApiError } from '@/lib/error-utils'
import type { DemandeReview } from '@/services/demande-admin-service'
import { useConfirmMemberMatch, useRejectMemberMatch } from '@/services/demande-member-match-service'

export function useMemberMatchActions() {
  const confirm = useConfirmMemberMatch()
  const reject = useRejectMemberMatch()

  const onSame = async (d: DemandeReview) => {
    const m = d.memberMatch
    if (!m) return
    // Once the demande was sent a new member file already exists, so « same person » means merging the two files now.
    const sent = !!d.createdMemberId
    const ok = await confirmAsync({
      title: 'Même personne ?',
      description: sent
        ? `La fiche créée par l'inscription sera fusionnée dans la fiche de ${m.name}${m.cardNumber ? ` (${m.cardNumber})` : ''} — les informations de la demande l'emportent, l'identifiant de la fiche existante est gardé — puis l'email d'accès sera envoyé à la famille.`
        : `À l'envoi des réponses, la fiche de ${m.name}${m.cardNumber ? ` (${m.cardNumber})` : ''} sera mise à jour avec la demande au lieu de créer une nouvelle fiche. L'email d'acceptation donnera son identifiant actuel.`,
      confirmLabel: sent ? 'Fusionner' : 'Oui, même personne',
    })
    if (!ok) return
    try {
      const r = await confirm.mutateAsync({ demandeId: d.id, memberId: m.memberId })
      if (r.merged) {
        if (r.accessSent) toast.success('Fiches fusionnées — email d\'accès envoyé')
        else toast.warning(`Fiches fusionnées. ${r.note ?? ''}`)
      } else toast.success('Noté : la fiche existante sera utilisée')
    } catch (e) { toast.error(parseApiError(e)) }
  }

  const onDifferent = async (d: DemandeReview) => {
    const m = d.memberMatch
    if (!m) return
    try {
      await reject.mutateAsync({ demandeId: d.id, memberId: m.memberId })
      toast.success(d.createdMemberId ? 'Noté : ce sont deux personnes différentes' : 'Noté : une nouvelle fiche sera créée')
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return { onSame, onDifferent, busy: confirm.isPending || reject.isPending }
}
