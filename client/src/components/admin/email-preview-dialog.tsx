// « Aperçu » of an email template: subject + body as a recipient receives them, rendered by the server with the same
// code as a real send (example values for the variables, the years filled in). Works on the text being edited.
// Anything left between {{ }} would reach the families as-is → flagged in red above the email.
import { useEffect } from 'react'
import { Eye, Paperclip } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Callout } from '@/components/shared/callout'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { RichContent } from '@/components/public/rich-content'
import { parseApiError } from '@/lib/error-utils'
import { usePreviewEmailTemplate, type EmailPreviewInput } from '@/services/email-service'

export function EmailPreviewDialog({ input, onClose }: { input: EmailPreviewInput & { attachments?: { name: string }[] }; onClose: () => void }) {
  const preview = usePreviewEmailTemplate()
  const { mutate } = preview
  // Render once when opened (the input is a snapshot of the template at that moment).
  useEffect(() => { mutate(input) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const data = preview.data
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[92vh] max-w-[95vw] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-primary" />Aperçu de l'email</DialogTitle>
          <DialogDescription>Exemple avec des valeurs fictives (famille Khoury) ; les années sont celles de l'envoi réel.</DialogDescription>
        </DialogHeader>
        {preview.isError ? <Callout tone="danger">{parseApiError(preview.error)}</Callout>
          : !data ? <LoadingSpinner /> : (
            <div className="space-y-3">
              {data.unreplaced.length > 0 && (
                <Callout tone="danger" title="Variables non remplacées">
                  {data.unreplaced.join(', ')} : ce texte arriverait tel quel chez le destinataire. Vérifiez l'orthographe
                  ou utilisez une variable de la liste de ce modèle.
                </Callout>
              )}
              <div className="rounded-lg border">
                <div className="space-y-1 border-b bg-muted/40 px-4 py-2.5 text-sm">
                  <div><span className="text-muted-foreground">Objet : </span><span className="font-medium">{data.subject}</span></div>
                  {(input.attachments?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                      <Paperclip className="h-3.5 w-3.5" />{input.attachments!.map((a) => a.name).join(', ')}
                    </div>
                  )}
                </div>
                {/* White like a mail client, in light and dark mode — text colours pasted into a template show as sent. */}
                <div className="bg-white px-5 py-4 text-sm text-gray-900">
                  <RichContent html={data.bodyHtml} />
                </div>
              </div>
            </div>
          )}
      </DialogContent>
    </Dialog>
  )
}
