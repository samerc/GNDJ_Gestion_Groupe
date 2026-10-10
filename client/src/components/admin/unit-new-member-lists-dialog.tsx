// « Listes des chefs d'unité » — the new-members Excel of each unit rebuilt from today's data (unit changes, late
// acceptances, cancelled ones, corrected parents…). Per unit: download it, or resend it to the unit's chef(s)
// d'unité; or resend every list at once. The email says the list replaces the ones received before.
import { useState } from 'react'
import { toast } from 'sonner'
import { Download, Send, Users2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/shared/callout'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { useEmailQueuedToast } from '@/hooks/use-email-queued-toast'
import { confirmAsync } from '@/lib/confirm'
import { saveBlob } from '@/lib/download'
import { parseApiError, parseBlobError } from '@/lib/error-utils'
import { downloadUnitNewMemberList, useSendUnitNewMemberLists, useUnitNewMemberLists, type UnitNewMemberList } from '@/services/demande-admin-service'

export function UnitNewMemberListsDialog({ scoutYear, onClose }: { scoutYear: string; onClose: () => void }) {
  const { data, error, isLoading } = useUnitNewMemberLists(scoutYear, true)
  const send = useSendUnitNewMemberLists()
  const emailToast = useEmailQueuedToast()
  const [downloading, setDownloading] = useState<string | null>(null)

  const download = async (u: UnitNewMemberList) => {
    setDownloading(u.unitId)
    try { saveBlob(await downloadUnitNewMemberList(scoutYear, u.unitId), `Nouveaux membres - ${u.unitName}.xlsx`) }
    catch (err) { toast.error(await parseBlobError(err)) }
    finally { setDownloading(null) }
  }

  const sendTo = async (units: UnitNewMemberList[]) => {
    const all = units.length > 1
    if (!(await confirmAsync({
      title: all ? 'Renvoyer toutes les listes ?' : `Renvoyer la liste de ${units[0].unitName} ?`,
      description: `Chaque chef d'unité reçoit la liste à jour de ses nouveaux membres (${units.reduce((n, u) => n + u.count, 0)} au total), qui remplace les listes reçues avant.`,
      confirmLabel: 'Envoyer',
    }))) return
    try {
      const r = await send.mutateAsync({ scoutYear, unitIds: all ? [] : [units[0].unitId] })
      emailToast(`${r.emails} email(s) aux chefs d'unité en file d'envoi`)
      if (r.unitsWithoutChef.length) toast.warning(`Sans chef d'unité joignable : ${r.unitsWithoutChef.join(', ')}`)
    } catch (err) { toast.error(parseApiError(err)) }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users2 className="h-5 w-5 text-primary" />Listes des chefs d'unité — {scoutYear}</DialogTitle>
          <DialogDescription>
            Les nouveaux membres acceptés cette année, unité par unité, avec les données d'aujourd'hui (unité actuelle,
            fiche, parents). Téléchargez une liste pour la vérifier, ou renvoyez-la aux chefs d'unité.
          </DialogDescription>
        </DialogHeader>
        {error ? <Callout tone="danger">{parseApiError(error)}</Callout> : isLoading || !data ? <LoadingSpinner /> : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun nouveau membre cette année.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {data.map((u) => (
              <div key={u.unitId} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{u.unitName} <span className="font-normal text-muted-foreground">· {u.count} nouveau(x)</span></div>
                  <div className="truncate text-xs text-muted-foreground">
                    {u.chefNames.length ? `Chef d'unité : ${u.chefNames.join(', ')}` : <span className="text-destructive">Aucun chef d'unité joignable</span>}
                  </div>
                </div>
                <Button size="sm" variant="outline" disabled={downloading === u.unitId} onClick={() => download(u)}>
                  <Download className="mr-1 h-3.5 w-3.5" />Excel
                </Button>
                <Button size="sm" variant="outline" disabled={send.isPending || u.chefNames.length === 0} onClick={() => sendTo([u])}>
                  <Send className="mr-1 h-3.5 w-3.5" />Envoyer
                </Button>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fermer</Button>
          {!!data?.length && (
            <Button disabled={send.isPending} onClick={() => sendTo(data)}>
              <Send className="mr-1 h-4 w-4" />Envoyer toutes les listes
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
