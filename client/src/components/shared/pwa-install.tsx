import { lazy, Suspense, useState } from 'react'
import { useLocation } from 'react-router'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, X, Smartphone } from 'lucide-react'
import { promptInstall, bannerDismissed, dismissBanner, type InstallGuide } from '@/lib/pwa'
import { useInstallGuide } from '@/hooks/use-install-guide'
import { usePwaEnabled } from '@/hooks/use-pwa-audience'
import { useAuthStore } from '@/stores/auth-store'

// DESKTOP nudge: the app's real value is mobile (home screen + push), so instead of a desktop-install prompt we
// show a QR the user scans with their PHONE — it opens the site there, where the mobile install banner appears.
// The QR encodes this site's origin (e.g. https://gndj.org); rendered on white so it scans on a dark card.
// The QR library is loaded only when a QR is actually shown (not part of every page's first load).
const QRCodeSVG = lazy(() => import('qrcode.react').then((m) => ({ default: m.QRCodeSVG })))

function MobileInstallQr() {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 rounded-lg border bg-white p-1.5">
        <Suspense fallback={<div className="h-[92px] w-[92px]" />}>
          <QRCodeSVG value={window.location.origin} size={92} />
        </Suspense>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Installez l'app sur votre téléphone</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          L'application GNDJ est optimisée pour le mobile. Scannez ce code avec l'appareil photo de votre téléphone pour l'installer.
        </p>
      </div>
    </div>
  )
}

// Device/browser-specific install steps + (when available) a native "Installer" button. Reused by the account
// menu, the install banner, and the welcome-tour slide, so the instructions always match the user's device.
export function PwaInstallGuide({ guide, onDone }: { guide: InstallGuide; onDone?: () => void }) {
  return (
    <div className="space-y-3 text-left">
      <p className="text-sm text-muted-foreground">{guide.intro}</p>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm">
        {guide.steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      {guide.canPrompt && (
        <Button onClick={async () => { const ok = await promptInstall(); if (ok) onDone?.() }}>
          <Download className="mr-2 h-4 w-4" />Installer maintenant
        </Button>
      )}
    </div>
  )
}

// A controlled dialog that shows the install guide (used when there's no direct native prompt, e.g. iOS).
export function PwaInstallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const guide = useInstallGuide()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Installer l'application</DialogTitle></DialogHeader>
        <PwaInstallGuide guide={guide} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

// "Installer l'application" entry for the account menu. On Android/desktop with a native prompt it installs
// directly; otherwise it opens the guide dialog (iOS, or a browser that needs manual steps). Self-hides when
// already installed or unsupported.
export function PwaInstallMenuItem() {
  const guide = useInstallGuide()
  const pwaEnabled = usePwaEnabled()
  const [dialogOpen, setDialogOpen] = useState(false)
  if (!pwaEnabled || guide.installed || !guide.supported) return null
  return (
    <>
      <DropdownMenuItem onSelect={guide.canPrompt ? () => { void promptInstall() } : (e) => { e.preventDefault(); setDialogOpen(true) }}>
        <Download className="mr-2 h-4 w-4" />
        Installer l'application
      </DropdownMenuItem>
      <PwaInstallDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}

// One-time dismissible banner shown after login to members who haven't installed the app (and whose browser
// supports it). Fixed to the bottom (thumb-reachable on a phone). Dismissal is remembered per device and the
// banner quietly re-appears after ~2 weeks. Android/desktop get a direct "Installer" button; iOS / manual
// browsers get "Voir comment" → the instructions dialog.
export function PwaInstallBanner() {
  const guide = useInstallGuide()
  const pwaEnabled = usePwaEnabled()
  const appInstalled = useAuthStore((s) => !!s.user?.appInstalled)
  const { pathname } = useLocation()
  const [dismissed, setDismissed] = useState(bannerDismissed())
  const [dialogOpen, setDialogOpen] = useState(false)
  const isDesktop = guide.platform === 'desktop' || guide.platform === 'unsupported'

  // The dashboard shows its own prominent install CARD; don't double up with the floating banner there.
  if (pathname === '/dashboard' || !pwaEnabled || guide.installed || dismissed) return null

  const close = () => { dismissBanner(); setDismissed(true) }

  // DESKTOP → a QR to install on the phone (the app's value is mobile). Suppressed once the server flag says the
  // member already opened the app on a device. The desktop-install-in-a-window option stays in the account menu.
  if (isDesktop) {
    if (appInstalled) return null
    return (
      <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-xl border bg-card p-3 shadow-elevated sm:inset-x-auto sm:right-4 sm:left-auto sm:w-96">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1"><MobileInstallQr /></div>
          <button type="button" onClick={close} aria-label="Fermer" className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  // MOBILE → the normal install banner (needs a supported browser).
  if (!guide.supported) return null
  const install = async () => { await promptInstall(); close() } // hide after any prompt interaction

  return (
    <>
      <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-xl border bg-card p-3 shadow-elevated sm:inset-x-auto sm:right-4 sm:left-auto sm:w-96">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Installer l'application GNDJ</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ajoutez GNDJ à votre écran d'accueil pour un accès rapide, comme une vraie application.
            </p>
            <div className="mt-2 flex gap-2">
              {guide.canPrompt ? (
                <Button size="sm" onClick={install}><Download className="mr-1.5 h-4 w-4" />Installer</Button>
              ) : (
                <Button size="sm" onClick={() => setDialogOpen(true)}><Download className="mr-1.5 h-4 w-4" />Voir comment</Button>
              )}
              <Button size="sm" variant="ghost" onClick={close}>Plus tard</Button>
            </div>
          </div>
          <button type="button" onClick={close} aria-label="Fermer" className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <PwaInstallDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}

// Prominent, dismissible install card shown at the TOP of the dashboard (a stronger "call to install" than the
// floating banner, which is suppressed on /dashboard to avoid a double prompt). Shares the same dismiss state as
// the banner, so dismissing either one quiets install prompts everywhere for ~2 weeks. Same gates: maîtrise
// pilot (usePwaEnabled), not already installed, supported browser.
export function PwaInstallCard() {
  const guide = useInstallGuide()
  const pwaEnabled = usePwaEnabled()
  const appInstalled = useAuthStore((s) => !!s.user?.appInstalled)
  const [dismissed, setDismissed] = useState(bannerDismissed())
  const [dialogOpen, setDialogOpen] = useState(false)
  const isDesktop = guide.platform === 'desktop' || guide.platform === 'unsupported'

  if (!pwaEnabled || guide.installed || dismissed) return null

  const close = () => { dismissBanner(); setDismissed(true) }

  // DESKTOP → a QR to install on the phone (see PwaInstallBanner). Hidden once the member has it on a device.
  if (isDesktop) {
    if (appInstalled) return null
    return (
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/10 to-primary/5 p-4 sm:p-5">
        <button type="button" onClick={close} aria-label="Fermer" className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
        <div className="pr-6"><MobileInstallQr /></div>
      </div>
    )
  }

  // MOBILE → the prominent install card (needs a supported browser).
  if (!guide.supported) return null
  const install = async () => { await promptInstall(); close() } // hide after any prompt interaction

  return (
    <>
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/10 to-primary/5 p-4 sm:p-5">
        <button type="button" onClick={close} aria-label="Fermer" className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-4 pr-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm">
            <Smartphone className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold sm:text-base">Installez l'application GNDJ</h3>
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
              Ajoutez GNDJ à votre écran d'accueil pour un accès rapide et les notifications, comme une vraie application.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {guide.canPrompt ? (
                <Button size="sm" onClick={install}><Download className="mr-1.5 h-4 w-4" />Installer</Button>
              ) : (
                <Button size="sm" onClick={() => setDialogOpen(true)}><Download className="mr-1.5 h-4 w-4" />Voir comment installer</Button>
              )}
              <Button size="sm" variant="ghost" onClick={close}>Plus tard</Button>
            </div>
          </div>
        </div>
      </div>
      <PwaInstallDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
