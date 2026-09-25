// Master/detail pages on a PHONE (members list → member file): the detail replaces the list full-screen, so the
// phone's back button should close the member and return to the list — not leave the page. Opening a member on
// a small screen therefore adds ONE history entry (same URL, a `mobileDetail` marker in the router state); the
// back button pops it and the detail closes. The on-screen back arrow goes through the same history step, so the
// two stay in sync. On a larger screen (list + detail side by side) nothing is added to the history.
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

// Tailwind `md` = 768px: below it the pages show the list OR the detail, not both.
const isSmallScreen = () => {
  try { return window.matchMedia('(max-width: 767.98px)').matches } catch { return false }
}

export function useMobileDetail(initial: string | null = null) {
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(initial)
  const marker = (location.state as { mobileDetail?: string } | null)?.mobileDetail ?? null

  // Back button popped the marker entry while a member was open → close it (render-phase sync, no effect).
  const [prevMarker, setPrevMarker] = useState(marker)
  if (marker !== prevMarker) {
    setPrevMarker(marker)
    if (prevMarker && !marker && selectedId) setSelectedId(null)
  }

  const open = (id: string) => {
    setSelectedId(id)
    if (isSmallScreen() && marker !== id) {
      const state = { ...((location.state as object | null) ?? {}), mobileDetail: id }
      // Replace an existing marker (switching member) instead of stacking a second one.
      navigate(location.pathname + location.search + location.hash, { state, replace: !!marker })
    }
  }

  // Close from the UI (back arrow, member deleted): consume the marker entry if we added one.
  const close = () => {
    if (marker) navigate(-1)
    else setSelectedId(null)
  }

  return { selectedId, setSelectedId, open, close }
}
