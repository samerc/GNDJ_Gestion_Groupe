// « Décisions à vérifier » window on the demandes page: the refusals that look inconsistent, grouped by family so the
// whole family's decisions are seen together. For each refused child the reasons are spelled out (a brother/sister
// already in the group, a previous demande, a brother/sister accepted this year) and the CG answers on the line:
//   • « Remettre à étudier » — the refusal was a mistake, the demande goes back to « À étudier »;
//   • « Le refus est voulu » — the warning goes away (it comes back if the decision changes later).
// A family whose refusals are all answered leaves the list.
import { Link } from 'react-router'
import { CheckCircle2, ExternalLink, RotateCcw, Search, ThumbsUp, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { parseApiError } from '@/lib/error-utils'
import { refusalChecked, relationName, siblingsInGroup } from '@/lib/demande-flags'
import { useSetDecisionChecked, type DemandeReview, type Sibling } from '@/services/demande-admin-service'

// One family to look at: every child of the account (full file when it is in the loaded list, else the short sibling
// info), with whether the family has a child accepted.
export interface DecisionFamily { accountId: string; label: string; children: (DemandeReview | Sibling)[] }

const isFull = (x: DemandeReview | Sibling): x is DemandeReview => 'scoutRelations' in x

// Why this refused child is on the list (empty = nothing to check for this child).
function reasonsFor(x: DemandeReview | Sibling, familyHasAccepted: boolean): string[] {
  if (x.status !== 'Declined' || refusalChecked(x)) return []
  const out: string[] = []
  if (familyHasAccepted) out.push('Un frère ou une sœur est accepté(e) cette année')
  if (isFull(x)) {
    const inGroup = siblingsInGroup(x)
    if (inGroup.length > 0)
      out.push(`Frère / sœur déjà membre : ${inGroup.map((r) => `${relationName(r)}${r.relatedMemberUnit ? ` (${r.relatedMemberUnit})` : ''}`).join(', ')}`)
    if (x.hasPreviousDemande) out.push(`Demande déjà faite${x.previousDemandeYear ? ` en ${x.previousDemandeYear}` : ' une année précédente'}`)
  }
  return out
}

function DecisionBadge({ x }: { x: DemandeReview | Sibling }) {
  if (x.status === 'Approved')
    return <Badge variant="success">Acceptée{isFull(x) && x.decidedUnitName ? ` — ${x.decidedUnitName}` : ''}</Badge>
  if (x.status === 'Declined') return <Badge variant="danger">Refusée</Badge>
  if (x.status === 'AlreadyMember') return <Badge variant="info">Déjà membre</Badge>
  return <Badge variant="info">À étudier</Badge>
}

export function DemandeDecisionReview({ open, families, onClose, onOpenDemande, onReset }: {
  open: boolean
  families: DecisionFamily[]
  onClose: () => void
  onOpenDemande: (id: string) => void
  onReset: (d: DemandeReview) => Promise<boolean>
}) {
  const setChecked = useSetDecisionChecked()

  const answer = async (id: string, checked: boolean) => {
    try {
      await setChecked.mutateAsync({ id, checked })
      toast.success(checked ? 'Noté : le refus est voulu' : 'Réponse annulée')
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="flex max-h-[85vh] max-w-[95vw] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Décisions à vérifier ({families.length} famille{families.length > 1 ? 's' : ''})</DialogTitle>
          <DialogDescription>
            Des refus qui semblent incohérents, regroupés par famille. Pour chaque refus : « Remettre à étudier » si c'est
            une erreur, ou « Le refus est voulu » pour ne plus le signaler.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          {families.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Tout est vérifié" description="Il n'y a plus de décision à vérifier." />
          ) : (
            <ul className="space-y-3">
              {families.map((f) => {
                const familyHasAccepted = f.children.some((c) => c.status === 'Approved')
                return (
                  <li key={f.accountId} className="rounded-lg border p-3">
                    <p className="mb-2 text-sm font-semibold">{f.label}</p>
                    <ul className="divide-y">
                      {f.children.map((c) => {
                        const reasons = reasonsFor(c, familyHasAccepted)
                        const full = isFull(c) ? c : null
                        return (
                          <li key={c.id} className="space-y-1.5 py-2.5">
                            <div className="min-w-0 space-y-1">
                              <p className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{c.firstName} {c.lastName}</span>
                                {full?.serialNumber && <span className="text-xs text-muted-foreground">{full.serialNumber}</span>}
                                <DecisionBadge x={c} />
                                {refusalChecked(c) && <Badge variant="secondary">Refus confirmé</Badge>}
                              </p>
                              {/* Why it is on the list — first, so it reads at a glance. */}
                              {reasons.length > 0 && (
                                <ul className="space-y-0.5 text-sm font-medium text-amber-800 dark:text-amber-300">
                                  {reasons.map((r, i) => <li key={i}>⚠ {r}</li>)}
                                </ul>
                              )}
                              {/* The refusal reason sent to the family, on one line (full text on hover). */}
                              {full?.status === 'Declined' && full.decisionNotes && (
                                <p className="line-clamp-1 text-xs text-muted-foreground" title={full.decisionNotes}>Motif : {full.decisionNotes}</p>
                              )}
                            </div>
                            <div className="flex flex-wrap justify-end gap-2">
                              {full && (
                                <Button size="sm" variant="ghost" onClick={() => onOpenDemande(full.id)}>
                                  <ExternalLink className="mr-1 h-4 w-4" />Voir
                                </Button>
                              )}
                              {full?.hasPreviousDemande && reasons.length > 0 && (
                                <Button size="sm" variant="ghost" asChild>
                                  <Link to={`/admin/demande-archives?q=${encodeURIComponent(full.lastName)}`} target="_blank">
                                    <Search className="mr-1 h-4 w-4" />Archives
                                  </Link>
                                </Button>
                              )}
                              {reasons.length > 0 && full && !full.createdMemberId && (
                                <Button size="sm" variant="outline" onClick={() => onReset(full)}>
                                  <RotateCcw className="mr-1 h-4 w-4" />Remettre à étudier
                                </Button>
                              )}
                              {reasons.length > 0 && (
                                <Button size="sm" variant="success" disabled={setChecked.isPending} onClick={() => answer(c.id, true)}>
                                  <ThumbsUp className="mr-1 h-4 w-4" />Le refus est voulu
                                </Button>
                              )}
                              {refusalChecked(c) && (
                                <Button size="sm" variant="ghost" disabled={setChecked.isPending} onClick={() => answer(c.id, false)}>
                                  <Undo2 className="mr-1 h-4 w-4" />Annuler
                                </Button>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
