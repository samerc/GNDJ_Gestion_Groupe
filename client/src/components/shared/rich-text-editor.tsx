import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Link as LinkIcon, Undo, Redo, Variable, Image as ImageIcon, Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  content: string
  onChange: (html: string) => void
  variables?: { key: string; label: string }[] // per-module {{placeholders}} for the "Variable" dropdown
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
export function RichTextEditor({ content, onChange, variables, placeholder, className, onImageUpload }: Props) {
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
      Image.configure({ inline: false, HTMLAttributes: { class: 'rounded-lg' } }),
      Placeholder.configure({ placeholder: placeholder ?? 'Commencez à écrire...' }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

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

        {/* Variable insertion */}
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
      </div>

      {/* Editor — capped height with internal scroll so long content never pushes the dialog's actions off-screen */}
      <EditorContent editor={editor} className="prose prose-sm max-w-none p-3 min-h-[200px] max-h-[45vh] overflow-y-auto focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[180px]" />
    </div>
  )
}
