// PWA support: makes the app installable ("Installer l'application") and records — as best a browser allows —
// which members run it as an installed app. Browsers give NO reliable installed/not-installed registry, so the
// tracking is a best-effort "installation détectée": we flag a member the first time they OPEN the app in
// standalone display-mode (works on iOS + Android) or when the browser fires `appinstalled` (Android/desktop).
// There is no way to know who did NOT install, nor to see installs across devices.
import apiClient from '@/lib/api-client'

// The captured beforeinstallprompt event (Android/desktop). Held here because it can fire before any component
// mounts; subscribers are notified so the install button can appear/disappear.
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(l => l())

// Running as an installed PWA? (standalone display-mode, or iOS Safari's navigator.standalone.)
export function isStandalone(): boolean {
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true
  } catch { return false }
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    // iPadOS 13+ reports as Mac; detect the touch-capable "Mac" as an iPad.
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function canInstall(): boolean { return deferredPrompt !== null }
export function onInstallChange(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb) } }

// Show the browser's native install prompt (Android/desktop). Returns true if the user accepted.
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false
  const e = deferredPrompt
  deferredPrompt = null
  notify()
  try {
    await e.prompt()
    const { outcome } = await e.userChoice
    return outcome === 'accepted'
  } catch { return false }
}

// Record (once per page load) that the current member runs the app as an installed PWA. Auth-only endpoint —
// resolves the caller's own member server-side; the server sets the flag only the first time (idempotent).
let reported = false
export async function reportPwaInstall(): Promise<void> {
  if (reported || !isStandalone()) return
  reported = true
  try { await apiClient.post('/my-profile/app-installed') }
  catch { reported = false } // e.g. not authenticated yet — allow a later retry
}

// Registered once at app start (main.tsx): capture the install prompt, listen for install, register the SW.
export function initPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // suppress the default mini-infobar; we surface our own button
    deferredPrompt = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
    // Fires at install time on Android/desktop — flag the member if they're signed in.
    void reportPwaInstall()
  })

  // The service worker is only needed for installability (network passthrough, no caching). Register it in
  // production builds only — in dev (Vite :5173) a SW just complicates hot-reload with no benefit.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* SW is best-effort; ignore failures */ })
    })
  }
}
