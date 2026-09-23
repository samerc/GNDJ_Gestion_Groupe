// CG enrollment statistics dashboard ("/admin/demande-stats", perm demande.view). Read-only overview of the
// season's inscription demandes for the configured scout year: status pipeline (total/à traiter/acceptées/
// refusées/envoyées + décidées progress + acceptance rate), per-unit capacity (projected after passage, vs
// quota — quotas are edited on the review page, not here), candidate demographics, and family/data-quality
// counts. The byGender/byClasse/bySchool buckets are grouped accent- & case-insensitively server-side so
// legacy spellings ("Féminin"/"Feminin") collapse into one row; school labels are shortened via useSchoolCode.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useDemandeStatistics, useUnitOccupancy, type CountItem, type UnitOccupancy } from '@/services/demande-admin-service'
import { useSettingValue, useSchoolCode } from '@/services/settings-service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { DemandeCrossReports } from '@/components/admin/demande-cross-reports'
import {
  Inbox, Clock, CheckCircle2, XCircle, Send, FileEdit, Users2, AlertTriangle,
  Link2, UsersRound, BarChart3,
} from 'lucide-react'

// Small stat tile.
function Stat({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: number | string; tone?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone ?? 'bg-primary/10 text-primary'}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-bold tabular-nums leading-tight">{value}</div>
          <div className="truncate text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

// Horizontal bar list for a demographic breakdown. When `labelOf` maps several distinct raw values to the SAME
// display label (e.g. multiple école spellings → one code "CNDJ"), rows are AGGREGATED by the display label so
// the same entry never appears twice — counts summed, re-sorted by count desc. Without labelOf, items are shown
// as-is (the server already grouped them accent/case-insensitively).
function BarList({ items, labelOf, max = 8 }: { items: CountItem[]; labelOf?: (label: string) => string; max?: number }) {
  let rows = labelOf
    ? Array.from(
        items.reduce((m, it) => {
          const key = labelOf(it.label)
          m.set(key, (m.get(key) ?? 0) + it.count)
          return m
        }, new Map<string, number>()),
        ([label, count]) => ({ label, count }),
      ).sort((a, b) => b.count - a.count)
    : items.map((i) => ({ label: i.label, count: i.count }))
  if (!rows.length) return <p className="text-sm text-muted-foreground">Aucune donnée.</p>
  // Bound very long lists (école/ville can have many values): keep the top `max`, roll the rest into "Autres".
  if (rows.length > max) {
    const head = rows.slice(0, max)
    const rest = rows.slice(max).reduce((s, r) => s + r.count, 0)
    rows = [...head, { label: `Autres (${rows.length - max})`, count: rest }]
  }
  const peak = Math.max(...rows.map((i) => i.count), 1)
  // One compact line per value: label · inline bar · count — roughly half the height of the stacked layout.
  return (
    <div className="space-y-1.5">
      {rows.map((it) => (
        <div key={it.label} className="flex items-center gap-2 text-sm">
          <span className="w-24 shrink-0 truncate sm:w-28" title={it.label}>{it.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(it.count / peak) * 100}%` }} />
          </div>
          <span className="w-9 shrink-0 text-right tabular-nums font-medium text-muted-foreground">{it.count}</span>
        </div>
      ))}
    </div>
  )
}

// One unit row in the capacity table. "Places restantes" = quota − already-accepted (null when no quota set);
// non-positive turns amber with a warning icon (unit at/over capacity).
function OccRow({ u }: { u: UnitOccupancy }) {
  const remaining = u.quota != null ? u.quota - u.accepted : null
  return (
    <tr className="border-b hover:bg-muted/20">
      <td className="px-3 py-2"><span className="font-medium">{u.unitCode}</span></td>
      <td className="px-3 py-2 text-center">{u.currentActive}</td>
      <td className="px-3 py-2 text-center font-medium">{u.projected}</td>
      <td className="px-3 py-2 text-center">{u.quota ?? <span className="text-muted-foreground">—</span>}</td>
      <td className="px-3 py-2 text-center">{u.accepted}</td>
      <td className="px-3 py-2 text-center">
        {remaining == null ? <span className="text-muted-foreground">—</span> :
          <span className={remaining <= 0 ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-green-700 dark:text-green-300'}>{remaining}{remaining <= 0 && <AlertTriangle className="ml-1 inline h-3 w-3" />}</span>}
      </td>
    </tr>
  )
}

export default function DemandeStatsPage() {
  const navigate = useNavigate()
  const scoutYear = useSettingValue('demande.scout_year') ?? '2026-2027'
  const schoolCode = useSchoolCode()
  const { data: stats, isLoading } = useDemandeStatistics(scoutYear)
  const { data: occupancy } = useUnitOccupancy(scoutYear)
  // Remember the last-opened tab across visits (per device).
  const [tab, setTab] = useState<string>(() => {
    try { return localStorage.getItem('demandeStats.tab') || 'overview' } catch { return 'overview' }
  })
  const changeTab = (v: string) => { setTab(v); try { localStorage.setItem('demandeStats.tab', v) } catch { /* private mode */ } }

  if (isLoading) return <LoadingSpinner variant="page" />
  if (!stats) return null

  // Acceptance rate is over DECIDED demandes (not total) so pending ones don't drag it down; null until any decided.
  const acceptanceRate = stats.decided > 0 ? Math.round((stats.approved / stats.decided) * 100) : null
  const decidedPct = stats.total > 0 ? Math.round((stats.decided / stats.total) * 100) : 0
  const occList = (occupancy ?? []).slice().sort((a, b) => a.unitCode.localeCompare(b.unitCode))

  return (
    <Page>
      <PageHeader
        title="Statistiques des demandes"
        icon={BarChart3}
        description={`Année ${scoutYear}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/demandes')}>
            <Inbox className="mr-1.5 h-4 w-4" />Revoir les demandes
          </Button>
        }
      />

      {stats.total === 0 ? (
        <EmptyState icon={Inbox} title="Aucune demande soumise" description={`Aucune demande pour l'année ${scoutYear} pour l'instant.`} />
      ) : (
        <Tabs value={tab} onValueChange={changeTab} className="space-y-5">
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
            <TabsTrigger value="profile">Profil des candidats</TabsTrigger>
            <TabsTrigger value="capacity">Capacité</TabsTrigger>
          </TabsList>

          {/* ── Vue d'ensemble : suivi du pipeline + familles/qualité (l'état de la campagne) ── */}
          <TabsContent value="overview" className="space-y-6">
          {/* Pipeline */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Suivi des demandes</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat icon={Inbox} label="Total soumises" value={stats.total} />
              <Stat icon={Clock} label="À traiter" value={stats.pending} tone="bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300" />
              <Stat icon={CheckCircle2} label="Acceptées" value={stats.approved} tone="bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300" />
              <Stat icon={XCircle} label="Refusées" value={stats.declined} tone="bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300" />
              <Stat icon={Send} label="Réponses envoyées" value={stats.responsesSent} tone="bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300" />
            </div>
            <Card>
              <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Décidées</span>
                  <span className="font-semibold tabular-nums">{stats.decided} / {stats.total}</span>
                  <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${decidedPct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground">{decidedPct}%</span>
                </div>
                {acceptanceRate != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Taux d'acceptation</span>
                    <Badge variant="secondary">{acceptanceRate}%</Badge>
                  </div>
                )}
                {stats.pending > 0 && (
                  <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                    <Clock className="h-4 w-4" /><span className="font-medium">{stats.pending}</span> en attente de décision
                  </div>
                )}
                {stats.drafts > 0 && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <FileEdit className="h-4 w-4" />{stats.drafts} brouillon(s) non soumis
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Families & data quality */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Familles &amp; qualité des dossiers</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat icon={UsersRound} label="Fratries (familles)" value={stats.siblingGroups} tone="bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300" />
              <Stat icon={UsersRound} label="Demandes en fratrie" value={stats.siblingDemandes} tone="bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300" />
              <Stat icon={Link2} label="Avec proches scouts" value={stats.withScoutRelations} tone="bg-teal-100 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300" />
              <Stat icon={AlertTriangle} label="Dossiers incomplets" value={stats.incompleteDossiers} tone={stats.incompleteDossiers > 0 ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300' : 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300'} />
            </div>
            {stats.incompleteDossiers > 0 && (
              <p className="text-xs text-muted-foreground">Dossier incomplet = date de naissance, parent/tuteur ou téléphone parent manquant.</p>
            )}
          </section>
          </TabsContent>

          {/* ── Profil des candidats : répartitions simples + rapports croisés (qui dépose ?) ── */}
          <TabsContent value="profile" className="space-y-6">
          {/* Demographics */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Répartitions</h2>
            <div className="grid items-start gap-3 md:grid-cols-2">
              <Card><CardHeader className="py-3"><CardTitle className="text-sm">Par genre</CardTitle></CardHeader><CardContent className="pt-0 pb-4"><BarList items={stats.byGender} /></CardContent></Card>
              <Card><CardHeader className="py-3"><CardTitle className="text-sm">Par tranche d'âge</CardTitle></CardHeader><CardContent className="pt-0 pb-4"><BarList items={stats.byAgeGroup} /></CardContent></Card>
              <Card><CardHeader className="py-3"><CardTitle className="text-sm">Par classe</CardTitle></CardHeader><CardContent className="pt-0 pb-4"><BarList items={stats.byClasse} /></CardContent></Card>
              <Card><CardHeader className="py-3"><CardTitle className="text-sm">Par école</CardTitle></CardHeader><CardContent className="pt-0 pb-4"><BarList items={stats.bySchool} labelOf={(l) => l === 'Non renseignée' ? l : schoolCode(l)} /></CardContent></Card>
            </div>
          </section>

          {/* Cross-tab reports (Sexe×Branche, Branche×Statut, + flexible pivot) — the headline analytics */}
          <DemandeCrossReports rows={stats.rows} branches={stats.branches} schoolCode={schoolCode} />
          </TabsContent>

          {/* ── Capacité des unités (opérationnel) ── */}
          <TabsContent value="capacity" className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Capacité des unités</h2>
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2 text-base"><Users2 className="h-4 w-4" />Capacité (projetée après passage)</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {occList.length === 0 ? <p className="text-sm text-muted-foreground">Aucune unité.</p> : (
                  <table className="w-full min-w-[640px] text-sm">
                    <thead><tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 text-left">Unité</th><th className="px-3 py-2">Actuels</th>
                      <th className="px-3 py-2">Projeté</th><th className="px-3 py-2">Quota</th>
                      <th className="px-3 py-2">Acceptés</th><th className="px-3 py-2">Places restantes</th>
                    </tr></thead>
                    <tbody>{occList.map((u) => <OccRow key={u.unitId} u={u} />)}</tbody>
                  </table>
                )}
                <p className="mt-2 text-xs text-muted-foreground">Les quotas se modifient sur la page de revue des demandes.</p>
              </CardContent>
            </Card>
          </section>
          </TabsContent>
        </Tabs>
      )}
    </Page>
  )
}
