// « Annuler l'acceptation » — refuse a demande whose acceptance was already sent. Shows what will be deleted with the
// member file the demande created (login, post, documents, cotisations), asks the motif and whether the refusal email
// goes now. A reused existing file (« Déjà membre » confirmed) can't be undone here: the blocker is shown instead.
import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, UserX } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Callout } from '@/components/shared/callout'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { useEmailQueuedToast } from '@/hooks/use-email-queued-toast'
import { parseApiError } from '@/lib/error-utils'
import { useUndoAcceptance, useUndoAcceptancePreview, type DemandeReview, type RejectionReason } from '@/services/demande-admin-service'

export function UndoAcceptanceDialog({ d, reasons, onClose }: { d: DemandeReview; reasons: RejectionReason[]; onClose: () => void }) {
  const { data: p, error, isLoading } = useUndoAcceptancePreview(d.id)
  const undo = useUndoAcceptance()
  const emailToast = useEmailQueuedToast()
  const [motif, setMotif] = useState('')
  const [sendNow, setSendNow] = useState(true)
  const child = `${d.firstName} ${d.lastName}`.trim()

  const run = async () => {
    try {
      const r = await undo.mutateAsync({ id: d.id, decisionNotes: motif.trim() || null, sendRefusalNow: sendNow })
      if (r.sendError) toast.error(`Acceptation annulée, mais l'email de refus n'est pas parti : ${r.sendError} Utilisez « Envoyer les réponses ».`)
      else if (r.refusalSent) emailToast(`Acceptation de ${child} annulée : fiche supprimée, email de refus en file d'envoi`)
      else toast.success(`Acceptation de ${child} annulée : fiche supprimée, aucun email envoyé.`)
      onClose()
    } catch (err) { toast.error(parseApiError(err)) }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserX className="h-5 w-5 text-destructive" />Annuler l'acceptation — {child}</DialogTitle>
          <DialogDescription>La demande devient « Refusée ». La fiche créée à l'acceptation est supprimée définitivement.</DialogDescription>
        </DialogHeader>
        {error ? <Callout tone="danger">{parseApiError(error)}</Callout> : isLoading || !p ? <LoadingSpinner /> : p.blocker ? (
          <Callout tone="warning" icon={AlertTriangle}>{p.blocker}</Callout>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border p-3">
              <p className="font-medium">Sera supprimé :</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                <li>la fiche de {p.memberName}{p.cardNumber ? ` (${p.cardNumber})` : ''}{p.unitName ? `, ${p.unitName}` : ''}</li>
                <li>son identifiant et son lien d'activation{p.loginUsed && <span className="font-medium text-destructive"> — la famille s'est déjà connectée</span>}</li>
                <li>son entrée dans l'unité et sa progression « Entrée »</li>
                <li>les parents ajoutés pour cet enfant seulement (un parent lié à un frère ou une sœur est gardé)</li>
                {p.documents > 0 && <li className="font-medium text-destructive">{p.documents} document(s) déjà envoyé(s)</li>}
                {p.cotisations > 0 && <li className="font-medium text-destructive">{p.cotisations} cotisation(s) enregistrée(s)</li>}
                {p.otherPosts > 0 && <li className="font-medium text-destructive">{p.otherPosts} autre(s) affectation(s)</li>}
              </ul>
            </div>
            <div className="space-y-1.5">
              <label className="font-medium">Motif (optionnel, inclus dans l'email de refus)</label>
              <div className="flex gap-1.5">
                {reasons.length > 0 && (
                  <Select value="" onValueChange={(code) => { const r = reasons.find((x) => x.code === code); if (r) setMotif((r.text || '').trim() || r.label) }}>
                    <SelectTrigger className="h-9 w-36 shrink-0"><SelectValue placeholder="Motif type…" /></SelectTrigger>
                    <SelectContent>{reasons.map((r) => <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. : effectif complet" />
              </div>
            </div>
            <label className="flex items-center gap-2">
              <Switch checked={sendNow} onCheckedChange={setSendNow} aria-label="Envoyer l'email de refus à la famille" />
              Envoyer l'email de refus à la famille
            </label>
            {!sendNow && <p className="text-xs text-muted-foreground">Aucun email : la demande est marquée refusée sans prévenir la famille (elle ne partira pas non plus avec « Envoyer les réponses »).</p>}
            <p className="text-xs text-muted-foreground">Le chef d'unité a déjà reçu la fiche de cet enfant : prévenez-le.</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fermer</Button>
          {p && !p.blocker && (
            <Button variant="destructive" disabled={undo.isPending} onClick={run}>
              {undo.isPending ? 'Suppression…' : "Annuler l'acceptation"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
