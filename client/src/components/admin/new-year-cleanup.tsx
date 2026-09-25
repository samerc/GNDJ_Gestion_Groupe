// "Nettoyage de nouvelle année" — shown in Paramètres → Passage (shortcut card) and as a prompt right after the
// CG moves the scout year forward. Lets the CG pick which document types are kept + whether they stay approved,
// previews exactly what will change, then runs the reset in the background (export → delete → reset → classes up)
// and follows its progress. Once per scout year (the backend refuses a second run).
import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { useAuthStore } from '@/stores/auth-store'
import { useDocumentTypeList } from '@/services/document-type-service'
import { useSettingArray, useSettingValue, useUpdateSetting } from '@/services/settings-service'
import { useNewYearCleanup, useStartNewYearCleanup, downloadNewYearArchive } from '@/services/new-year-service'
import { useQueryClient } from '@tanstack/react-query'

const KEEP_TYPES = 'newyear.keep_document_types'
const KEEP_APPROVAL = 'newyear.keep_id_approval'

function formatBytes(n: number | null | undefined) {
  if (!n) return '0 Mo'
  return n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} Go` : `${Math.max(1, Math.round(n / 1024 ** 2))} Mo`
}
const frDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '')

export function NewYearCleanupPanel() {
  const qc = useQueryClient()
  const isSuperAdmin = useAuthStore((s) => !!s.user?.isSuperAdmin)
  const { data, isLoading } = useNewYearCleanup()
  const { data: docTypes } = useDocumentTypeList()
  const keepCodes = useSettingArray(KEEP_TYPES)
  const keepApproval = useSettingValue(KEEP_APPROVAL) !== 'false'
  const update = useUpdateSetting()
  const start = useStartNewYearCleanup()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [understood, setUnderstood] = useState(false)

  const save = async (key: string, value: string) => {
    try {
      await update.mutateAsync({ key, value })
      await qc.invalidateQueries({ queryKey: ['new-year-cleanup'] }) // the preview depends on these settings
    } catch (err) { toast.error(parseApiError(err)) }
  }
  const toggleType = (code: string, on: boolean) => {
    const upper = keepCodes.map((c) => c.toUpperCase())
    const next = on ? [...keepCodes, code] : keepCodes.filter((c) => c.toUpperCase() !== code.toUpperCase())
    if (on && upper.includes(code.toUpperCase())) return
    save(KEEP_TYPES, JSON.stringify(next))
  }

  const run = async () => {
    try {
      await start.mutateAsync()
      setConfirmOpen(false); setUnderstood(false)
      toast.success('Nettoyage lancé — vous pouvez suivre son avancement ici.')
    } catch (err) { toast.error(parseApiError(err)) }
  }

  if (isLoading || !data) return <LoadingSpinner />
  const p = data.preview
  const last = data.lastRun
  const running = data.running
  const done = data.doneForCurrentYear

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        À faire une fois par année scoute, avant l'ouverture du dépôt des documents. Tous les documents sont d'abord
        exportés (archive conservée sur le serveur et dans la sauvegarde), puis réinitialisés.
      </p>

      {/* Settings: kept document types + approval */}
      <div className="space-y-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">Documents conservés d'une année à l'autre</h3>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {(docTypes ?? []).map((t) => {
            const on = keepCodes.some((c) => c.toUpperCase() === t.code.toUpperCase())
            return (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={on} disabled={running || update.isPending}
                  onChange={(e) => toggleType(t.code, e.target.checked)} />
                {t.name}
              </label>
            )
          })}
        </div>
        <label className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
          <span>
            Garder la validation des documents conservés
            <span className="block text-xs text-muted-foreground">Si désactivé, ils repassent « En attente » et le chef d'unité les revérifie.</span>
          </span>
          <Switch checked={keepApproval} disabled={running || update.isPending}
            onCheckedChange={(v) => save(KEEP_APPROVAL, v ? 'true' : 'false')} />
        </label>
      </div>

      {/* What will happen */}
      <div className="rounded-lg border p-4">
        <h3 className="mb-2 text-sm font-semibold">Ce qui sera fait pour l'année {p.scoutYear}</h3>
        <ul className="space-y-1.5 text-sm">
          <li>• Export de <b>tous</b> les documents dans une archive (zip)</li>
          <li>• Suppression de <b>{p.documentsToDelete}</b> document{p.documentsToDelete > 1 ? 's' : ''} ({formatBytes(p.bytesToDelete)})
            {p.keptTypeNames.length > 0 && <> — conservés : {p.keptTypeNames.join(', ')} ({p.documentsKept})</>}</li>
          <li>• {p.keepApproval
            ? <>Les documents conservés gardent leur validation</>
            : <><b>{p.approvalsToReset}</b> validation{p.approvalsToReset > 1 ? 's' : ''} remise{p.approvalsToReset > 1 ? 's' : ''} « En attente »</>}</li>
          <li>• Section vidée pour <b>{p.sectionsToClear}</b> membre{p.sectionsToClear > 1 ? 's' : ''}</li>
          <li>• Classe avancée d'une année pour <b>{p.classesToPromote}</b> membre{p.classesToPromote > 1 ? 's' : ''} actif{p.classesToPromote > 1 ? 's' : ''}
            {p.newMembersSkipped > 0 && <span className="text-muted-foreground"> ({p.newMembersSkipped} nouveau{p.newMembersSkipped > 1 ? 'x' : ''} inscrit{p.newMembersSkipped > 1 ? 's' : ''} de cette année non touché{p.newMembersSkipped > 1 ? 's' : ''})</span>}</li>
        </ul>
      </div>

      {/* Status of the last / current run */}
      {running && last && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          En cours : {last.phase ?? '…'}{last.exported != null && ` — ${last.exported} fichiers exportés`}
        </div>
      )}
      {!running && last?.state === 'failed' && last.scoutYear === p.scoutYear && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Le nettoyage a échoué ({last.error}). Rien n'a été modifié dans la base ; vous pouvez le relancer.</span>
        </div>
      )}
      {done && last?.state === 'done' && (
        <div className="space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
          <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />Nettoyage fait pour {last.scoutYear} le {frDateTime(last.finishedAt)}{last.startedBy ? ` par ${last.startedBy}` : ''}
          </p>
          <p className="text-muted-foreground">
            {last.exported} fichiers exportés{last.missingFiles ? ` (${last.missingFiles} introuvables sur le serveur)` : ''} ·
            {' '}{last.deleted} documents supprimés · {last.approvalsReset} validations remises · {last.sectionsCleared} sections vidées ·
            {' '}{last.classesPromoted} classes avancées
          </p>
          {last.archiveFile && (
            isSuperAdmin ? (
              <Button variant="outline" size="sm" onClick={() => downloadNewYearArchive(last.archiveFile!).catch((e) => toast.error(parseApiError(e)))}>
                <Download className="mr-1.5 h-4 w-4" />Télécharger l'archive ({formatBytes(last.archiveBytes)})
              </Button>
            ) : <p className="text-xs text-muted-foreground">Archive : {last.archiveFile} ({formatBytes(last.archiveBytes)}) — téléchargeable par le super-administrateur.</p>
          )}
        </div>
      )}

      {!done && (
        <Button onClick={() => setConfirmOpen(true)} disabled={running || start.isPending}>
          {last?.state === 'failed' ? <RefreshCw className="mr-1.5 h-4 w-4" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
          Lancer le nettoyage de {p.scoutYear}
        </Button>
      )}

      <Dialog open={confirmOpen} onOpenChange={(o) => { setConfirmOpen(o); if (!o) setUnderstood(false) }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lancer le nettoyage de {p.scoutYear} ?</DialogTitle>
            <DialogDescription>
              {p.documentsToDelete} documents seront supprimés après l'export, {p.sectionsToClear} sections vidées et
              {' '}{p.classesToPromote} classes avancées. Cette opération n'est faite qu'une fois par année et ne peut pas être annulée
              (les documents restent dans l'archive).
            </DialogDescription>
          </DialogHeader>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
            J'ai compris : les documents non conservés seront supprimés (après export).
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Annuler</Button>
            <Button variant="destructive" disabled={!understood || start.isPending} onClick={run}>
              {start.isPending ? 'Lancement…' : 'Lancer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Prompt shown right after the CG moves the scout year forward in Paramètres.
export function NewYearCleanupPrompt({ open, onOpenChange, year }: { open: boolean; onOpenChange: (o: boolean) => void; year: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouvelle année scoute {year}</DialogTitle>
          <DialogDescription>Voulez-vous faire maintenant le nettoyage de début d'année ? Vous pourrez aussi le lancer plus tard depuis Paramètres → Passage.</DialogDescription>
        </DialogHeader>
        {open && <NewYearCleanupPanel />}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Plus tard</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
