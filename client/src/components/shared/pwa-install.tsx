import { useState } from 'react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, X, Smartphone } from 'lucide-react'
import { promptInstall, isStandalone, bannerDismissed, dismissBanner, type InstallGuide } from '@/lib/pwa'
import { useInstallGuide } from '@/hooks/use-install-guide'
import { usePwaEnabled } from '@/hooks/use-pwa-audience'

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
  if (!pwaEnabled || isStandalone() || !guide.supported) return null
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
  const [dismissed, setDismissed] = useState(bannerDismissed())
  const [dialogOpen, setDialogOpen] = useState(false)

  if (!pwaEnabled || isStandalone() || !guide.supported || dismissed) return null

  const close = () => { dismissBanner(); setDismissed(true) }
  const install = async () => { await promptInstall(); close() } // hide after any prompt interaction

  return (
    <>
      <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md rounded-xl border bg-card p-3 shadow-elevated sm:inset-x-auto sm:right-4 sm:left-auto sm:w-96">
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
