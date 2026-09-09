import { useEffect, useRef, useState } from 'react'
import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Color from '@tiptap/extension-color'
import { TextStyle, FontFamily, FontSize } from '@tiptap/extension-text-style'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Link as LinkIcon, Undo, Redo, Variable, Image as ImageIcon, Loader2, Plus
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Curated font choices for the document-template builder (widely-available Windows system fonts; the server
// resolves them, falling back to the default if a family is missing). Value = the CSS/QuestPDF family name.
const FONT_FAMILIES = [
  { label: 'Par défaut', value: '__default__' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Verdana', value: 'Verdana' },
  { label: 'Tahoma', value: 'Tahoma' },
  { label: 'Calibri', value: 'Calibri' },
  { label: 'Courier New', value: 'Courier New' },
]
// Point sizes offered in the size dropdown (stored as "Npt" so the PDF size == the number chosen).
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24]

// An "Insérer" dropdown action: insert literal text/token, or insert a custom node (form-builder elements).
export type InsertAction =
  | { kind: 'text'; value: string }
  | { kind: 'node'; name: string; attrs?: Record<string, unknown> }
export interface InsertMenuGroup {
  label: string
  items: { label: string; action: InsertAction }[]
}

interface Props {
  content: string
  onChange: (html: string) => void
  variables?: { key: string; label: string }[] // per-module {{placeholders}} for the "Variable" dropdown
  insertMenu?: InsertMenuGroup[] // richer grouped "Insérer" dropdown (member fields + form elements)
  extraExtensions?: Extensions // extra TipTap nodes/marks (e.g. the form-builder nodes)
  enableFont?: boolean // show font-family + font-size dropdowns (document-template builder only)
  placeholder?: string
  className?: string
  onImageUpload?: (file: File) => Promise<string> // when provided, enables the image-insert button; returns the served URL
}

// A single toolbar icon button (module-scope so its component identity is stable across renders).
function ToolbarButton({ onClick, active, children, title }: { onClick: () => void; active?: boolean; children: React.ReactNode; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex items-center justify-center h-8 w-8 rounded hover:bg-muted transition-colors',
        active && 'bg-muted text-primary'
      )}
    >
      {children}
    </button>
  )
}

// TipTap-based WYSIWYG editor used by the email-template editor and the public CMS (news/pages).
// Toolbar = formatting + lists + link + optional image upload + undo/redo + a module-specific
// variable-insertion dropdown. Emits HTML via onChange.
export function RichTextEditor({ content, onChange, variables, insertMenu, extraExtensions, enableFont, placeholder, className, onImageUpload }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Color,
      TextStyle,
      // Font family + size marks (TextStyle-based) — only when the host opts in, so email/CMS output is unchanged.
      ...(enableFont ? [FontFamily, FontSize] : []),
      Image.configure({ inline: false, HTMLAttributes: { class: 'rounded-lg' } }),
      Placeholder.configure({ placeholder: placeholder ?? 'Commencez à écrire...' }),
      ...(extraExtensions ?? []),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // Reactively read the current run's font family/size from the editor state, so the toolbar dropdowns reflect
  // the ACTUAL value at the cursor/selection (updates on every selection change, not just doc edits).
  const fontState = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      // The browser normalises a spaced family to the quoted form ("Times New Roman"); strip the quotes so the
      // value matches a dropdown item (otherwise the box shows the placeholder instead of the real font).
      fontFamily: ((e?.getAttributes('textStyle').fontFamily as string) || '').replace(/^["']|["']$/g, '') || '__default__',
      fontSize: (e?.getAttributes('textStyle').fontSize as string) || '__default__',
    }),
  }) ?? { fontFamily: '__default__', fontSize: '__default__' }

  // Sync content when prop changes externally (e.g., loading template)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false })
    }
  }, [content, editor])

  if (!editor) return null

  // Insert a {{key}} token at the cursor; the backend substitutes it when sending the email/rendering.
  const insertVariable = (variable: string) => {
    editor.chain().focus().insertContent(`{{${variable}}}`).run()
  }

  // Font family / size (TextStyle marks). "__default__" clears the mark. Reads the current run's value so the
  // dropdowns reflect the selection. When NOTHING is selected, apply to the WHOLE document (then restore the
  // cursor) — otherwise setMark on an empty selection only sets a stored mark (nothing visible/serialised), which
  // is why "I changed the font but the preview didn't change" happens.
  const currentFont = fontState.fontFamily
  const currentSize = fontState.fontSize
  const withScope = (build: (c: ReturnType<typeof editor.chain>) => ReturnType<typeof editor.chain>) => {
    const { from, empty } = editor.state.selection
    let c = editor.chain().focus()
    if (empty) c = c.selectAll()
    c = build(c)
    if (empty) c = c.setTextSelection(from) // restore the cursor so the doc isn't left fully highlighted
    c.run()
  }
  const setFont = (v: string) => withScope(c => (v === '__default__' ? c.unsetFontFamily() : c.setFontFamily(v)))
  const setSize = (v: string) => withScope(c => (v === '__default__' ? c.unsetFontSize() : c.setFontSize(v)))

  // Run an "Insérer" action from the grouped menu: literal text/token, or a custom node (form element).
  const runInsert = (action: InsertAction) => {
    if (action.kind === 'text') editor.chain().focus().insertContent(action.value).run()
    else editor.chain().focus().insertContent({ type: action.name, attrs: action.attrs ?? {} }).run()
  }

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file || !onImageUpload) return
    setUploading(true)
    try {
      const url = await onImageUpload(file)
      editor.chain().focus().setImage({ src: url }).run()
    } catch {
      // surfaced by the uploader's toast
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={cn('rounded-md border', className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b p-1.5 bg-muted/30">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Gras">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italique">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Souligne">
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Barre">
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>

        {/* Font family + size (document-template builder only) */}
        {enableFont && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <Select value={currentFont} onValueChange={setFont}>
              <SelectTrigger className="h-8 w-36 gap-1 text-xs" title="Police">
                <SelectValue placeholder="Police" />
              </SelectTrigger>
              <SelectContent>
                {FONT_FAMILIES.map(f => (
                  <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value === '__default__' ? undefined : f.value }}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={currentSize} onValueChange={setSize}>
              <SelectTrigger className="h-8 w-24 gap-1 text-xs" title="Taille du texte">
                <SelectValue placeholder="Taille" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">Par défaut</SelectItem>
                {FONT_SIZES.map(s => (
                  <SelectItem key={s} value={`${s}pt`}>{s} pt</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Aligner a gauche">
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Centrer">
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Aligner a droite">
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justifier">
          <AlignJustify className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Liste a puces">
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Liste numerotee">
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton onClick={() => {
          let url = window.prompt('URL du lien :')?.trim()
          if (!url) return
          // Normalize bare domains (e.g. "www.foo.com") so they aren't treated as relative dead links.
          if (!/^(https?:\/\/|mailto:|\/)/i.test(url)) url = `https://${url}`
          editor.chain().focus().setLink({ href: url }).run()
        }} active={editor.isActive('link')} title="Lien">
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>

        {onImageUpload && (
          <>
            <ToolbarButton onClick={() => fileInputRef.current?.click()} title="Insérer une image">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
            </ToolbarButton>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleImagePick} />
          </>
        )}

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Annuler">
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Retablir">
          <Redo className="h-4 w-4" />
        </ToolbarButton>

        {/* Variable insertion (email/CMS templates) */}
        {variables && variables.length > 0 && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <Select onValueChange={insertVariable}>
              <SelectTrigger className="h-8 w-auto gap-1 text-xs border-0 bg-transparent hover:bg-muted">
                <Variable className="h-3.5 w-3.5" />
                <span>Variable</span>
              </SelectTrigger>
              <SelectContent>
                {variables.map(v => (
                  <SelectItem key={v.key} value={v.key}>{v.label} ({`{{${v.key}}}`})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {/* Grouped "Insérer un champ" dropdown (form builder): member fields + fill-in elements. Controlled to ""
            so re-selecting the same item (e.g. two blank lines) always fires. */}
        {insertMenu && insertMenu.length > 0 && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <Select value="" onValueChange={(v) => {
              const [gi, ii] = v.split(':').map(Number)
              const action = insertMenu[gi]?.items[ii]?.action
              if (action) runInsert(action)
            }}>
              <SelectTrigger className="h-8 w-auto gap-1 border-primary/40 bg-primary/5 text-xs font-medium text-primary hover:bg-primary/10">
                <Plus className="h-3.5 w-3.5" />
                <span>Insérer un champ</span>
              </SelectTrigger>
              <SelectContent>
                {insertMenu.map((group, gi) => (
                  <SelectGroup key={gi}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.items.map((item, ii) => (
                      <SelectItem key={`${gi}:${ii}`} value={`${gi}:${ii}`}>{item.label}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {/* Editor — capped height with internal scroll so long content never pushes the dialog's actions off-screen.
          The `prose` classes are inert (no @tailwindcss/typography plugin), so list markers, headings and links
          are styled explicitly here to MATCH the public renderer (rich-content.tsx) — otherwise a numbered/bulleted
          list applied in the toolbar shows no markers in the editor even though it renders correctly once published. */}
      <EditorContent
        editor={editor}
        className={cn(
          'prose prose-sm max-w-none p-3 min-h-[200px] max-h-[45vh] overflow-y-auto focus:outline-none',
          '[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[180px]',
          '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-1',
          '[&_a]:text-primary [&_a]:underline [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold',
          '[&_hr]:my-4 [&_hr]:border-t [&_hr]:border-border',
          '[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:font-semibold [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
        )}
      />
    </div>
  )
}
