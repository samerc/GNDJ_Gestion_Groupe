// « À vérifier » window on the demandes page: one clear list per flag instead of filtering the demandes and opening
// each drawer. Each line is a small table with the SAME rows on both sides (nom, naissance, unité, parents): what the
// demande says on the left, the member already in the group on the right. Matching values are marked in green, so
// the answer is usually obvious at a glance. The answer buttons are on the line; an answered line disappears (the
// demandes list is refetched).
//   • memberMatch — « Déjà membre ? »: the child looks like an existing member (same person / different person).
//   • toLink — a brother/sister declared by the family was recognised as a member: compare and link, or « Pas lui ».
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Check, CheckCircle2, ExternalLink, Link2, UserCheck, UserX, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { parseApiError } from '@/lib/error-utils'
import { cn, formatDate, normalizeSearch } from '@/lib/utils'
import type { ApplicantScoutRelation, MemberParent } from '@/services/applicant-service'
import { useDismissRelationSuggestion, type DemandeReview } from '@/services/demande-admin-service'
import { useMemberMatchActions } from './member-match-actions'
import type { LinkTarget } from './link-relation-dialog'

export type FlagKind = 'memberMatch' | 'toLink'
export interface ToLinkItem { d: DemandeReview; r: ApplicantScoutRelation }

// Letters and digits only, no accents / case: « Abi-Nassif » ≡ « ABI NASSIF ».
const key = (s?: string | null) => normalizeSearch(s ?? '').replace(/[^a-z0-9]/g, '')

// Same name, allowing a small spelling difference (« Najib » / « Nagib », « Firass » / « Firas »): at most 1 letter
// apart for short names, 2 for longer ones.
function sameName(a?: string | null, b?: string | null) {
  const x = key(a), y = key(b)
  if (!x || !y) return false
  if (x === y) return true
  if (Math.abs(x.length - y.length) > 2) return false
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const cur = [i]
    for (let j = 1; j <= y.length; j++)
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[y.length] <= (Math.min(x.length, y.length) >= 8 ? 2 : 1)
}

// One side of the comparison, already reduced to the four rows shown.
interface Side { name: string; dob: string | null; dobNote?: string; unit: string | null; parents: MemberParent[] }

function familyParents(d: DemandeReview): MemberParent[] {
  return d.guardians.map((g) => ({ relationship: g.relationship, name: `${g.firstName} ${g.lastName}`.trim() }))
}

// A value cell; green with a check when the row matches on both sides.
function Cell({ children, match }: { children: ReactNode; match?: boolean }) {
  return (
    <div className={cn('min-w-0 rounded px-2 py-1', match && 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200')}>
      <span className="inline-flex items-start gap-1">
        {match && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="identique" />}
        <span className="min-w-0">{children}</span>
      </span>
    </div>
  )
}

// Parents list; the ones also on the other side are in green with a check.
function ParentList({ list, other }: { list: MemberParent[]; other: MemberParent[] }) {
  if (list.length === 0) return <span className="text-muted-foreground">Aucun parent sur la fiche</span>
  return (
    <ul className="space-y-0.5">
      {list.map((p, i) => {
        const common = other.some((q) => sameName(q.name, p.name))
        return (
          <li key={i} className={cn('flex items-start gap-1', common && 'font-medium text-emerald-700 dark:text-emerald-300')}>
            {common ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="en commun" /> : <span className="w-3.5 shrink-0" />}
            <span><span className="text-muted-foreground">{p.relationship} :</span> {p.name}</span>
          </li>
        )
      })}
    </ul>
  )
}

// The comparison table: label | left | right, then the buttons.
function Comparison({ context, leftTitle, rightTitle, left, right, rightLink, actions }: {
  context?: ReactNode; leftTitle: string; rightTitle: string; left: Side; right: Side; rightLink: string; actions: ReactNode
}) {
  const nameMatch = sameName(left.name, right.name)
  const sameDob = !!left.dob && left.dob === right.dob
  const sameUnit = !!left.unit && key(left.unit) === key(right.unit)
  const common = left.parents.filter((p) => right.parents.some((q) => sameName(q.name, p.name))).length
  const row = 'grid grid-cols-[6.5rem_1fr_1fr] items-start gap-x-2 border-t py-1.5 text-sm'
  const label = 'pt-1 text-xs font-medium text-muted-foreground'
  return (
    <li className="rounded-lg border p-3">
      {context && <p className="mb-2 text-sm text-muted-foreground">{context}</p>}
      <div className="grid grid-cols-[6.5rem_1fr_1fr] gap-x-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span />
        <span className="px-2">{leftTitle}</span>
        <span className="px-2">{rightTitle}</span>
      </div>
      <div className={row}>
        <span className={label}>Nom</span>
        <Cell match={nameMatch}><span className="font-semibold">{left.name}</span></Cell>
        <Cell match={nameMatch}>
          <Link to={rightLink} target="_blank" className="font-semibold underline underline-offset-2">{right.name}</Link>
        </Cell>
      </div>
      <div className={row}>
        <span className={label}>Né(e) le</span>
        <Cell match={sameDob}>{left.dob ? formatDate(left.dob) : <span className="text-muted-foreground">{left.dobNote ?? '—'}</span>}</Cell>
        <Cell match={sameDob}>{right.dob ? formatDate(right.dob) : <span className="text-muted-foreground">—</span>}</Cell>
      </div>
      <div className={row}>
        <span className={label}>Unité</span>
        <Cell match={sameUnit}>{left.unit ?? <span className="text-muted-foreground">—</span>}</Cell>
        <Cell match={sameUnit}>{right.unit ?? <span className="text-muted-foreground">Aucun poste</span>}</Cell>
      </div>
      <div className={row}>
        <span className={label}>Parents</span>
        <Cell><ParentList list={left.parents} other={right.parents} /></Cell>
        <Cell><ParentList list={right.parents} other={left.parents} /></Cell>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t pt-2">
        <span className={cn('mr-auto text-xs', common > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300')}>
          {common > 0 ? `${common} parent(s) en commun` : 'Aucun parent en commun — vérifiez bien'}
        </span>
        {actions}
      </div>
    </li>
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
      <DialogContent className="flex max-h-[85vh] max-w-[95vw] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {kind === 'memberMatch' ? `Déjà membre ? (${count})` : `Frères et sœurs à lier (${count})`}
          </DialogTitle>
          <DialogDescription>
            {kind === 'memberMatch'
              ? 'À gauche l\'enfant de la demande, à droite le membre du groupe qui lui ressemble. Ce qui est identique est en vert. Même personne : sa fiche existante sera utilisée (pas de deuxième fiche).'
              : 'À gauche le frère ou la sœur déclaré(e) par la famille, à droite le membre reconnu. Ce qui est identique est en vert. La famille ne donne pas la date de naissance du frère ou de la sœur : les parents en commun sont le meilleur indice.'}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          {count === 0 ? (
            <EmptyState icon={CheckCircle2} title="Tout est vérifié" description="Il n'y a plus rien à vérifier ici." />
          ) : kind === 'memberMatch' ? (
            <ul className="space-y-3">
              {matches.map((d) => {
                const m = d.memberMatch!
                return (
                  <Comparison key={d.id}
                    context={<>{d.serialNumber} · {m.reason}</>}
                    leftTitle="Demande" rightTitle="Membre du groupe" rightLink={`/members/${m.memberId}`}
                    left={{ name: `${d.firstName} ${d.lastName}`, dob: d.dateOfBirth,
                      unit: d.decidedUnitName ? `Acceptée en ${d.decidedUnitName}` : null, parents: familyParents(d) }}
                    right={{ name: m.name, dob: m.dateOfBirth,
                      unit: [m.cardNumber, m.unitLabel ?? (m.isActive ? null : 'ancien membre')].filter(Boolean).join(' · ') || null,
                      parents: m.parents ?? [] }}
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
            <ul className="space-y-3">
              {links.map(({ d, r }) => (
                <Comparison key={r.id!}
                  context={<>Dans la demande de <strong className="text-foreground">{d.firstName} {d.lastName}</strong> ({d.serialNumber}) — {r.relationship || 'frère / sœur'}</>}
                  leftTitle="Déclaré par la famille" rightTitle="Membre reconnu" rightLink={`/members/${r.suggestedMemberId}`}
                  left={{ name: [r.firstName, r.lastName].filter(Boolean).join(' '), dob: null, dobNote: 'non demandée',
                    unit: r.lastUnit ?? null, parents: familyParents(d) }}
                  right={{ name: r.suggestedMemberName ?? '', dob: r.suggestedMemberDateOfBirth ?? null,
                    unit: r.suggestedMemberUnit ?? null, parents: r.suggestedMemberParents ?? [] }}
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
                      <Link2 className="mr-1 h-4 w-4" />Lier
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
