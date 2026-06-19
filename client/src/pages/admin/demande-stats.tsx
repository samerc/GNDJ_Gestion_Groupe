import { useNavigate } from 'react-router'
import { useDemandeStatistics, useUnitOccupancy, type CountItem, type UnitOccupancy } from '@/services/demande-admin-service'
import { useSettingValue, useSchoolCode } from '@/services/settings-service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
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

// Horizontal bar list for a demographic breakdown.
function BarList({ items, labelOf }: { items: CountItem[]; labelOf?: (label: string) => string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Aucune donnée.</p>
  const max = Math.max(...items.map((i) => i.count), 1)
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.label} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate pr-2">{labelOf ? labelOf(it.label) : it.label}</span>
            <span className="tabular-nums font-medium text-muted-foreground">{it.count}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(it.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function OccRow({ u }: { u: UnitOccupancy }) {
  const remaining = u.quota != null ? u.quota - u.accepted : null
  return (
    <tr className="border-b hover:bg-muted/20">
      <td className="px-3 py-2"><span className="font-medium">{u.unitCode}</span> <span className="text-muted-foreground">{u.unitName}</span></td>
      <td className="px-3 py-2 text-center">{u.currentActive}</td>
      <td className="px-3 py-2 text-center font-medium">{u.projected}</td>
      <td className="px-3 py-2 text-center">{u.quota ?? <span className="text-muted-foreground">—</span>}</td>
      <td className="px-3 py-2 text-center">{u.accepted}</td>
      <td className="px-3 py-2 text-center">
        {remaining == null ? <span className="text-muted-foreground">—</span> :
          <span className={remaining <= 0 ? 'font-medium text-amber-600' : 'text-green-700'}>{remaining}{remaining <= 0 && <AlertTriangle className="ml-1 inline h-3 w-3" />}</span>}
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

  if (isLoading) return <LoadingSpinner variant="page" />
  if (!stats) return null

  const acceptanceRate = stats.decided > 0 ? Math.round((stats.approved / stats.decided) * 100) : null
  const decidedPct = stats.total > 0 ? Math.round((stats.decided / stats.total) * 100) : 0
  const occList = (occupancy ?? []).slice().sort((a, b) => a.unitCode.localeCompare(b.unitCode))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><BarChart3 className="h-6 w-6 text-primary" />Statistiques des demandes</h1>
          <p className="text-sm text-muted-foreground">Année {scoutYear}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/admin/demandes')}>
          <Inbox className="mr-2 h-4 w-4" />Revoir les demandes
        </Button>
      </div>

      {stats.total === 0 ? (
        <EmptyState icon={Inbox} title="Aucune demande soumise" description={`Aucune demande pour l'année ${scoutYear} pour l'instant.`} />
      ) : (
        <>
          {/* Pipeline */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Suivi des demandes</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat icon={Inbox} label="Total soumises" value={stats.total} />
              <Stat icon={Clock} label="À traiter" value={stats.pending} tone="bg-blue-100 text-blue-700" />
              <Stat icon={CheckCircle2} label="Acceptées" value={stats.approved} tone="bg-green-100 text-green-700" />
              <Stat icon={XCircle} label="Refusées" value={stats.declined} tone="bg-red-100 text-red-700" />
              <Stat icon={Send} label="Réponses envoyées" value={stats.responsesSent} tone="bg-violet-100 text-violet-700" />
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
                  <div className="flex items-center gap-1.5 text-amber-600">
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

          {/* Capacity */}
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

          {/* Demographics */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Profil des candidats</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <Card><CardHeader className="py-3"><CardTitle className="text-base">Par genre</CardTitle></CardHeader><CardContent><BarList items={stats.byGender} /></CardContent></Card>
              <Card><CardHeader className="py-3"><CardTitle className="text-base">Par tranche d'âge</CardTitle></CardHeader><CardContent><BarList items={stats.byAgeGroup} /></CardContent></Card>
              <Card><CardHeader className="py-3"><CardTitle className="text-base">Par classe</CardTitle></CardHeader><CardContent><BarList items={stats.byClasse} /></CardContent></Card>
              <Card><CardHeader className="py-3"><CardTitle className="text-base">Par école</CardTitle></CardHeader><CardContent><BarList items={stats.bySchool} labelOf={(l) => l === 'Non renseignée' ? l : schoolCode(l)} /></CardContent></Card>
            </div>
          </section>

          {/* Families & data quality */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Familles &amp; qualité des dossiers</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat icon={UsersRound} label="Fratries (familles)" value={stats.siblingGroups} tone="bg-amber-100 text-amber-700" />
              <Stat icon={UsersRound} label="Demandes en fratrie" value={stats.siblingDemandes} tone="bg-amber-100 text-amber-700" />
              <Stat icon={Link2} label="Avec proches scouts" value={stats.withScoutRelations} tone="bg-teal-100 text-teal-700" />
              <Stat icon={AlertTriangle} label="Dossiers incomplets" value={stats.incompleteDossiers} tone={stats.incompleteDossiers > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'} />
            </div>
            {stats.incompleteDossiers > 0 && (
              <p className="text-xs text-muted-foreground">Dossier incomplet = date de naissance, parent/tuteur ou téléphone parent manquant.</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
