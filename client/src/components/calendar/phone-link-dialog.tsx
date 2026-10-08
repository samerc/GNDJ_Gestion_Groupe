// « Dans mon téléphone »: the member's personal calendar link (iCal). Subscribing in the phone's calendar app shows
// the same events there, kept up to date by the phone (a few times a day). « Nouveau lien » cuts off the old one.
import { toast } from 'sonner'
import { Smartphone, RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CopyButton } from '@/components/shared/copy-button'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { confirmAsync } from '@/lib/confirm'
import { parseApiError } from '@/lib/error-utils'
import { useCalendarFeedLink, useResetCalendarFeedLink } from '@/services/calendar-service'

export function PhoneLinkDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  // The personal link is only fetched while the dialog is open.
  const { data: url, error } = useCalendarFeedLink(open)
  const reset = useResetCalendarFeedLink()

  const renew = async () => {
    const ok = await confirmAsync({
      title: 'Créer un nouveau lien ?', description: "L'ancien lien ne fonctionnera plus : le calendrier ajouté avec lui ne se mettra plus à jour.",
      confirmLabel: 'Nouveau lien', destructive: true,
    })
    if (!ok) return
    try { await reset.mutateAsync(); toast.success('Nouveau lien créé.') } catch (e) { toast.error(parseApiError(e)) }
  }
  // webcal: makes iOS / macOS offer « S'abonner » directly instead of downloading the .ics file.
  const webcal = url?.replace(/^https?:/, 'webcal:')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-primary" />Le calendrier dans mon téléphone</DialogTitle>
          <DialogDescription>Ajoutez ce lien à l'agenda de votre téléphone : vos événements, réunions et dates importantes y apparaîtront et se mettront à jour tout seuls.</DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{parseApiError(error)}</p> : !url ? <LoadingSpinner /> : (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2">
              <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <CopyButton value={url} />
            </div>
            {webcal && <Button asChild className="w-full"><a href={webcal}>Ajouter à mon agenda</a></Button>}
            <div className="space-y-2 rounded-lg bg-muted/50 p-3">
              <p><strong>iPhone :</strong> appuyez sur « Ajouter à mon agenda », puis « S'abonner ».</p>
              <p><strong>Android (Google Agenda) :</strong> copiez le lien, ouvrez calendar.google.com sur un ordinateur → « Autres agendas » → « + » → « À partir de l'URL », collez le lien.</p>
            </div>
            <p className="text-xs text-muted-foreground">Ce lien est personnel : ne le partagez pas. Si vous l'avez partagé par erreur, créez-en un nouveau.</p>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={renew} disabled={!url || reset.isPending}><RefreshCw className="mr-1.5 h-4 w-4" />Nouveau lien</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
