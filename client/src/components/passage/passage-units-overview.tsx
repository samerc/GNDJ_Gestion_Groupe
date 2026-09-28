import { useMemo, useState } from 'react'
import {
  usePassageProjection,
  type PassageProjectionMember,
  type PassageSummaryDto,
  type PassageUnitSummary,
} from '@/services/passage-service'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tip } from '@/components/ui/tooltip'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { cn } from '@/lib/utils'
import { AlertTriangle, ArrowRight, Bell, CheckCircle2, ChevronRight, Circle, Flag, Lock, Unlock } from 'lucide-react'

// CG passage page — ONE row per unit answering the three questions the CG asks:
//  1. Has the chef d'unité finished? (Pas commencé / En cours / Tout proposé / Terminé)
//  2. Are there changes waiting for the CG? (À valider)
//  3. How many members does the unit have next year? (now → next year, + arrivals by origin, − departures by destination)
// Clicking a row opens the detail (who stays / arrives from where / leaves to where). "Voir les membres" filters
// the member list below to that unit. Headcounts come from the projection endpoint; the CU status from the summary.

type Mode = 'prevu' | 'valide'
const LEAVE = '__leave__' // sentinel: the member quits the group next year

// Where a member ends up next year. "prevu" counts every proposal (to validate + validated); "valide" only the
// validated ones (a line still to validate → the member stays for now). No line / rejected → stays.
function effectiveDest(m: PassageProjectionMember, mode: Mode): string {
  const dest = m.isLeaving ? LEAVE : (m.destUnitId ?? m.currentUnitId)
  if (m.lineStatus === 'Approved') return dest
  if (m.lineStatus === 'Pending') return mode === 'prevu' ? dest : m.currentUnitId
  return m.currentUnitId
}

// Parcours order of the branches (then units by number), so the table reads Meute → Ronde → Troupe → …
const BRANCH_ORDER = ['meute', 'ronde', 'troupe', 'compagnie', 'clan', 'noyau', 'jeunes', 'jem', 'feu', 'caravelle', 'groupe']
const branchRank = (name: string | null) => {
  const n = (name ?? '').toLowerCase()
  const i = BRANCH_ORDER.findIndex(b => n.includes(b))
  return i < 0 ? BRANCH_ORDER.length : i
}

// The chef d'unité's progress, in plain words.
type UnitStage = 'none' | 'progress' | 'ready' | 'done'
function unitStage(u: PassageUnitSummary): UnitStage {
  if (u.submitted) return 'done'
  if (u.total === 0) return 'none'
  if (u.missingLines > 0) return 'progress'
  return 'ready'
}

function StageBadge({ u }: { u: PassageUnitSummary }) {
  const s = unitStage(u)
  if (s === 'done') return <Badge variant="success" className="gap-1"><Lock className="h-3 w-3" />Terminé</Badge>
  if (s === 'ready') return (
    <Tip content="Tous les membres ont une proposition, mais le chef n'a pas encore cliqué « Terminer le passage de l'unité ».">
      <Badge variant="info">Tout proposé, pas terminé</Badge>
    </Tip>
  )
  if (s === 'progress') return <Badge variant="warning">En cours · {u.missingLines} sans proposition</Badge>
  return <Badge variant="secondary">Pas commencé</Badge>
}

interface Props {
  scoutYear: string
  summary: PassageSummaryDto | undefined
  isOpen: boolean
  canRemind: boolean
  onRemind: () => void
  reminding: boolean
  busyUnitId: string | null
  onToggleFinished: (unitId: string, finished: boolean) => void
  onShowMembers: (unitId: string) => void
}

export function PassageUnitsOverview({ scoutYear, summary, isOpen, canRemind, onRemind, reminding, busyUnitId, onToggleFinished, onShowMembers }: Props) {
  const [mode, setMode] = useState<Mode>('prevu')
  const [expanded, setExpanded] = useState<string | null>(null)
  const { data, isLoading } = usePassageProjection(scoutYear)

  const codeById = useMemo(() => new Map((data?.units ?? []).map(u => [u.unitId, u.unitCode])), [data])
  const summaryById = useMemo(() => new Map((summary?.unitSummaries ?? []).map(u => [u.unitId, u])), [summary])

  const rows = useMemo(() => {
    if (!data) return []
    const eff = new Map(data.members.map(m => [m.memberId, effectiveDest(m, mode)]))
    return data.units
      .map(u => {
        const current = data.members.filter(m => m.currentUnitId === u.unitId)
        const stays = current.filter(m => eff.get(m.memberId) === u.unitId)
        const departures = current.filter(m => eff.get(m.memberId) !== u.unitId)
        const arrivals = data.members.filter(m => m.currentUnitId !== u.unitId && eff.get(m.memberId) === u.unitId)
        // Arrivals grouped by origin unit, departures grouped by destination (or "quittent").
        const byOrigin = countBy(arrivals, m => m.currentUnitId)
        const byDest = countBy(departures, m => eff.get(m.memberId) ?? '')
        const projected = stays.length + arrivals.length
        const noLine = current.filter(m => m.lineStatus === 'None')
        return {
          u, s: summaryById.get(u.unitId), currentCount: current.length, projected,
          stays, noLine, arrivals, departures, byOrigin, byDest, eff,
          overQuota: !!u.quota && projected > u.quota,
        }
      })
      .filter(r => r.currentCount > 0 || r.projected > 0)
      .sort((a, b) => branchRank(a.u.unitTypeName) - branchRank(b.u.unitTypeName)
        || a.u.unitCode.localeCompare(b.u.unitCode, 'fr', { numeric: true }))
  }, [data, mode, summaryById])

  const leavingTotal = useMemo(
    () => (data?.members ?? []).filter(m => effectiveDest(m, mode) === LEAVE).length, [data, mode])

  const destLabel = (id: string) => (id === LEAVE ? 'quittent le groupe' : `vers ${codeById.get(id) ?? '?'}`)

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">Unités</p>
          <span className="text-xs text-muted-foreground">Cliquez sur une unité pour voir qui reste, qui arrive et qui part.</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border">
              <Tip content="Compte toutes les propositions des chefs, validées ou non">
                <Button variant={mode === 'prevu' ? 'default' : 'ghost'} size="sm" className="rounded-r-none" onClick={() => setMode('prevu')}>Prévu</Button>
              </Tip>
              <Tip content="Ne compte que les changements déjà validés par le CG">
                <Button variant={mode === 'valide' ? 'default' : 'ghost'} size="sm" className="rounded-l-none border-l" onClick={() => setMode('valide')}>Validé seulement</Button>
              </Tip>
            </div>
            {canRemind && isOpen && (
              <Tip content="Notification et email aux chefs des unités qui n'ont pas terminé (envoyé aussi automatiquement 7 et 2 jours avant la date du passage)">
                <Button size="sm" variant="outline" onClick={onRemind} disabled={reminding}>
                  <Bell className="mr-1 h-4 w-4" />Relancer les unités non terminées
                </Button>
              </Tip>
            )}
          </div>
        </div>

        {isLoading || !data ? <LoadingSpinner /> : (
          <>
            {data.missingLines > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {data.missingLines} membre(s) n'ont pas encore de proposition : ils sont comptés dans leur unité actuelle.
              </p>
            )}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Unité</th>
                    <th className="px-3 py-2 font-medium">Chef d'unité</th>
                    <th className="px-3 py-2 font-medium text-center">À valider (CG)</th>
                    <th className="px-3 py-2 font-medium">Cette année → l'an prochain</th>
                    <th className="px-3 py-2 font-medium">Arrivent de</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                {rows.map(r => {
                  const isOpenRow = expanded === r.u.unitId
                  const pending = r.s?.pending ?? 0
                  return (
                    <tbody key={r.u.unitId} className="border-b last:border-b-0">
                      <tr className={cn('cursor-pointer hover:bg-muted/30', isOpenRow && 'bg-muted/20')}
                        onClick={() => setExpanded(isOpenRow ? null : r.u.unitId)}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', isOpenRow && 'rotate-90')} />
                            <span className="font-semibold">{r.u.unitCode}</span>
                            <span className="truncate text-xs text-muted-foreground">{r.u.unitName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">{r.s ? <StageBadge u={r.s} /> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2 text-center">
                          {pending > 0
                            ? <Badge variant="warning">{pending}</Badge>
                            : <CheckCircle2 className="mx-auto h-4 w-4 text-green-600 dark:text-green-400" aria-label="Rien à valider" />}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{r.currentCount}</span>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className={cn('font-semibold', r.overQuota && 'text-red-600 dark:text-red-400')}>{r.projected}</span>
                            {r.arrivals.length > 0 && <span className="text-xs text-green-700 dark:text-green-400">+{r.arrivals.length}</span>}
                            {r.departures.length > 0 && <span className="text-xs text-orange-600 dark:text-orange-400">−{r.departures.length}</span>}
                            {!!r.u.quota && (
                              <Badge variant={r.overQuota ? 'destructive' : 'outline'} className="text-[10px]">quota {r.u.quota}</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {r.byOrigin.length === 0 ? <span className="text-muted-foreground">—</span>
                            : r.byOrigin.map(([id, n]) => `${codeById.get(id) ?? '?'} ${n}`).join(' · ')}
                        </td>
                        <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                          {r.s && r.s.finalized === 0 && (r.s.submitted || r.s.missingLines === 0) && (
                            <Tip content={r.s.submitted ? 'Rouvrir pour le chef d\'unité (il pourra à nouveau modifier)' : 'Marquer comme terminée à la place du chef'}>
                              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busyUnitId === r.u.unitId}
                                onClick={() => onToggleFinished(r.u.unitId, r.s!.submitted)}>
                                {r.s.submitted ? <Unlock className="h-3.5 w-3.5" /> : <Flag className="h-3.5 w-3.5" />}
                              </Button>
                            </Tip>
                          )}
                        </td>
                      </tr>
                      {isOpenRow && (
                        <tr className="bg-muted/10">
                          <td colSpan={6} className="px-4 pb-4 pt-2">
                            <div className="grid gap-4 sm:grid-cols-3">
                              <div className="space-y-3">
                                {/* Members the chef hasn't given a line yet — counted as staying, listed apart so the CG sees who. */}
                                {r.noLine.length > 0 && (
                                  <div className="rounded-md border border-amber-300 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/30">
                                    <MemberList title="Sans proposition (restent pour l'instant)" tone="amber" items={r.noLine.map(m => m.memberName)} />
                                  </div>
                                )}
                                <MemberList title="Restent" tone="slate" items={r.stays.filter(m => m.lineStatus !== 'None').map(m => m.memberName)} />
                              </div>
                              <MemberList title="Arrivent" tone="green"
                                groups={r.byOrigin.map(([id]) => ({
                                  label: `de ${codeById.get(id) ?? '?'}`,
                                  names: r.arrivals.filter(m => m.currentUnitId === id).map(m => m.memberName),
                                }))} />
                              <MemberList title="Partent" tone="orange"
                                groups={r.byDest.map(([id]) => ({
                                  label: destLabel(id),
                                  names: r.departures.filter(m => r.eff.get(m.memberId) === id).map(m => m.memberName),
                                }))} />
                            </div>
                            <div className="mt-3">
                              <Button size="sm" variant="outline" onClick={() => onShowMembers(r.u.unitId)}>
                                Voir les lignes de passage de {r.u.unitCode}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  )
                })}
              </table>
            </div>
            {leavingTotal > 0 && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-orange-600 dark:text-orange-400">{leavingTotal}</span> membre(s) quittent le groupe.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// [key, count] pairs, biggest first.
function countBy<T>(items: T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>()
  for (const t of items) m.set(key(t), (m.get(key(t)) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

// One coloured column of the unit detail: a flat list, or names grouped (e.g. "de M2 — 12").
function MemberList({ title, tone, items, groups }: {
  title: string
  tone: 'slate' | 'green' | 'orange' | 'amber'
  items?: string[]
  groups?: { label: string; names: string[] }[]
}) {
  const head = tone === 'amber' ? 'text-amber-700 dark:text-amber-400' : tone === 'green' ? 'text-green-700 dark:text-green-400' : tone === 'orange' ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'
  const count = items ? items.length : (groups ?? []).reduce((n, g) => n + g.names.length, 0)
  return (
    <div>
      <div className={`mb-1 text-xs font-semibold ${head}`}>{title} — {count}</div>
      {count === 0 ? <p className="text-xs text-muted-foreground">—</p> : items ? (
        <ul className="space-y-0.5">{items.map((t, i) => <li key={i} className="text-xs">{t}</li>)}</ul>
      ) : (
        <div className="space-y-2">
          {groups!.map(g => (
            <div key={g.label}>
              <div className="flex items-center gap-1 text-xs font-medium"><Circle className="h-1.5 w-1.5 fill-current" />{g.label} — {g.names.length}</div>
              <ul className="ml-3 space-y-0.5">{g.names.map((n, i) => <li key={i} className="text-xs">{n}</li>)}</ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
