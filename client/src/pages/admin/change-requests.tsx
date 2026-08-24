import { useState } from 'react'
import { toast } from 'sonner'
import { usePendingChangeRequests, useReviewChangeRequest, type ChangeRequestDto } from '@/services/change-request-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tip } from '@/components/ui/tooltip'
import { CheckCircle2, XCircle, Star, ArrowRightLeft, ClipboardList } from 'lucide-react'

// CU/CG review of member-proposed changes (progression + fonctions). Approve applies the change (creates
// the real progression/assignment); reject discards it with an optional reason. Scoped server-side to the
// members the caller manages. Reached via the sidebar ("Demandes de modification", perm members.edit).
export default function ChangeRequestsPage() {
  const { data: requests, isLoading } = usePendingChangeRequests()
  const reviewMutation = useReviewChangeRequest()
  const [rejecting, setRejecting] = useState<ChangeRequestDto | null>(null)
  const [reason, setReason] = useState('')

  const approve = async (r: ChangeRequestDto) => {
    try { await reviewMutation.mutateAsync({ id: r.id, approve: true }); toast.success('Demande acceptée et appliquée') }
    catch (err) { toast.error(parseApiError(err)) }
  }
  const confirmReject = async () => {
    if (!rejecting) return
    try { await reviewMutation.mutateAsync({ id: rejecting.id, approve: false, decisionNotes: reason || null }); toast.success('Demande refusée'); setRejecting(null); setReason('') }
    catch (err) { toast.error(parseApiError(err)) }
  }

  if (isLoading) return <LoadingSpinner variant="table" />

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Modifications à valider</h1>
          <p className="text-sm text-muted-foreground">Progression et fonctions proposées par les membres, en attente de votre validation.</p>
        </div>
      </div>

      {!requests || requests.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Aucune demande en attente" description="Les demandes de vos membres apparaîtront ici." />
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <Card key={r.id}>
              <CardContent className="flex flex-wrap items-center gap-3 py-4">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${r.kind === 'Progression' ? 'bg-primary/10 text-primary' : 'bg-amber-100 text-amber-700'}`}>
                  {r.kind === 'Progression' ? <Star className="h-5 w-5" /> : <ArrowRightLeft className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.memberName}</span>
                    <Badge variant="outline">{r.kind === 'Progression' ? 'Progression' : 'Fonction'}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{r.summary}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Proposée le {new Date(r.createdAt).toLocaleDateString('fr-FR')}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Tip content="Refuser"><Button variant="outline" size="sm" onClick={() => { setRejecting(r); setReason('') }} disabled={reviewMutation.isPending}>
                    <XCircle className="mr-1 h-4 w-4 text-red-500" />Refuser
                  </Button></Tip>
                  <Button size="sm" onClick={() => approve(r)} disabled={reviewMutation.isPending}>
                    <CheckCircle2 className="mr-1 h-4 w-4" />Accepter
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
          <DialogHeader><DialogTitle>Refuser la demande</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{rejecting?.summary}</p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Motif (optionnel)</label>
              <textarea className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Raison du refus…" />
            </div>
          </div>
          <DialogFooter>
            {/* "Retour" (dismiss) vs "Confirmer le refus" (the action) — avoids Annuler/Refuser reading as two negatives. */}
            <Button variant="outline" onClick={() => setRejecting(null)}>Retour</Button>
            <Button variant="destructive" onClick={confirmReject} disabled={reviewMutation.isPending}>Confirmer le refus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
