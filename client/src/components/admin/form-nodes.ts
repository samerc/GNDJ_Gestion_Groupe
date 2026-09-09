// Custom TipTap nodes that turn the document-template editor into a lightweight FORM BUILDER. Four leaf nodes:
//  • memberField — an auto-filled member field shown as a coloured pill (« Prénom »); serialises to
//    <span data-field="prenom">; the PDF renderer resolves it to the member's value.
//  • fillLine — a clean thin underline the member writes on (short/long); <span data-fill data-w="N"> → the
//    renderer draws an inline underline of that width (no ugly dotted lines).
//  • fillBox — a bordered rectangle for longer answers (remarques, adresse…); <div data-box data-h="N"> → a
//    drawn box block in the PDF.
//  • checkbox — a real drawn checkbox ☐; <span data-checkbox> → the renderer draws an empty square (the PDF
//    font has no ballot-box glyph, so it must be drawn).
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

// A thin underline the member writes on (attr w = pixel width).
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
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-fill]' }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-fill': '1', class: 'gndj-fill', style: `min-width:${node.attrs.w}px` }), ' ']
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
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-spacer]' }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-spacer': '1', class: 'gndj-spacer', style: `height:${node.attrs.h}px` })]
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

// The bundle passed to the RichTextEditor's `extraExtensions` prop by the document-template builder.
export const FORM_NODES = [MemberFieldNode, FillLineNode, CheckboxNode, SpacerNode, FillBoxNode]
