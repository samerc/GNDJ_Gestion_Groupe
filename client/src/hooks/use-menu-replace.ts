// Android-app back behaviour for the INSTALLED app (PWA). In a plain browser every menu tap adds a history
// entry, so the phone's back button walks through every screen visited and the app never seems to close.
// In the installed app:
// - a menu tap made from anywhere but the dashboard REPLACES the current entry, so the history stays
//   [dashboard, current section]: back from any section returns to the dashboard, back from the dashboard
//   closes the app;
// - going HOME (logo, "Accueil"/"Mon unité") steps BACK to the dashboard at the bottom of the history instead
//   of adding a second copy of it (which would make one back press look like it did nothing).
// Screens opened from inside a section (a member, a detail page) still push, so back returns to the section.
// Browser tabs keep the normal behaviour.
import type React from 'react'
import { useNavigate } from 'react-router'
import { isStandalone } from '@/lib/pwa'

const ROOT_KEY = 'pwa-root-path'

// react-router keeps the history position in history.state.idx (0 = the entry the app was opened on).
function historyIdx(): number {
  const idx = (window.history.state as { idx?: number } | null)?.idx
  return typeof idx === 'number' ? idx : 0
}

// Called on every route change (AppLayout): remembers which page sits at the bottom of the history, so
// "go home" knows whether stepping back all the way lands on the dashboard.
export function rememberRootEntry(pathname: string) {
  if (historyIdx() !== 0) return
  try { sessionStorage.setItem(ROOT_KEY, pathname) } catch { /* private mode */ }
}

// onClick for a MENU link. Decided at tap time (not render time) so fast taps can't use a stale choice: in the
// installed app, away from the dashboard, the tap REPLACES the current entry.
export function useMenuClick(): (e: React.MouseEvent, path: string) => void {
  const navigate = useNavigate()
  return (e, path) => {
    if (!isStandalone() || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    if (window.location.pathname === '/dashboard' || window.location.pathname === path) return
    e.preventDefault()
    navigate(path, { replace: true })
  }
}

// onClick for a link to /dashboard (logo, "Mon unité"). No-op in a browser tab or when already home.
export function useGoHomeClick(): (e: React.MouseEvent) => void {
  const navigate = useNavigate()
  return (e) => {
    if (!isStandalone() || e.defaultPrevented || window.location.pathname === '/dashboard') return
    const idx = historyIdx()
    let root: string | null = null
    try { root = sessionStorage.getItem(ROOT_KEY) } catch { /* ignore */ }
    e.preventDefault()
    // Step back to the dashboard at the bottom of the history; otherwise (app opened on another page, e.g. from
    // a notification) replace the current entry with the dashboard.
    if (idx > 0 && root === '/dashboard') navigate(-idx)
    else navigate('/dashboard', { replace: true })
  }
}
