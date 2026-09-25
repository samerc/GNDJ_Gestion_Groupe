import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Accessible dropdown for the PUBLIC site's desktop nav (disclosure pattern — the right one for site navigation,
// not an ARIA "menu"). Mouse: opens on hover. Keyboard: Enter/Space/↓ open it (↓ also focuses the first link),
// ↑/↓ move between links, Escape closes and returns focus to the button, Tab past the last link closes it.
// Screen readers get aria-expanded/aria-controls. It also closes after a link is followed (route change).
export function NavDropdown({ label, align = 'left', panelClassName, children }: {
  label: ReactNode
  align?: 'left' | 'right'
  panelClassName?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  // Close after navigating (a clicked link keeps focus inside, which used to keep the panel open).
  const { pathname } = useLocation()
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) { setLastPath(pathname); setOpen(false) }

  // Close when focus or a click lands outside (e.g. Tab past the last link, or a click elsewhere on the page).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const links = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a[href]') ?? [])
  const focusLink = (i: number) => { const l = links(); if (l.length) l[(i + l.length) % l.length].focus() }

  const onButtonKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); requestAnimationFrame(() => focusLink(0)) }
    else if (e.key === 'Escape') setOpen(false)
  }
  const onPanelKey = (e: React.KeyboardEvent) => {
    const l = links(); const i = l.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); focusLink(i + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) buttonRef.current?.focus(); else focusLink(i - 1) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); buttonRef.current?.focus() }
  }

  return (
    <div ref={rootRef} className="relative"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onBlur={(e) => { if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false) }}>
      <button ref={buttonRef} type="button" aria-expanded={open} aria-controls={panelId}
        onClick={() => setOpen((o) => !o)} onKeyDown={onButtonKey}
        className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {label} <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      <div ref={panelRef} id={panelId} onKeyDown={onPanelKey} hidden={!open}
        className={cn('absolute top-full z-50 rounded-xl border border-border bg-card p-1.5 shadow-elevated',
          align === 'right' ? 'right-0' : 'left-0', panelClassName)}>
        {children}
      </div>
    </div>
  )
}
