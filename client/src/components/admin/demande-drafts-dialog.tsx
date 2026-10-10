// The DRAFTS of one applicant account (never submitted by the family), read-only. The review list only shows
// submitted / decided demandes, so for an account with drafts only this is the way to see what the family started.
import { FilePen } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Callout } from '@/components/shared/callout'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { formatDate } from '@/lib/utils'
import { useAccountDrafts, type DemandeAccount } from '@/services/demande-admin-service'

const EMPTY = <span className="italic text-muted-foreground">non renseigné</span>

export function DemandeDraftsDialog({ account, onClose }: { account: DemandeAccount; onClose: () => void }) {
  const { data, error, isLoading } = useAccountDrafts(account.id)
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FilePen className="h-5 w-5 text-primary" />Brouillons de demande</DialogTitle>
          <DialogDescription>{account.contactName || account.email} — commencés sur le portail mais jamais soumis par la famille.</DialogDescription>
        </DialogHeader>
        {error ? <Callout tone="danger">{parseApiError(error)}</Callout> : isLoading || !data ? <LoadingSpinner /> : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun brouillon.</p>
        ) : (
          <div className="space-y-3">
            {data.map((d) => (
              <div key={d.id} className="rounded-lg border p-3 text-sm">
                <div className="font-semibold">{`${d.firstName} ${d.lastName}`.trim() || EMPTY}</div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">Année</dt><dd>{d.scoutYear}</dd>
                  <dt className="text-muted-foreground">Naissance</dt><dd>{d.dateOfBirth ? formatDate(d.dateOfBirth) : EMPTY}</dd>
                  <dt className="text-muted-foreground">Genre</dt><dd>{d.gender || EMPTY}</dd>
                  <dt className="text-muted-foreground">École</dt><dd>{d.school || EMPTY}</dd>
                  <dt className="text-muted-foreground">Classe</dt><dd>{[d.classe, d.section].filter(Boolean).join(' ') || EMPTY}</dd>
                  {d.parentNotes && <><dt className="text-muted-foreground">Remarques</dt><dd className="whitespace-pre-line">{d.parentNotes}</dd></>}
                  <dt className="text-muted-foreground">Commencé</dt><dd>{formatDate(d.createdAt)}</dd>
                  <dt className="text-muted-foreground">Modifié</dt><dd>{d.lastEditedAt ? formatDate(d.lastEditedAt) : '—'}</dd>
                </dl>
              </div>
            ))}
            <Callout tone="info">Un brouillon n'est pas une demande : la famille doit cliquer sur « Soumettre » dans le portail pour qu'elle apparaisse dans la liste des demandes.</Callout>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
