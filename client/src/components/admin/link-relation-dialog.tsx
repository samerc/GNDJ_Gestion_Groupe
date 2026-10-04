// « Lier » confirmation on a demande: before a proche (brother/sister declared by the parent) is linked to an existing
// member, the CG compares the two side by side — what the parent declared + the family's parents, and the member's
// birth date, current posts and parents. Parents present on both sides are highlighted (the strongest sign it's the
// right child). « Oui, lier » confirms; « Non, ce n'est pas lui » drops the app's suggestion (only offered for a
// suggestion, not for a member picked by hand); « Annuler » decides later.
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { Check, Link2, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Callout } from '@/components/shared/callout'
import { parseApiError } from '@/lib/error-utils'
import { cn, formatDate } from '@/lib/utils'
import {
  useDismissRelationSuggestion, useLinkPreview, useLinkRelationMember, type LinkPreviewParent,
} from '@/services/demande-admin-service'

export interface LinkTarget { relationId: string; memberId: string; fromSuggestion: boolean }

export function LinkRelationDialog({ target, onClose }: { target: LinkTarget | null; onClose: () => void }) {
  const { data: p, isLoading, error } = useLinkPreview(target?.relationId ?? null, target?.memberId ?? null)
  const link = useLinkRelationMember()
  const dismiss = useDismissRelationSuggestion()
  const busy = link.isPending || dismiss.isPending
  const common = (p?.familyParents ?? []).filter((x) => x.inCommon).length

  const confirm = async () => {
    if (!target) return
    try { await link.mutateAsync({ relationId: target.relationId, memberId: target.memberId }); toast.success('Frère / sœur lié(e) au membre'); onClose() }
    catch (e) { toast.error(parseApiError(e)) }
  }
  const reject = async () => {
    if (!target) return
    try { await dismiss.mutateAsync(target.relationId); toast.success('Suggestion écartée'); onClose() }
    catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Lier à un membre ?</DialogTitle>
          <DialogDescription>
            Vérifiez que c'est bien le même enfant. Une fois la demande acceptée, les parents de la famille seront partagés avec ce membre et la fratrie sera déclarée.
          </DialogDescription>
        </DialogHeader>

        {!target ? null : isLoading ? <LoadingSpinner /> : error ? (
          <Callout tone="danger">{parseApiError(error)}</Callout>
        ) : !p ? null : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Side title="Déclaré par la famille">
                <Line label="Nom">{p.declaredName || '—'}</Line>
                <Line label="Lien">{p.declaredRelationship || '—'}</Line>
                {p.declaredUnit && <Line label="Unité indiquée">{p.declaredUnit}</Line>}
                <Parents title="Parents de la famille" list={p.familyParents} />
              </Side>
              <Side title="Membre du groupe">
                <Line label="Nom">{p.memberName}</Line>
                <Line label="Naissance">{p.memberDateOfBirth ? `${formatDate(p.memberDateOfBirth)}${p.memberAge != null ? ` (${p.memberAge} ans)` : ''}` : '—'}</Line>
                <Line label="Poste">{p.memberPosts}</Line>
                {p.memberCardNumber && <Line label="Matricule">{p.memberCardNumber}</Line>}
                <Parents title="Parents du membre" list={p.memberParents} />
              </Side>
            </div>
            <Callout tone={common > 0 ? 'success' : 'warning'}>
              {common > 0
                ? `${common} parent(s) en commun — c'est très probablement le bon enfant.`
                : 'Aucun parent en commun sur la fiche du membre — vérifiez bien avant de lier.'}
            </Callout>
            {!p.isSibling && <p className="text-sm text-destructive">Seuls les frères et sœurs peuvent être liés.</p>}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
          {target?.fromSuggestion && (
            <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={reject} disabled={busy || isLoading}>
              <X className="mr-1 h-4 w-4" />Non, ce n'est pas lui
            </Button>
          )}
          <Button onClick={confirm} disabled={busy || isLoading || !p || !p.isSibling}>
            <Link2 className="mr-1 h-4 w-4" />Oui, lier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Side({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-lg border p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  )
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return <div className="text-sm"><span className="text-muted-foreground">{label} : </span><span className="font-medium">{children}</span></div>
}

function Parents({ title, list }: { title: string; list: LinkPreviewParent[] }) {
  return (
    <div className="pt-1">
      <div className="text-xs text-muted-foreground">{title}</div>
      {list.length === 0 ? <p className="text-sm text-muted-foreground">Aucun parent enregistré</p> : (
        <ul className="space-y-0.5">
          {list.map((g, i) => (
            <li key={i} className={cn('flex items-center gap-1.5 text-sm', g.inCommon && 'font-medium text-emerald-700 dark:text-emerald-300')}>
              {g.inCommon ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
              {g.name}{g.relationship ? <span className="text-xs text-muted-foreground">({g.relationship})</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
