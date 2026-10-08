// Rules behind the warnings on the demandes review page (« À vérifier » box, row badges, drawer notices). Shared by
// the page and the « Vérifier » windows so a warning means the same thing everywhere.
import type { DemandeReview, Sibling } from '@/services/demande-admin-service'

// The CG confirmed this refusal is intended (« Le refus est voulu »): the refusal warnings no longer apply. Stored as
// the status confirmed, so a later change of decision brings the warnings back.
export function refusalChecked(x: Pick<Sibling, 'status' | 'decisionCheckedAs'>): boolean {
  return x.status === 'Declined' && x.decisionCheckedAs === 'Declined'
}

// A "proche scout" who is a brother/sister (mirrors the backend IsSiblingRelation) — used to flag the demande
// so the CG immediately sees a sibling already/also in the group.
export function isSiblingRelation(rel?: string | null): boolean {
  if (!rel) return false
  const r = rel.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return r.includes('frere') || r.includes('soeur') || r.includes('broth') || r.includes('sist') || r.includes('jumeau') || r.includes('jumelle')
}
export function siblingProche(d: DemandeReview) {
  return d.scoutRelations.find((r) => isSiblingRelation(r.relationship))
}
// A brother/sister proche that the app matched to a member but the CG hasn't confirmed yet ("Lier") — flagged in
// the table so a link is never applied silently on a name match.
export function hasSiblingToLink(d: DemandeReview) {
  return d.scoutRelations.some((r) => isSiblingRelation(r.relationship) && !r.relatedMemberId && !!r.suggestedMemberId)
}

// Family consistency flag 1: the same account has both an accepted and a refused child this year. `d.siblings`
// comes from the server (every non-draft demande of the account), so this works whatever the list filters are.
export function hasMixedFamilyDecision(d: DemandeReview): boolean {
  const family = [d, ...d.siblings]
  return family.some((x) => x.status === 'Approved') && family.some((x) => x.status === 'Declined' && !refusalChecked(x))
}
// A brother/sister proche who is ALREADY in the group: declared as a current member, or linked to a member with
// an active post (relatedMemberUnit is only filled for an active post).
export function siblingsInGroup(d: DemandeReview) {
  return d.scoutRelations.filter((r) => isSiblingRelation(r.relationship) && (r.status === 'CurrentInGroup' || (!!r.relatedMemberId && !!r.relatedMemberUnit)))
}
// Family consistency flag 2: a refusal while a brother/sister is already in the group.
export function isDeclinedWithSiblingInGroup(d: DemandeReview): boolean {
  return d.status === 'Declined' && !refusalChecked(d) && siblingsInGroup(d).length > 0
}
// Flag 3: a refusal for a child whose family says a demande was already made in a previous year.
export function isDeclinedWithPreviousDemande(d: DemandeReview): boolean {
  return d.status === 'Declined' && !refusalChecked(d) && !!d.hasPreviousDemande
}
export function relationName(r: { firstName?: string | null; lastName?: string | null; relatedMemberName?: string | null }): string {
  return r.relatedMemberName || [r.firstName, r.lastName].filter(Boolean).join(' ') || '—'
}
