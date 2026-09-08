// The in-app document-template builder — a CG authors any document (authorisation, fiche médicale, …) as rich
// text, inserting {{champs}} that pre-fill with each member's data when they download their PDF. Reuses the
// shared RichTextEditor (its "Variable" dropdown inserts the member-field placeholders) + an "Aperçu PDF"
// button that renders the CURRENT content with sample values so the CG checks the layout before saving.
import { useState } from 'react'
import { toast } from 'sonner'
import { RichTextEditor } from '@/components/shared/rich-text-editor'
import { useDocumentTemplateFields, previewDocumentTemplate } from '@/services/document-type-service'
import { openBlob } from '@/lib/download'
import { parseApiError } from '@/lib/error-utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FileText, Loader2 } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialHtml: string
  documentName: string
  onSave: (html: string) => void
}

export function DocumentTemplateBuilder({ open, onOpenChange, initialHtml, documentName, onSave }: Props) {
  const { data: fields } = useDocumentTemplateFields()
  const [html, setHtml] = useState(initialHtml)
  const [previewing, setPreviewing] = useState(false)

  // Reseed the editor content whenever the dialog (re)opens or the source template changes (render-phase reset).
  const [seed, setSeed] = useState({ open, initialHtml })
  if (seed.open !== open || seed.initialHtml !== initialHtml) {
    setSeed({ open, initialHtml })
    if (open) setHtml(initialHtml)
  }

  // The RichTextEditor's "Variable" dropdown inserts {{key}} — feed it the member-field catalog.
  const variables = fields?.map(f => ({ key: f.key, label: f.label }))

  const isEmpty = !html || html === '<p></p>'

  const handlePreview = async () => {
    if (isEmpty) { toast.error('Le modèle est vide.'); return }
    setPreviewing(true)
    try {
      const blob = await previewDocumentTemplate(html, documentName || 'Document')
      openBlob(blob, 'application/pdf')
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setPreviewing(false)
    }
  }

  const handleSave = () => {
    onSave(isEmpty ? '' : html)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Modèle du document{documentName ? ` — ${documentName}` : ''}</DialogTitle>
          <DialogDescription>
            Rédigez le document. Utilisez le menu <strong>« Variable »</strong> pour insérer un champ du membre
            (prénom, unité, date de naissance…) : il sera automatiquement rempli quand le membre télécharge son
            document. Laissez des espaces vides pour ce qui doit être complété à la main ou signé.
          </DialogDescription>
        </DialogHeader>

        <RichTextEditor
          content={html}
          onChange={setHtml}
          variables={variables}
          placeholder="Rédigez votre document ici…"
        />

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={handlePreview} disabled={previewing || isEmpty}>
            {previewing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}
            Aperçu PDF
          </Button>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="button" onClick={handleSave}>Enregistrer le modèle</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
