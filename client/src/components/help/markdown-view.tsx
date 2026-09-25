// Renders a guide's Markdown (docs/help) as a styled article:
//  - headings get stable ids (anchors for the table of contents / search hits / cross-guide links)
//  - ![…](img/x.png) screenshots are fetched through the API with the caller's auth (blob URLs)
//  - ```mermaid blocks become diagrams (mermaid is loaded only when a guide actually contains one)
//  - blockquotes starting with 💡 / ⚠️ / ✅ become coloured callouts
//  - links to another guide (`guide-membre.md#section`) navigate inside the Aide page
// The HTML comes from our own repo, but it is still sanitised (DOMPurify) like every other injected HTML.
import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router'
import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import type { AxiosInstance } from 'axios'
import { headingId } from '@/services/help-service'
import { cn } from '@/lib/utils'

const md = new Marked({ gfm: true, breaks: false })
md.use({
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens)
      const plain = text.replace(/<[^>]+>/g, '')
      return `<h${depth} id="${headingId(plain)}">${text}</h${depth}>\n`
    },
    code({ text, lang }) {
      if (lang === 'mermaid') return `<div class="help-mermaid" data-src="${encodeURIComponent(text)}"></div>\n`
      const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return `<pre><code>${esc}</code></pre>\n`
    },
    image({ href, title, text }) {
      // Relative guide images → loaded through the API (auth); anything else is left out on purpose.
      const m = /^(?:\.\/)?img\/([^?#]+)$/.exec(href ?? '')
      if (!m) return ''
      const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
      const cap = title || text
      return `<figure><img data-help-img="${attr(m[1])}" alt="${attr(text)}" />${cap ? `<figcaption>${attr(cap)}</figcaption>` : ''}</figure>`
    },
  },
})

const CALLOUTS: [string, string][] = [
  ['💡', 'help-tip'],
  ['⚠️', 'help-warn'],
  ['✅', 'help-ok'],
]

let mermaidReady: Promise<typeof import('mermaid').default> | null = null
function loadMermaid() {
  mermaidReady ??= import('mermaid').then((m) => {
    // GNDJ colours (navy borders, light-blue boxes); 'strict' = no HTML/click handlers inside diagrams.
    m.default.initialize({
      startOnLoad: false, securityLevel: 'strict', theme: 'base', fontFamily: 'inherit',
      themeVariables: {
        primaryColor: '#e8eef7', primaryBorderColor: '#1c2b4a', primaryTextColor: '#0f172a',
        secondaryColor: '#e6f4f1', tertiaryColor: '#fff7e6', lineColor: '#64748b', fontSize: '15px',
      },
    })
    return m.default
  })
  return mermaidReady
}

interface Props {
  markdown: string
  client: AxiosInstance
  // Base path for cross-guide links ("/aide" in the app, "/guide" for the public page).
  linkBase?: string
  className?: string
  // Called once every image and diagram has rendered (the print view waits for it).
  onReady?: () => void
}

export function MarkdownView({ markdown, client, linkBase = '/aide', className, onReady }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const html = useMemo(() => {
    const raw = md.parse(markdown, { async: false }) as string
    return DOMPurify.sanitize(raw, { ADD_ATTR: ['data-help-img', 'data-src'], USE_PROFILES: { html: true } })
  }, [markdown])

  useEffect(() => {
    const root = ref.current
    if (!root) return
    let cancelled = false
    const urls: string[] = []

    // Callouts.
    root.querySelectorAll('blockquote').forEach((bq) => {
      const t = bq.textContent?.trim() ?? ''
      const hit = CALLOUTS.find(([emoji]) => t.startsWith(emoji))
      if (hit) bq.classList.add('help-callout', hit[1])
    })

    // Images through the API (keeps role-restricted screenshots behind auth).
    const images = Array.from(root.querySelectorAll<HTMLImageElement>('img[data-help-img]')).map(async (img) => {
      try {
        const res = await client.get(`/help/img/${encodeURIComponent(img.dataset.helpImg!)}`, { responseType: 'blob' })
        if (cancelled) return
        const url = URL.createObjectURL(res.data)
        urls.push(url)
        img.src = url
        await img.decode().catch(() => {})
      } catch { img.closest('figure')?.classList.add('help-img-missing') }
    })

    // Diagrams.
    const blocks = Array.from(root.querySelectorAll<HTMLDivElement>('.help-mermaid'))
    const diagrams = blocks.length === 0 ? [] : [loadMermaid().then(async (mermaid) => {
      for (const [i, el] of blocks.entries()) {
        if (cancelled) return
        try {
          const { svg } = await mermaid.render(`help-mmd-${Date.now()}-${i}`, decodeURIComponent(el.dataset.src ?? ''))
          el.innerHTML = svg
        } catch { el.textContent = 'Diagramme indisponible.' }
      }
    })]

    Promise.all([...images, ...diagrams]).then(() => { if (!cancelled) onReady?.() })
    return () => { cancelled = true; urls.forEach((u) => URL.revokeObjectURL(u)) }
  }, [html, client, onReady])

  // Cross-guide links (`other-guide.md#anchor`) and in-page anchors.
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    const href = a?.getAttribute('href')
    if (!a || !href || /^(https?:|mailto:|tel:)/i.test(href)) return
    e.preventDefault()
    if (href.startsWith('#')) {
      document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    const m = /^(?:\.\/)?([a-z0-9-]+)\.md(#.*)?$/i.exec(href)
    if (m) navigate(`${linkBase}/${m[1]}${m[2] ?? ''}`)
  }

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={cn('help-article max-w-none break-words leading-relaxed', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
