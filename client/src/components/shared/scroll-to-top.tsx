import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

// A floating "back to top" button for long pages (e.g. the document-verification matrix). The app scrolls INSIDE
// <main> (see AppLayout), not the window, so it watches that container (falling back to the window) and appears
// once you've scrolled past `threshold`px. Fixed bottom-right, below dialogs (z-40 < the z-50 dialog overlay).
export function ScrollToTop({ threshold = 400 }: { threshold?: number }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = document.querySelector('main')
    const onScroll = () => setVisible((el ? el.scrollTop : window.scrollY) > threshold)
    onScroll() // initialize (e.g. when landing already scrolled)
    if (el) el.addEventListener('scroll', onScroll, { passive: true })
    else window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (el) el.removeEventListener('scroll', onScroll)
      else window.removeEventListener('scroll', onScroll)
    }
  }, [threshold])

  const toTop = () => {
    const el = document.querySelector('main')
    ;(el ?? window).scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!visible) return null
  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Retour en haut"
      title="Retour en haut"
      className={cn(
        'fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full',
        'bg-primary text-primary-foreground shadow-lg ring-1 ring-black/5 transition hover:brightness-110',
      )}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  )
}
