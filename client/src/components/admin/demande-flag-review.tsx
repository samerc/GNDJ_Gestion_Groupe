// « À vérifier » window on the demandes page: one clear list per flag instead of filtering the demandes and opening
// each drawer. Each line shows the demande on the left and the member already in the group on the right, with the
// answer buttons on the line; an answered line disappears (the demandes list is refetched).
//   • memberMatch — « Déjà membre ? »: the child looks like an existing member (same person / different person).
//   • toLink — a brother/sister declared by the family was recognised as a member: compare and link, or « Pas lui ».
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight, CheckCircle2, ExternalLink, Link2, UserCheck, UserX, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { parseApiError } from '@/lib/error-utils'
import { formatDate } from '@/lib/utils'
import type { ApplicantScoutRelation } from '@/services/applicant-service'
import { useDismissRelationSuggestion, type DemandeReview } from '@/services/demande-admin-service'
import { useMemberMatchActions } from './member-match-actions'
import type { LinkTarget } from './link-relation-dialog'

export type FlagKind = 'memberMatch' | 'toLink'
export interface ToLinkItem { d: DemandeReview; r: ApplicantScoutRelation }

// Père / Mère names of the demande's family (the easiest thing to compare with the member's file).
function parentNames(d: DemandeReview) {
  return d.guardians.map((g) => `${g.relationship} : ${g.firstName} ${g.lastName}`).join(' · ')
}

// One comparison line: demande | ≈ | member, then the buttons (stacked under on a phone).
function CompareRow({ left, right, actions }: { left: ReactNode; right: ReactNode; actions: ReactNode }) {
  return (
    <li className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_auto_1fr] md:items-start lg:grid-cols-[1fr_auto_1fr_auto]">
      <div className="min-w-0">{left}</div>
      <ArrowRight className="hidden h-4 w-4 text-muted-foreground md:mt-6 md:block" aria-hidden />
      <div className="min-w-0 rounded-md bg-muted/60 p-2">{right}</div>
      {/* Buttons: under the line on smaller screens, a column on the right on a wide screen. */}
      <div className="flex flex-wrap justify-end gap-2 md:col-span-3 lg:col-span-1 lg:flex-col lg:items-stretch">{actions}</div>
    </li>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</p>
}

// The demande side (child of the request).
function DemandeSide({ d, title }: { d: DemandeReview; title: string }) {
  return (
    <>
      <Label>{title}</Label>
      <p className="font-semibold">{d.lastName} {d.firstName}</p>
      <p className="text-sm text-muted-foreground">
        {[d.serialNumber, d.dateOfBirth && `né(e) le ${formatDate(d.dateOfBirth)}`].filter(Boolean).join(' · ')}
      </p>
      {d.guardians.length > 0 && <p className="text-sm text-muted-foreground">{parentNames(d)}</p>}
    </>
  )
}

export function DemandeFlagReview({ kind, matches, links, onClose, onOpenDemande, onLink }: {
  kind: FlagKind | null
  matches: DemandeReview[]
  links: ToLinkItem[]
  onClose: () => void
  onOpenDemande: (id: string) => void
  onLink: (target: LinkTarget) => void
}) {
  const actions = useMemberMatchActions()
  const dismiss = useDismissRelationSuggestion()
  const count = kind === 'memberMatch' ? matches.length : links.length

  const openButton = (id: string) => (
    <Button size="sm" variant="ghost" onClick={() => onOpenDemande(id)}>
      <ExternalLink className="mr-1 h-4 w-4" />Voir la demande
    </Button>
  )

  return (
    <Dialog open={!!kind} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="flex max-h-[85vh] max-w-[95vw] flex-col sm:max-w-4xl lg:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {kind === 'memberMatch' ? `Déjà membre ? (${count})` : `Frères et sœurs à lier (${count})`}
          </DialogTitle>
          <DialogDescription>
            {kind === 'memberMatch'
              ? 'À gauche l\'enfant de la demande, à droite le membre du groupe qui lui ressemble. Même personne : sa fiche existante sera utilisée (pas de deuxième fiche).'
              : 'À gauche la demande et le frère ou la sœur déclaré(e) par la famille, à droite le membre reconnu. « Comparer et lier » montre les parents des deux côtés avant de lier.'}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          {count === 0 ? (
            <EmptyState icon={CheckCircle2} title="Tout est vérifié" description="Il n'y a plus rien à vérifier ici." />
          ) : kind === 'memberMatch' ? (
            <ul className="space-y-2">
              {matches.map((d) => {
                const m = d.memberMatch!
                return (
                  <CompareRow key={d.id}
                    left={<DemandeSide d={d} title="Demande" />}
                    right={<>
                      <Label>Membre du groupe</Label>
                      <Link to={`/members/${m.memberId}`} target="_blank" className="font-semibold underline underline-offset-2">{m.name}</Link>
                      <p className="text-sm text-muted-foreground">
                        {[m.cardNumber, m.dateOfBirth && `né(e) le ${formatDate(m.dateOfBirth)}`, m.unitLabel ?? (m.isActive ? null : 'ancien membre')].filter(Boolean).join(' · ')}
                      </p>
                      <p className="mt-1 text-sm">{m.reason}</p>
                    </>}
                    actions={<>
                      {openButton(d.id)}
                      <Button size="sm" variant="outline" disabled={actions.busy} onClick={() => actions.onDifferent(d)}>
                        <UserX className="mr-1 h-4 w-4" />Personne différente
                      </Button>
                      <Button size="sm" variant="success" disabled={actions.busy} onClick={() => actions.onSame(d)}>
                        <UserCheck className="mr-1 h-4 w-4" />{d.createdMemberId ? 'Même personne — fusionner' : 'Même personne'}
                      </Button>
                    </>}
                  />
                )
              })}
            </ul>
          ) : (
            <ul className="space-y-2">
              {links.map(({ d, r }) => (
                <CompareRow key={r.id!}
                  left={<>
                    <DemandeSide d={d} title="Demande" />
                    <p className="mt-1 text-sm">
                      {r.relationship || 'Frère / sœur'} déclaré(e) : <strong>{[r.firstName, r.lastName].filter(Boolean).join(' ')}</strong>
                      {r.lastUnit ? ` (${r.lastUnit})` : ''}
                    </p>
                  </>}
                  right={<>
                    <Label>Membre reconnu</Label>
                    <Link to={`/members/${r.suggestedMemberId}`} target="_blank" className="font-semibold underline underline-offset-2">{r.suggestedMemberName}</Link>
                    {r.suggestedMemberUnit && <p className="text-sm text-muted-foreground">{r.suggestedMemberUnit}</p>}
                  </>}
                  actions={<>
                    {openButton(d.id)}
                    <Button size="sm" variant="outline" disabled={dismiss.isPending}
                      onClick={async () => {
                        try { await dismiss.mutateAsync(r.id!); toast.success('Suggestion écartée') }
                        catch (e) { toast.error(parseApiError(e)) }
                      }}>
                      <X className="mr-1 h-4 w-4" />Pas lui
                    </Button>
                    <Button size="sm" variant="success" onClick={() => onLink({ relationId: r.id!, memberId: r.suggestedMemberId!, fromSuggestion: true })}>
                      <Link2 className="mr-1 h-4 w-4" />Comparer et lier
                    </Button>
                  </>}
                />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
