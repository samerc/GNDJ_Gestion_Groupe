// The two answers to a « Déjà membre ? » flag, shared by the demande drawer card and the « À vérifier » window:
//   • same person → not sent yet: the send updates that member; already sent: the new file is merged into it now.
//   • different person → a new member file is created as usual (or the pair is never flagged again after the send).
import { toast } from 'sonner'
import { confirmAsync } from '@/lib/confirm'
import { parseApiError } from '@/lib/error-utils'
import type { DemandeReview } from '@/services/demande-admin-service'
import { useConfirmMemberMatch, useRejectMemberMatch } from '@/services/demande-member-match-service'

// An active member already ACCEPTED into a unit he is not in: confirming keeps the acceptance — the send moves him
// (current youth post ends, new one in that unit), no email. Same rule as the server (ConfirmDemandeMemberMatch).
export function activeMove(d: DemandeReview): boolean {
  const m = d.memberMatch
  if (!m?.isActive || d.createdMemberId || d.responseSentAt || d.status !== 'Approved' || !d.decidedUnitName) return false
  return !(m.unitLabel ?? '').startsWith(d.decidedUnitName)
}

export function useMemberMatchActions() {
  const confirm = useConfirmMemberMatch()
  const reject = useRejectMemberMatch()

  const onSame = async (d: DemandeReview) => {
    const m = d.memberMatch
    if (!m) return
    // Once the demande was sent a new member file already exists, so « same person » means merging the two files now.
    const sent = !!d.createdMemberId
    // Still an active member and nothing sent: the demande is set aside (« Déjà membre »).
    const moves = activeMove(d)
    const aside = !sent && !d.responseSentAt && m.isActive && !moves
    const current = (m.unitLabel ?? '').replace(/\s*\(actif\)$/, '')
    const ok = await confirmAsync({
      title: 'Même personne ?',
      description: moves
        ? `${m.name} est membre actif (${current}) et accepté(e) en ${d.decidedUnitName}. À l'envoi des réponses, son poste en ${current} se termine et un nouveau commence en ${d.decidedUnitName} ; sa fiche est mise à jour avec la demande. Pas de nouvelle fiche, même identifiant, aucun email à la famille.`
        : aside
        ? `${m.name} est membre actif du groupe : la demande sera mise de côté (« Déjà membre »). À l'envoi des réponses, sa fiche sera seulement mise à jour avec les informations de la demande — pas de changement de poste, aucun email à la famille.`
        : sent
        ? `La fiche créée par l'inscription sera fusionnée dans la fiche de ${m.name}${m.cardNumber ? ` (${m.cardNumber})` : ''} — les informations de la demande l'emportent, l'identifiant de la fiche existante est gardé — puis l'email d'accès sera envoyé à la famille.`
        : `À l'envoi des réponses, la fiche de ${m.name}${m.cardNumber ? ` (${m.cardNumber})` : ''} sera mise à jour avec la demande au lieu de créer une nouvelle fiche. L'email d'acceptation donnera son identifiant actuel.`,
      confirmLabel: sent ? 'Fusionner' : aside ? 'Oui, mettre de côté' : moves ? "Oui, changer d'unité" : 'Oui, même personne',
    })
    if (!ok) return
    try {
      const r = await confirm.mutateAsync({ demandeId: d.id, memberId: m.memberId })
      if (r.merged) {
        if (r.accessSent) toast.success('Fiches fusionnées — email d\'accès envoyé')
        else toast.warning(`Fiches fusionnées. ${r.note ?? ''}`)
      } else if (r.alreadyMember) toast.success("Mise de côté : déjà membre — fiche mise à jour à l'envoi, aucun email")
      else toast.success('Noté : la fiche existante sera utilisée')
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
