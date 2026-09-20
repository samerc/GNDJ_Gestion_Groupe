import { useEffect, useState } from 'react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Download, Share } from 'lucide-react'
import { canInstall, onInstallChange, promptInstall, isStandalone, isIos } from '@/lib/pwa'

// "Installer l'application" entry for the account menu. On Android/desktop it fires the browser's native install
// prompt; on iOS (no prompt API) it opens the "Add to Home Screen" instructions. Renders nothing when the app is
// already running installed, or when there's no install prompt available (already installed / unsupported browser).
export function PwaInstallMenuItem() {
  const [installable, setInstallable] = useState(canInstall())
  const [iosOpen, setIosOpen] = useState(false)

  // The beforeinstallprompt event can arrive after mount — re-render when availability changes.
  useEffect(() => onInstallChange(() => setInstallable(canInstall())), [])

  if (isStandalone()) return null // already the installed app
  const ios = isIos()
  if (!ios && !installable) return null // no way to install here

  return (
    <>
      <DropdownMenuItem
        onSelect={ios ? (e) => { e.preventDefault(); setIosOpen(true) } : () => { void promptInstall() }}
      >
        <Download className="mr-2 h-4 w-4" />
        Installer l'application
      </DropdownMenuItem>

      {ios && (
        <Dialog open={iosOpen} onOpenChange={setIosOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Installer l'application</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <p>Pour ajouter GNDJ Scout à l'écran d'accueil de votre iPhone ou iPad :</p>
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>Ouvrez ce site dans <strong>Safari</strong>.</li>
                <li>Touchez le bouton <strong>Partager</strong> <Share className="inline h-4 w-4 align-text-bottom" /> (barre du bas).</li>
                <li>Faites défiler puis choisissez <strong>« Sur l'écran d'accueil »</strong>.</li>
                <li>Touchez <strong>« Ajouter »</strong> en haut à droite.</li>
              </ol>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
