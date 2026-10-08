// Live result of a CSS media query (e.g. '(min-width: 768px)'), updated when the window crosses it. Use it to
// MOUNT only the layout that is visible — a list rendered twice (a desktop table + a hidden phone card list) costs
// twice the rendering for nothing.
import { useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
