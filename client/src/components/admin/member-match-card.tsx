// « Déjà membre ? » card in the demande drawer: the server flagged that this child looks like a member already in the
// group. The CG answers once:
//   • « Oui, même personne » → not sent yet: the send updates that member (identifiant kept, demande data wins);
//     already sent: the new file is merged into it now and the access email goes to the family.
//   • « Non, personne différente » → a new member file is created as usual.
import { Link } from 'react-router'
import { CheckCircle2, UserCheck, UserX, Users2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/shared/callout'
import { parseApiError } from '@/lib/error-utils'
import { formatDate } from '@/lib/utils'
import type { DemandeReview, MemberMatch } from '@/services/demande-admin-service'
import { useClearMemberMatch } from '@/services/demande-member-match-service'
import { useMemberMatchActions } from './member-match-actions'

// The matched member: name (opens the fiche in a new tab), matricule, birth date, unit and current identifiant.
function MatchDetails({ m }: { m: MemberMatch }) {
  return (
    <div className="mt-1 space-y-0.5">
      <p>
        <Link to={`/members/${m.memberId}`} target="_blank" className="font-semibold underline underline-offset-2">{m.name}</Link>
        {m.cardNumber ? ` · ${m.cardNumber}` : ''}{m.dateOfBirth ? ` · né(e) le ${formatDate(m.dateOfBirth)}` : ''}
      </p>
      {m.unitLabel && <p>{m.unitLabel}</p>}
      {m.username && <p>Identifiant : <span className="font-mono">{m.username}</span></p>}
    </div>
  )
}

export function MemberMatchCard({ d }: { d: DemandeReview }) {
  const actions = useMemberMatchActions()
  const clear = useClearMemberMatch()
  const m = d.memberMatch
  if (!m) return null
  const busy = actions.busy || clear.isPending
  // Once the demande was sent a new member file already exists, so « same person » means merging the two files now.
  const sent = !!d.createdMemberId

  // Already merged (answered after the send): nothing left to decide.
  if (m.merged) {
    return (
      <Callout tone="success" icon={CheckCircle2} title="Fiche existante utilisée">
        <MatchDetails m={m} />
      </Callout>
    )
  }

  // Confirmed before the send: the send will reuse this file; « Annuler » clears the answer.
  if (m.status === 'Confirmed') {
    return (
      <Callout tone="success" icon={UserCheck} title="Même personne — fiche existante">
        <MatchDetails m={m} />
        <p className="mt-2">À l'envoi des réponses, cette fiche sera mise à jour avec la demande et gardera son identifiant (pas de nouvelle fiche).</p>
        <Button variant="ghost" size="sm" className="mt-1 h-7 px-2" disabled={busy}
          onClick={async () => {
            try { await clear.mutateAsync(d.id); toast.success('Réponse annulée') } catch (e) { toast.error(parseApiError(e)) }
          }}>
          <Undo2 className="mr-1 h-3.5 w-3.5" />Annuler
        </Button>
      </Callout>
    )
  }

  return (
    <Callout tone="warning" icon={Users2} title="Déjà membre ?">
      <p>{m.reason}.</p>
      <MatchDetails m={m} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="success" disabled={busy} onClick={() => actions.onSame(d)}>
          <UserCheck className="mr-1 h-4 w-4" />{sent ? 'Même personne — fusionner' : 'Oui, même personne'}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => actions.onDifferent(d)}>
          <UserX className="mr-1 h-4 w-4" />Non, personne différente
        </Button>
      </div>
    </Callout>
  )
}
