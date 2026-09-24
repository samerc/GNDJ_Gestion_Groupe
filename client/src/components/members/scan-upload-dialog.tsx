import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Smartphone, RefreshCw, CheckCircle2, Clock } from 'lucide-react'
import { parseApiError } from '@/lib/error-utils'
import { useCreateUploadSession, useUploadSessionStatus } from '@/services/scan-upload-service'

// DESKTOP side of "Scanner un document avec le téléphone". Opens a short-lived scan session for the member,
// shows a QR the user scans with their phone (→ opens /scan-upload/{token} there, no login), and live-refreshes
// the member's documents as photos arrive. The QR encodes THIS host's origin, so the phone hits the same server.
interface Props {
  memberId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  // When set (opened from a specific document-type row), the QR pre-targets that type so the phone skips the
  // "choose type" step and uploads straight into it.
  documentTypeId?: string
  documentTypeName?: string
}

export function ScanUploadDialog({ memberId, open, onOpenChange, documentTypeId, documentTypeName }: Props) {
  const qc = useQueryClient()
  const createSession = useCreateUploadSession()
  const [session, setSession] = useState<{ id: string; token: string; expiresAt: string } | null>(null)
  const prevCount = useRef(0) // highest uploadedCount already reflected (to detect new arrivals)

  const status = useUploadSessionStatus(open ? (session?.id ?? null) : null)
  const uploadedCount = status.data?.uploadedCount ?? 0
  const expired = status.data?.expired ?? false
  // The document type (when scanning a specific row) rides in the URL — the session stays member-scoped, so no
  // schema change; the phone reads ?type= and pre-selects it.
  const qrUrl = session ? `${window.location.origin}/scan-upload/${session.token}${documentTypeId ? `?type=${documentTypeId}` : ''}` : ''

  // Create a session once when the dialog opens (async side effect — one-shot, keyed on `open`).
  useEffect(() => {
    if (!open || session) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await createSession.mutateAsync(memberId)
        if (!cancelled) { setSession(res); prevCount.current = 0 }
      } catch (err) {
        if (!cancelled) toast.error(parseApiError(err))
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // When a new photo arrives (count goes up), refresh the member's documents so the rows update live.
  // Refs + invalidate only — no setState in the effect.
  useEffect(() => {
    if (uploadedCount > prevCount.current) {
      prevCount.current = uploadedCount
      qc.invalidateQueries({ queryKey: ['documents', memberId] })
      qc.invalidateQueries({ queryKey: ['members'] })
    }
  }, [uploadedCount, memberId, qc])

  // Reset on close (event handler, not an effect) so the next open starts a fresh session.
  const handleOpenChange = (o: boolean) => {
    if (!o) { setSession(null); prevCount.current = 0 }
    onOpenChange(o)
  }

  const regenerate = async () => {
    prevCount.current = 0
    try {
      const res = await createSession.mutateAsync(memberId)
      setSession(res)
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" />Scanner avec le téléphone</DialogTitle>
        </DialogHeader>

        {!session ? (
          <div className="py-10"><LoadingSpinner /></div>
        ) : expired ? (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Clock className="h-6 w-6 text-muted-foreground" /></div>
            <p className="text-sm text-muted-foreground">Le code a expiré. Générez-en un nouveau pour continuer.</p>
            <Button onClick={regenerate} disabled={createSession.isPending}>
              <RefreshCw className="mr-2 h-4 w-4" />Générer un nouveau code
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {documentTypeName && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                Document : <span className="font-semibold">{documentTypeName}</span>
              </div>
            )}
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Ouvrez l'appareil photo de votre téléphone.</li>
              <li>Visez le code ci-dessous pour ouvrir la page.</li>
              <li>Photographiez le document — il s'ajoute automatiquement ici.</li>
            </ol>

            <div className="flex justify-center">
              <div className="rounded-xl border bg-white p-3 shadow-sm">
                <QRCodeSVG value={qrUrl} size={196} />
              </div>
            </div>

            {uploadedCount > 0 ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
                <CheckCircle2 className="h-5 w-5" />
                {uploadedCount} document{uploadedCount > 1 ? 's' : ''} reçu{uploadedCount > 1 ? 's' : ''} — vous pouvez continuer ou fermer.
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                En attente du téléphone…
              </div>
            )}

            <p className="text-center text-xs text-muted-foreground">Le code est valable environ 10 minutes et n'autorise que l'envoi de documents pour ce membre.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
