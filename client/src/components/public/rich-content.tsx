import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'

// Renders admin-authored CMS HTML safely. DOMPurify strips scripts/event-handlers/dangerous URLs;
// the `.prose-*` utilities give article-style typography. Defense-in-depth: the backend also
// length-caps the HTML and the abuse middleware rejects script/event-handler payloads on write.
export function RichContent({ html, className }: { html: string; className?: string }) {
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
  return (
    <div
      className={cn(
        'max-w-none leading-relaxed break-words',
        '[&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight',
        '[&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold',
        '[&_p]:my-4 [&_p]:text-foreground/90',
        '[&_a]:text-primary [&_a]:underline hover:[&_a]:no-underline [&_a]:break-words',
        '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1',
        '[&_strong]:font-semibold [&_img]:rounded-xl [&_img]:my-6 [&_img]:max-w-full [&_img]:h-auto',
        // Mobile: keep author-pasted wide tables / preformatted blocks from overflowing the viewport.
        '[&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_pre]:overflow-x-auto',
        '[&_blockquote]:border-l-4 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
        className
      )}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
