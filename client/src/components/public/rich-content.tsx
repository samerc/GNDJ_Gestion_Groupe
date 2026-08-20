import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'

// Harden every link DOMPurify lets through: any anchor that opens a new tab (target=_blank, or an
// external http(s) link) gets rel="noopener noreferrer" so the opened page can't reach window.opener
// (reverse-tabnabbing) and no referrer leaks. Registered once at module scope (idempotent).
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    const href = node.getAttribute('href') || ''
    if (node.getAttribute('target') === '_blank' || /^https?:\/\//i.test(href)) {
      node.setAttribute('rel', 'noopener noreferrer')
    }
  }
})

// Renders admin-authored CMS HTML safely. DOMPurify strips scripts/event-handlers/dangerous URLs;
// the `[&_*]` utilities give article-style typography (the `prose` plugin isn't installed, so every
// element that the editor can produce is styled explicitly here — keep in sync with rich-text-editor.tsx).
// Defense-in-depth: the backend also length-caps the HTML and the abuse middleware rejects
// script/event-handler payloads on write.
export function RichContent({ html, className }: { html: string; className?: string }) {
  // Sanitizing is pure work over `html` — memoize so re-renders (theme, resize) don't re-run DOMPurify.
  const clean = useMemo(() => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }), [html])
  return (
    <div
      className={cn(
        'max-w-none leading-relaxed break-words',
        '[&_h1]:mt-8 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight',
        '[&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight',
        '[&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold',
        '[&_h4]:mt-4 [&_h4]:text-lg [&_h4]:font-semibold',
        '[&_p]:my-4 [&_p]:text-foreground/90',
        '[&_a]:text-primary [&_a]:underline hover:[&_a]:no-underline [&_a]:break-words',
        '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1',
        '[&_strong]:font-semibold [&_img]:rounded-xl [&_img]:my-6 [&_img]:max-w-full [&_img]:h-auto',
        '[&_hr]:my-8 [&_hr]:border-t [&_hr]:border-border',
        // Mobile: keep author-pasted wide tables / preformatted blocks from overflowing the viewport.
        '[&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_pre]:overflow-x-auto',
        '[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold',
        '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2',
        '[&_blockquote]:border-l-4 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
        className
      )}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
