// Custom TipTap nodes that turn the document-template editor into a lightweight FORM BUILDER. Four leaf nodes:
//  • memberField — an auto-filled member field shown as a coloured pill (« Prénom »); serialises to
//    <span data-field="prenom">; the PDF renderer resolves it to the member's value.
//  • fillLine — a clean thin underline the member writes on (short/long); <span data-fill data-w="N"> → the
//    renderer draws an inline underline of that width (no ugly dotted lines).
//  • fillBox — a bordered rectangle for longer answers (remarques, adresse…); <div data-box data-h="N"> → a
//    drawn box block in the PDF.
//  • checkbox — a real drawn checkbox ☐; <span data-checkbox> → the renderer draws an empty square (the PDF
//    font has no ballot-box glyph, so it must be drawn).
// A fill line can be a DATE (data-date → date picker online, JJ/MM/AAAA in the PDF), and a line or box can be
// SAVED into the member's file when the form is signed online (data-save = allergies | medicalNotes).
// Each renders as a real form element in the editor (via a class + inline size) AND to a data-attribute the
// backend renderer understands. Kept out of the shared RichTextEditor so email/CMS editors are unaffected.
import { Node, mergeAttributes } from '@tiptap/core'

// An auto-filled member field, displayed as a pill with its French label.
export const MemberFieldNode = Node.create({
  name: 'memberField',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      field: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-field') || '',
        renderHTML: (attrs) => ({ 'data-field': attrs.field }),
      },
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-label') || el.textContent || '',
        renderHTML: (attrs) => ({ 'data-label': attrs.label }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-field]' }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'gndj-field' }), node.attrs.label || node.attrs.field]
  },
})

// A thin underline the member writes on (attr w = pixel width). With date=true (<span data-fill data-date>) the
// online form shows a date picker for it and the PDF prints the answer as JJ/MM/AAAA.
export const FillLineNode = Node.create({
  name: 'fillLine',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      w: {
        default: 200,
        parseHTML: (el) => parseInt(el.getAttribute('data-w') || '200', 10) || 200,
        renderHTML: (attrs) => ({ 'data-w': attrs.w }),
      },
      date: {
        default: false,
        parseHTML: (el) => el.hasAttribute('data-date'),
        renderHTML: (attrs) => (attrs.date ? { 'data-date': '1' } : {}),
      },
      save: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-save'),
        renderHTML: (attrs) => (attrs.save ? { 'data-save': attrs.save } : {}),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-fill]' }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-fill': '1', class: node.attrs.date ? 'gndj-fill gndj-date' : 'gndj-fill', style: `min-width:${node.attrs.w}px` }), ' ']
  },
})

// A real checkbox (drawn as an empty square).
export const CheckboxNode = Node.create({
  name: 'checkbox',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'span[data-checkbox]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-checkbox': '1', class: 'gndj-checkbox' })]
  },
})

// A vertical spacer to add breathing room between paragraphs (attr h = pixel height). Block-level.
export const SpacerNode = Node.create({
  name: 'spacer',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      h: {
        default: 20,
        parseHTML: (el) => parseInt(el.getAttribute('data-h') || '20', 10) || 20,
        renderHTML: (attrs) => ({ 'data-h': attrs.h }),
      },
      save: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-save'),
        renderHTML: (attrs) => (attrs.save ? { 'data-save': attrs.save } : {}),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-spacer]' }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-spacer': '1', class: 'gndj-spacer', style: `height:${node.attrs.h}px` })]
  },
})

// A left/right split marker: everything BEFORE it on the paragraph stays left, everything AFTER is pushed to
// the right margin (e.g. "Fait à Beyrouth, le [date]  ⇥  Signature : ____"). Inline atom; the PDF renderer
// splits the paragraph's inline content at this marker into a two-column Row.
export const SplitPointNode = Node.create({
  name: 'splitPoint',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'span[data-split]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-split': '1', class: 'gndj-split' }), '⇥']
  },
})

// A bordered box for longer handwritten answers (attr h = pixel height). Block-level.
export const FillBoxNode = Node.create({
  name: 'fillBox',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      h: {
        default: 70,
        parseHTML: (el) => parseInt(el.getAttribute('data-h') || '70', 10) || 70,
        renderHTML: (attrs) => ({ 'data-h': attrs.h }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-box]' }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-box': '1', class: 'gndj-box', style: `height:${node.attrs.h}px` })]
  },
})

// Member-file targets a blank can be saved into (key = data-save value, matched by the backend).
export const SAVE_TARGETS: { value: string; label: string }[] = [
  { value: 'allergies', label: 'Allergies (onglet Médical)' },
  { value: 'medicalNotes', label: 'Remarques médicales (onglet Médical)' },
]

// The bundle passed to the RichTextEditor's `extraExtensions` prop by the document-template builder.
export const FORM_NODES = [MemberFieldNode, FillLineNode, CheckboxNode, SplitPointNode, SpacerNode, FillBoxNode]
