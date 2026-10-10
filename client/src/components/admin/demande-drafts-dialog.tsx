// The DRAFTS of one applicant account (never submitted by the family), read-only. The review list only shows
// submitted / decided demandes, so for an account with drafts only this is the way to see what the family started.
import { useNavigate } from 'react-router'
import { ExternalLink, FilePen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Callout } from '@/components/shared/callout'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { formatDate } from '@/lib/utils'
import { useAccountDrafts, type DemandeAccount } from '@/services/demande-admin-service'

const EMPTY = <span className="italic text-muted-foreground">non renseigné</span>

export function DemandeDraftsDialog({ account, onClose }: { account: DemandeAccount; onClose: () => void }) {
  const { data, error, isLoading } = useAccountDrafts(account.id)
  const navigate = useNavigate()
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
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold">{`${d.firstName} ${d.lastName}`.trim() || EMPTY}</div>
                  {/* The whole file in the review drawer: check it, complete it (« Modifier »), then submit it for the
                      family — with « Soumettre et accepter / refuser » (immediate answer once the answers went out). */}
                  <Button size="sm" variant="outline" className="h-7 shrink-0"
                    onClick={() => navigate(`/admin/demandes?account=${account.id}&status=Draft&open=${d.id}`)}>
                    <ExternalLink className="mr-1 h-3.5 w-3.5" />Ouvrir la demande
                  </Button>
                </div>
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
            <Callout tone="info">Un brouillon n'est pas une demande : la famille doit cliquer sur « Soumettre » dans le portail. Vous pouvez aussi « Ouvrir la demande », la vérifier et la soumettre pour elle (avec ou sans décision).</Callout>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
