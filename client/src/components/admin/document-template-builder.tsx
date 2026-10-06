// The in-app document-template builder — a CG authors any document (authorisation, fiche médicale, …) as rich
// text with a form-builder toolbar: insert auto-filled member fields (pills), write-on lines/boxes and checkboxes.
// A "Partir d'un exemple" picker loads a ready-made template so the CG edits instead of starting blank. An
// "Aperçu PDF" button renders the current content with sample values so the CG checks the layout before saving.
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { RichTextEditor, type InsertMenuGroup } from '@/components/shared/rich-text-editor'
import { FORM_NODES, SAVE_TARGETS } from '@/components/admin/form-nodes'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import { DOCUMENT_STARTERS } from '@/lib/document-starters'
import { useDocumentTemplateFields, previewDocumentTemplate } from '@/services/document-type-service'
import { uploadContentImage } from '@/services/content-image-service'
import { openBlob } from '@/lib/download'
import { parseApiError } from '@/lib/error-utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { FileText, Loader2, LayoutTemplate } from 'lucide-react'
import { confirmAsync } from '@/lib/confirm'

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

  // One grouped "Insérer un champ" dropdown: member fields (auto-filled pills) + fill-in form elements
  // (clean underline / bordered box / checkbox) — a lightweight form builder.
  const insertMenu = useMemo<InsertMenuGroup[]>(() => [
    {
      label: 'Champs du membre (remplis automatiquement)',
      items: (fields ?? []).map(f => ({ label: f.label, action: { kind: 'node', name: 'memberField', attrs: { field: f.key, label: f.label } } })),
    },
    {
      label: 'À remplir par le membre',
      items: [
        { label: 'Ligne à remplir (courte)', action: { kind: 'node', name: 'fillLine', attrs: { w: 120 } } },
        { label: 'Ligne à remplir (longue)', action: { kind: 'node', name: 'fillLine', attrs: { w: 300 } } },
        { label: 'Date à remplir (calendrier)', action: { kind: 'node', name: 'fillLine', attrs: { w: 100, date: true } } },
        { label: 'Cadre à remplir (grand)', action: { kind: 'node', name: 'fillBox', attrs: { h: 70 } } },
        { label: 'Case à cocher', action: { kind: 'node', name: 'checkbox' } },
      ],
    },
    {
      label: 'Mise en page',
      items: [
        { label: 'Séparateur gauche / droite', action: { kind: 'node', name: 'splitPoint' } },
        { label: 'Espace (petit)', action: { kind: 'node', name: 'spacer', attrs: { h: 10 } } },
        { label: 'Espace (moyen)', action: { kind: 'node', name: 'spacer', attrs: { h: 22 } } },
        { label: 'Espace (grand)', action: { kind: 'node', name: 'spacer', attrs: { h: 40 } } },
      ],
    },
  ], [fields])

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

  // Load a ready-made starter into the editor. If there's already content, confirm before replacing it.
  const applyStarter = async (key: string) => {
    const starter = DOCUMENT_STARTERS.find(s => s.key === key)
    if (!starter) return
    if (!isEmpty && !(await confirmAsync({ title: 'Remplacer le contenu ?', description: 'Le contenu actuel du modèle sera remplacé par cet exemple.', confirmLabel: 'Remplacer' }))) return
    setHtml(starter.html || '<p></p>')
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
            Rédigez le document, puis utilisez le menu <strong>« Insérer un champ »</strong> pour ajouter :
            un <strong>champ du membre</strong> (prénom, unité…) qui se remplit tout seul, une <strong>ligne</strong>
            ou un <strong>cadre à remplir</strong> à la main, ou une <strong>case à cocher</strong>. Le
            <strong> séparateur gauche / droite</strong> (⇥) pousse le texte qui suit vers la marge droite. Réglez
            la <strong>police</strong> et la <strong>taille</strong> dans la barre d'outils. L'icône image insère un
            <strong> en-tête / logo</strong>. Aperçu PDF pour vérifier le rendu.
          </DialogDescription>
        </DialogHeader>

        {/* Start from a ready-made example (loads into the editor, then editable). */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><LayoutTemplate className="h-4 w-4" />Partir d'un exemple :</span>
          <Select value="" onValueChange={applyStarter}>
            <SelectTrigger className="h-9 w-full sm:w-72"><SelectValue placeholder="Choisir un modèle de départ…" /></SelectTrigger>
            <SelectContent>
              {DOCUMENT_STARTERS.map(s => (
                <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <RichTextEditor
          content={html}
          onChange={setHtml}
          insertMenu={insertMenu}
          extraExtensions={FORM_NODES}
          enableFont
          onImageUpload={(file) => uploadContentImage(file).catch((e) => { toast.error(parseApiError(e)); throw e })}
          selectionPanel={(editor) => <BlankOptions editor={editor} />}
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

// Options of the blank selected in the editor (click a line or a box): a line can be a DATE (date picker online,
// JJ/MM/AAAA in the PDF); a line or a box can be SAVED into the member's file when the form is signed online.
function BlankOptions({ editor }: { editor: Editor }) {
  const sel = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      // A clicked atom node is a NodeSelection, which carries `.node` (duck-typed: @tiptap/pm isn't a direct dependency).
      const node = (e.state.selection as { node?: { type: { name: string }; attrs: Record<string, unknown> } }).node ?? null
      if (!node || (node.type.name !== 'fillLine' && node.type.name !== 'fillBox')) return null
      return { type: node.type.name, date: !!node.attrs.date, save: (node.attrs.save as string | null) ?? '' }
    },
  })
  if (!sel) return null
  const update = (attrs: Record<string, unknown>) => editor.chain().focus().updateAttributes(sel.type, attrs).run()
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-accent/5 px-3 py-2 text-xs">
      <span className="font-medium">{sel.type === 'fillLine' ? 'Ligne sélectionnée' : 'Cadre sélectionné'} :</span>
      {sel.type === 'fillLine' && (
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={sel.date} onChange={(e) => update({ date: e.target.checked })} />
          Date (calendrier)
        </label>
      )}
      <span className="flex items-center gap-1.5">
        Enregistrer dans la fiche :
        <Select value={sel.save || 'none'} onValueChange={(v) => update({ save: v === 'none' ? null : v })}>
          <SelectTrigger className="h-7 w-auto min-w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Non</SelectItem>
            {SAVE_TARGETS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </span>
    </div>
  )
}
