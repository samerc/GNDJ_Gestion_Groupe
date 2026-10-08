// "Système" (super-admin): is everything running? One screen with the plain-language problem list (the same one the
// daily alert email carries), the background jobs, email + push delivery, disk space, the slowest pages seen in
// real use, configuration checks, and a stray-upload-files cleanup. Refreshes every minute.
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import {
  Activity, AlertTriangle, CheckCircle2, Clock, HardDrive, Mail, Bell, Gauge, FileWarning, Trash2, Search, XCircle,
} from 'lucide-react'
import {
  useSystemStatus, useOrphanFiles, useDeleteOrphanFiles, formatBytes, type JobStatus, type OutboxStats,
} from '@/services/system-service'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Callout } from '@/components/shared/callout'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { ConfigIssuesBanner } from '@/components/shared/config-issues-banner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { parseApiError } from '@/lib/error-utils'
import { cn, formatDateTime } from '@/lib/utils'

// Date-time or a dash when the event never happened.
const dt = (iso: string | null) => (iso ? formatDateTime(iso) : '—')

// A job's expected interval in plain French ("toutes les 5 min", "une fois par jour").
function interval(min: number) {
  if (min < 60) return `toutes les ${min} min`
  const h = Math.round(min / 60)
  return h === 24 ? 'une fois par jour' : `toutes les ${h} h`
}

// One background job. Stale (no run for too long) is worse than failing (it ran but errored), hence checked first.
function JobRow({ j }: { j: JobStatus }) {
  const state: { label: string; variant: 'danger' | 'warning' | 'secondary' | 'success' } = j.stale ? { label: 'Arrêtée', variant: 'danger' }
    : j.failing ? { label: 'En erreur', variant: 'warning' }
    : !j.lastRunAt ? { label: 'Pas encore lancée', variant: 'secondary' }
    : { label: 'OK', variant: 'success' }
  return (
    <tr className="border-b last:border-0 align-top">
      <td className="px-4 py-2">
        <div className="font-medium">{j.label}</div>
        <div className="text-xs text-muted-foreground">{interval(j.expectedIntervalMinutes)}</div>
        {/* Phone: the two last columns are folded in here (the table cut off the État column). */}
        <div className="text-xs text-muted-foreground md:hidden">Dernier succès : {dt(j.lastSuccessAt)}</div>
        {j.failing && j.lastError && <div className="text-xs text-red-700 dark:text-red-400 md:hidden">{j.consecutiveFailures}× — {j.lastError}</div>}
      </td>
      <td className="px-4 py-2"><Badge variant={state.variant}>{state.label}</Badge></td>
      <td className="hidden px-4 py-2 text-muted-foreground md:table-cell">{dt(j.lastSuccessAt)}</td>
      <td className="hidden px-4 py-2 text-xs md:table-cell">
        {j.failing && j.lastError
          ? <span className="text-red-700 dark:text-red-400">{j.consecutiveFailures}× — {j.lastError}</span>
          : <span className="text-muted-foreground">—</span>}
      </td>
    </tr>
  )
}

// Delivery stats for the email or push outbox; the "Ouvrir la file" link only shows when something is stuck / failed.
function OutboxCard({ title, icon: Icon, s, link }: { title: string; icon: typeof Mail; s: OutboxStats; link?: string }) {
  const bad = s.stuck > 0 || s.failedLast24h > 0
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4" />{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Envoyés (24 h)" value={s.sentLast24h} />
          <Stat label="En attente" value={s.pending} />
          <Stat label="Bloqués (> 2 h)" value={s.stuck} tone={s.stuck > 0 ? 'bad' : undefined} />
          <Stat label="Échecs (24 h)" value={s.failedLast24h} tone={s.failedLast24h > 0 ? 'warn' : undefined} />
        </div>
        <p className="text-xs text-muted-foreground">Dernier envoi réussi : {dt(s.lastSentAt)}</p>
        {s.recentFailures.length > 0 && (
          <ul className="space-y-1 rounded-md border p-2 text-xs">
            {s.recentFailures.map((f, i) => (
              <li key={i} className="break-words">
                <span className="text-muted-foreground">{dt(f.at)}</span> · <span className="font-medium">{f.what}</span> → {f.to}
                {f.error && <span className="block text-red-700 dark:text-red-400">{f.error}</span>}
              </li>
            ))}
          </ul>
        )}
        {link && bad && <Button asChild variant="outline" size="sm"><Link to={link}>Ouvrir la file d'emails</Link></Button>}
      </CardContent>
    </Card>
  )
}

// Small number tile; `tone` colours a bad (red) or worrying (amber) value.
function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'bad' | 'warn' }) {
  return (
    <div className="rounded-md border p-2">
      <div className={cn('text-lg font-semibold tabular-nums',
        tone === 'bad' && 'text-red-700 dark:text-red-400', tone === 'warn' && 'text-amber-700 dark:text-amber-400')}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

// Stray upload files: the scan only runs on demand (`scan` enables the query) since it walks the upload folders.
function OrphanFilesCard() {
  const [scan, setScan] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const { data, isFetching, refetch } = useOrphanFiles(scan)
  const del = useDeleteOrphanFiles()

  const run = async () => {
    try {
      const r = await del.mutateAsync()
      toast.success(`${r.deleted} fichier(s) supprimé(s) — ${formatBytes(r.freedBytes)} libérés`)
      setConfirm(false)
      refetch()
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><FileWarning className="h-4 w-4" />Fichiers orphelins</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Documents et photos présents sur le serveur mais rattachés à aucune fiche (envoi interrompu, suppression
          incomplète). Seuls les fichiers de plus d'un jour sont concernés. Les images du site public ne sont pas analysées.
        </p>
        {!scan ? (
          <Button variant="outline" size="sm" onClick={() => setScan(true)}><Search className="mr-1 h-4 w-4" />Rechercher</Button>
        ) : isFetching && !data ? (
          <LoadingSpinner />
        ) : data ? (
          <>
            <p>
              {data.scannedFiles} fichier(s) analysé(s) · <strong>{data.count}</strong> orphelin(s)
              {data.count > 0 && <> · {formatBytes(data.totalBytes)}</>}
            </p>
            {data.count > 0 && (
              <>
                <div className="max-h-64 overflow-auto rounded-md border">
                  <table className="w-full text-xs">
                    <tbody>
                      {data.files.map((f) => (
                        <tr key={f.folder + f.name} className="border-b last:border-0">
                          <td className="px-2 py-1 text-muted-foreground">{f.folder}</td>
                          <td className="px-2 py-1 break-all">{f.name}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{formatBytes(f.sizeBytes)}</td>
                          <td className="px-2 py-1 text-muted-foreground">{dt(f.modifiedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.count > data.files.length && <p className="text-xs text-muted-foreground">Les {data.files.length} plus gros sont affichés.</p>}
                {/* Same safety stop as the server: most files "unused" = wrong folder / database, not real leftovers. */}
                {data.count > 20 && data.count * 2 > data.scannedFiles ? (
                  <Callout tone="warning" icon={AlertTriangle}>
                    La majorité des fichiers semblent orphelins : c'est anormal (mauvais dossier ou base de données restaurée ?).
                    La suppression est bloquée par sécurité.
                  </Callout>
                ) : (
                  <Button variant="destructive" size="sm" onClick={() => setConfirm(true)}>
                    <Trash2 className="mr-1 h-4 w-4" />Supprimer {data.count} fichier(s)
                  </Button>
                )}
              </>
            )}
          </>
        ) : null}
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title="Supprimer les fichiers orphelins ?"
          description="Les fichiers rattachés à aucune fiche seront supprimés définitivement du serveur (une nouvelle analyse est faite au moment de la suppression). Les sauvegardes de la base ne contiennent pas ces fichiers."
          confirmLabel="Supprimer"
          variant="destructive"
          loading={del.isPending}
          onConfirm={run}
        />
      </CardContent>
    </Card>
  )
}

// Route /admin/system (AdminRoute, super-admin). One GET /system/status snapshot, re-polled by the hook.
export default function SystemPage() {
  const { data, isLoading, isError } = useSystemStatus()

  return (
    <Page>
      <PageHeader
        title="Système"
        icon={Activity}
        description={data
          ? `Serveur démarré le ${dt(data.serverStartedAt)} (${data.environment}). Mise à jour automatique chaque minute.`
          : 'État des tâches automatiques, des envois et du serveur.'}
      />
      {isLoading ? <LoadingSpinner variant="table" />
        : isError || !data ? <EmptyState icon={Activity} title="Impossible de charger l'état du système" />
        : (
          <div className="space-y-4">
            {/* The same list the daily alert email carries. */}
            {data.problems.length === 0 ? (
              <Callout tone="success" icon={CheckCircle2} title="Tout fonctionne normalement" />
            ) : (
              <Callout tone="danger" icon={XCircle} title={`${data.problems.length} point(s) à vérifier`}>
                <ul className="list-disc space-y-1 pl-4">
                  {data.problems.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">Un email récapitulatif est envoyé à l'administrateur au plus une fois par jour tant qu'un point reste ouvert.</p>
              </Callout>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" />Tâches automatiques</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm md:min-w-[640px]">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                        <th className="px-4 py-2">Tâche</th><th className="px-4 py-2">État</th>
                        <th className="hidden px-4 py-2 md:table-cell">Dernier succès</th><th className="hidden px-4 py-2 md:table-cell">Dernière erreur</th>
                      </tr>
                    </thead>
                    <tbody>{data.jobs.map((j) => <JobRow key={j.key} j={j} />)}</tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <OutboxCard title="Emails" icon={Mail} s={data.email} link="/admin/email-outbox" />
              <OutboxCard title="Notifications push" icon={Bell} s={data.push} />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><HardDrive className="h-4 w-4" />Disque</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {!data.disk ? <p className="text-muted-foreground">Information non disponible.</p> : (
                  <>
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span><strong>{formatBytes(data.disk.freeBytes)}</strong> libres sur {formatBytes(data.disk.totalBytes)} ({data.disk.drive})</span>
                      <span className="text-muted-foreground">Fichiers envoyés (uploads) : {formatBytes(data.disk.uploadsBytes)}</span>
                      {data.disk.low && <Badge variant="destructive">Espace faible</Badge>}
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className={cn('h-full', data.disk.low ? 'bg-red-500' : 'bg-primary')}
                        // Bar = used share of the drive.
                        style={{ width: `${Math.min(100, 100 - data.disk.freePercent)}%` }} />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Gauge className="h-4 w-4" />Pages lentes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-xs text-muted-foreground">
                  Requêtes de plus de {(data.slowThresholdMs / 1000).toLocaleString('fr-FR')} s depuis le démarrage du serveur, regroupées par page.
                </p>
                {data.slowRoutes.length === 0 ? <EmptyState icon={Gauge} title="Aucune requête lente" /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                          <th className="px-2 py-1">Requête</th><th className="px-2 py-1 text-right">Nombre</th>
                          <th className="px-2 py-1 text-right">Moyenne</th><th className="px-2 py-1 text-right">Max</th>
                          <th className="px-2 py-1">Qui</th><th className="px-2 py-1">Dernière</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.slowRoutes.map((r) => (
                          <tr key={r.method + r.route} className="border-b last:border-0">
                            <td className="px-2 py-1 font-mono text-xs break-all">{r.method} {r.route}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{r.count}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{(r.avgMs / 1000).toFixed(1)} s</td>
                            <td className="px-2 py-1 text-right tabular-nums">{(r.maxMs / 1000).toFixed(1)} s</td>
                            <td className="px-2 py-1 text-xs text-muted-foreground">{r.roles}</td>
                            <td className="px-2 py-1 text-xs text-muted-foreground">{dt(r.lastAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4" />Configuration</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {data.configIssues.length === 0
                  ? <p className="text-muted-foreground">Paramètres et modèles d'email cohérents.</p>
                  : <ConfigIssuesBanner issues={data.configIssues} title={`${data.configIssues.length} point(s) dans les paramètres ou les modèles d'email`} />}
              </CardContent>
            </Card>

            <OrphanFilesCard />
          </div>
        )}
    </Page>
  )
}
