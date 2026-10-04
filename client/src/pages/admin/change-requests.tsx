import { useState } from 'react'
import { toast } from 'sonner'
import { usePendingChangeRequests, useReviewChangeRequest, type ChangeRequestDto } from '@/services/change-request-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { formatDate } from '@/lib/utils'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CheckCircle2, XCircle, Star, ArrowRightLeft, ClipboardList } from 'lucide-react'

// Chef d'unité / CG review of member-proposed changes (progression + fonctions). Approve applies the change (creates
// the real progression/assignment); reject discards it with an optional reason. Scoped server-side to the
// members the caller manages. Reached via the sidebar ("Demandes de modification", perm members.edit).
export default function ChangeRequestsPage() {
  const { data: requests, isLoading } = usePendingChangeRequests()
  const reviewMutation = useReviewChangeRequest()
  const [rejecting, setRejecting] = useState<ChangeRequestDto | null>(null)
  const [reason, setReason] = useState('')

  const approve = async (r: ChangeRequestDto) => {
    try { await reviewMutation.mutateAsync({ id: r.id, approve: true }); toast.success('Proposition acceptée et appliquée') }
    catch (err) { toast.error(parseApiError(err)) }
  }
  const confirmReject = async () => {
    if (!rejecting) return
    try { await reviewMutation.mutateAsync({ id: rejecting.id, approve: false, decisionNotes: reason || null }); toast.success('Proposition refusée'); setRejecting(null); setReason('') }
    catch (err) { toast.error(parseApiError(err)) }
  }

  return (
    <Page>
      <PageHeader
        title="Modifications à valider"
        icon={ClipboardList}
        description="Progression et fonctions proposées par les membres, en attente de votre validation."
      />

      {isLoading ? (
        <LoadingSpinner variant="cards" />
      ) : !requests || requests.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Aucune proposition en attente" description="Les propositions de vos membres (progression, fonction) apparaîtront ici." />
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <Card key={r.id}>
              {/* Stack vertically on mobile (icon+text, then full-width actions); go horizontal on sm+ so the
                  buttons never wrap into the middle of the text column and crush it on a narrow screen. */}
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${r.kind === 'Progression' ? 'bg-primary/10 text-primary' : 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'}`}>
                    {r.kind === 'Progression' ? <Star className="h-5 w-5" /> : <ArrowRightLeft className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{r.memberName}</span>
                      <Badge variant="outline">{r.kind === 'Progression' ? 'Progression' : 'Fonction'}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{r.summary}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Proposée le {formatDate(r.createdAt)}</p>
                  </div>
                </div>
                {/* Full-width buttons on mobile (each grows), compact on sm+. */}
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => { setRejecting(r); setReason('') }} disabled={reviewMutation.isPending}>
                    <XCircle className="mr-1.5 h-4 w-4 text-destructive" />Refuser
                  </Button>
                  <Button variant="success" size="sm" className="flex-1 sm:flex-none" onClick={() => approve(r)} disabled={reviewMutation.isPending}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />Accepter
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reject dialog (optional reason) */}
      <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) setRejecting(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Refuser la proposition</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{rejecting?.summary}</p>
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Motif (optionnel)</Label>
              <Textarea id="reject-reason" className="min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Raison du refus…" />
            </div>
          </div>
          <DialogFooter>
            {/* "Retour" (dismiss) vs "Confirmer le refus" (the action) — avoids Annuler/Refuser reading as two negatives. */}
            <Button variant="outline" onClick={() => setRejecting(null)}>Retour</Button>
            <Button variant="destructive" onClick={confirmReject} disabled={reviewMutation.isPending}>Confirmer le refus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  )
}
