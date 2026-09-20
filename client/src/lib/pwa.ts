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

// Device/browser-specific install instructions, so the tour + banner + menu show the RIGHT steps for the user
// (iOS Safari "Partager → Sur l'écran d'accueil" has no button; Android Chrome/Samsung/Firefox differ; desktop
// Chrome/Edge uses the address-bar icon). `canPrompt` = a native prompt is available now (show an Installer
// button); `supported` = installation is possible on this browser at all (drives whether we even offer it).
export interface InstallGuide {
  supported: boolean
  canPrompt: boolean
  platform: 'ios' | 'android' | 'desktop' | 'unsupported'
  intro: string
  steps: string[]
}

export function getInstallGuide(): InstallGuide {
  const ua = navigator.userAgent
  const prompt = canInstall()

  if (isIos()) {
    // On iOS, installation ("Add to Home Screen") is ONLY possible from Safari — no install API in any browser.
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(ua)
    return isSafari
      ? { supported: true, canPrompt: false, platform: 'ios',
          intro: "Sur iPhone ou iPad, ajoutez GNDJ à votre écran d'accueil depuis Safari :",
          steps: [
            "Touchez le bouton Partager (le carré avec une flèche vers le haut, en bas de l'écran).",
            "Faites défiler puis choisissez « Sur l'écran d'accueil ».",
            "Touchez « Ajouter » en haut à droite.",
          ] }
      : { supported: true, canPrompt: false, platform: 'ios',
          intro: "Sur iPhone ou iPad, l'installation se fait depuis Safari :",
          steps: [
            "Ouvrez ce site dans Safari (l'installation n'est pas possible depuis ce navigateur).",
            "Touchez Partager, puis « Sur l'écran d'accueil ».",
            "Touchez « Ajouter ».",
          ] }
  }

  if (/Android/.test(ua)) {
    if (prompt) return { supported: true, canPrompt: true, platform: 'android',
      intro: "Installez GNDJ comme une application :",
      steps: ["Touchez « Installer » ci-dessous.", "Confirmez « Installer » (ou « Ajouter »)."] }
    if (/SamsungBrowser/.test(ua)) return { supported: true, canPrompt: false, platform: 'android',
      intro: "Ajoutez GNDJ à votre écran d'accueil :",
      steps: ["Ouvrez le menu du navigateur.", "Choisissez « Ajouter la page à », puis « Écran d'accueil »."] }
    if (/Firefox/.test(ua)) return { supported: true, canPrompt: false, platform: 'android',
      intro: "Installez GNDJ :",
      steps: ["Ouvrez le menu (⋮).", "Choisissez « Installer » ou « Ajouter à l'écran d'accueil »."] }
    return { supported: true, canPrompt: false, platform: 'android',
      intro: "Ajoutez GNDJ à votre écran d'accueil :",
      steps: ["Ouvrez le menu du navigateur (⋮, en haut à droite).", "Choisissez « Installer l'application » ou « Ajouter à l'écran d'accueil »."] }
  }

  // Desktop
  if (prompt) return { supported: true, canPrompt: true, platform: 'desktop',
    intro: "Installez GNDJ sur votre ordinateur :",
    steps: ["Cliquez sur « Installer » ci-dessous.", "Confirmez dans la fenêtre du navigateur."] }
  if (/Edg\//.test(ua) || /Chrome\//.test(ua)) return { supported: true, canPrompt: false, platform: 'desktop',
    intro: "Installez GNDJ sur votre ordinateur :",
    steps: [
      "Cliquez sur l'icône d'installation dans la barre d'adresse (à droite de l'adresse).",
      "Ou ouvrez le menu (⋮, en haut à droite) puis « Installer GNDJ… ».",
      "Si vous ne voyez aucune de ces options, ouvrez le site directement dans Google Chrome ou Microsoft Edge — l'installation n'est pas disponible dans tous les navigateurs.",
    ] }
  // Firefox / Safari desktop etc. — no reliable PWA install; don't offer it.
  return { supported: false, canPrompt: false, platform: 'unsupported', intro: '', steps: [] }
}

// The install banner is dismissible + remembered per device; it quietly re-appears after this many days.
const BANNER_KEY = 'pwa-install-dismissed-at'
const RESHOW_DAYS = 14
export function bannerDismissed(): boolean {
  try {
    const t = Number(localStorage.getItem(BANNER_KEY))
    return t > 0 && Date.now() - t < RESHOW_DAYS * 86400000
  } catch { return false }
}
export function dismissBanner(): void {
  try { localStorage.setItem(BANNER_KEY, String(Date.now())) } catch { /* private mode / blocked storage */ }
}

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

  // Register the service worker (needed for installability AND Web Push). It does NO caching (pure network
  // passthrough), so it's safe in dev too and doesn't interfere with Vite HMR — and push can be tested in dev.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* SW is best-effort; ignore failures */ })
    })
  }
}
