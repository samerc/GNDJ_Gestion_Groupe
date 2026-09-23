import { cn } from '@/lib/utils'

// Standard page body wrapper: consistent vertical rhythm (space-y-6) and an optional max-width for
// reading-oriented / member-facing pages. The app shell already provides the outer padding, so pages must
// NOT re-pad — just wrap their content in <Page>. `size`: full (default, data-dense admin), wide, narrow.
export function Page({
  children,
  size = 'full',
  className,
}: {
  children: React.ReactNode
  size?: 'full' | 'wide' | 'narrow'
  className?: string
}) {
  return (
    <div
      className={cn(
        'space-y-6',
        size === 'wide' && 'mx-auto w-full max-w-5xl',
        size === 'narrow' && 'mx-auto w-full max-w-3xl',
        className,
      )}
    >
      {children}
    </div>
  )
}
