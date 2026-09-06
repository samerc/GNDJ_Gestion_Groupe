import { useMemo, useState } from 'react'
import { usePassageProjection, type PassageProjectionMember } from '@/services/passage-service'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { ChevronRight, TrendingUp, AlertTriangle } from 'lucide-react'

// CG "next year" projection panel for the passage page. Assumes all lines approved (simulation) so the CG can
// see the coming year's per-unit rosters BEFORE doing the approval work — with a toggle to compare against the
// réel (approved-only) state. Members with no proposal (or a rejected one) are assumed to stay put. Collapsed
// by default and fetched lazily (only when opened).

type Mode = 'simulation' | 'reel'
const LEAVE = '__leave__' // sentinel: the member quits the group next year

// Where a member ends up next year under the chosen mode. Approved lines always apply; a Pending line applies
// only in simulation (in réel it's "not yet decided" → the member stays); None/Rejected → stays.
function effectiveDest(m: PassageProjectionMember, mode: Mode): string {
  if (m.lineStatus === 'Approved') return m.isLeaving ? LEAVE : (m.destUnitId ?? m.currentUnitId)
  if (m.lineStatus === 'Pending') return mode === 'simulation' ? (m.isLeaving ? LEAVE : (m.destUnitId ?? m.currentUnitId)) : m.currentUnitId
  return m.currentUnitId // None / Rejected → stay
}

export function PassageProjection({ scoutYear }: { scoutYear: string }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('simulation')
  const [expanded, setExpanded] = useState<string | null>(null)
  const { data, isLoading } = usePassageProjection(scoutYear, open)

  // unitId → "CODE" for the "depuis/vers" labels in the expanded lists.
  const codeById = useMemo(() => new Map((data?.units ?? []).map(u => [u.unitId, u.unitCode])), [data])

  // Per-unit projection for the selected mode: current vs projected headcount + who stays/arrives/leaves.
  const rows = useMemo(() => {
    if (!data) return []
    const eff = new Map(data.members.map(m => [m.memberId, effectiveDest(m, mode)]))
    return data.units
      .map(u => {
        const current = data.members.filter(m => m.currentUnitId === u.unitId)
        const stays = current.filter(m => eff.get(m.memberId) === u.unitId)
        const departures = current.filter(m => eff.get(m.memberId) !== u.unitId)
        const leaving = departures.filter(m => eff.get(m.memberId) === LEAVE)
        const movedOut = departures.filter(m => eff.get(m.memberId) !== LEAVE)
        const arrivals = data.members.filter(m => m.currentUnitId !== u.unitId && eff.get(m.memberId) === u.unitId)
        const projected = stays.length + arrivals.length
        const overQuota = u.quota != null && projected > u.quota
        return { u, currentCount: current.length, projected, stays, arrivals, movedOut, leaving, overQuota, eff }
      })
      // Hide units that are empty both now and next year (noise).
      .filter(r => r.currentCount > 0 || r.projected > 0)
  }, [data, mode])

  // Group-wide totals: how many are here now, how many leave, how many remain in the group next year.
  const totals = useMemo(() => {
    if (!data) return null
    const leaving = data.members.filter(m => effectiveDest(m, mode) === LEAVE).length
    return { now: data.members.length, leaving, next: data.members.length - leaving }
  }, [data, mode])

  return (
    <Card>
      <CardContent className="p-0">
        {/* Header / expander */}
        <button
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30"
          onClick={() => setOpen(o => !o)}
        >
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
          <TrendingUp className="h-5 w-5 text-primary" />
          <span className="flex-1 font-medium">Projection de l'année prochaine</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Aperçu des effectifs par unité si les passages étaient appliqués
          </span>
        </button>

        {open && (
          <div className="border-t px-4 py-4">
            {isLoading || !data ? (
              <LoadingSpinner />
            ) : (
              <div className="space-y-4">
                {/* Mode toggle + totals */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex rounded-md border">
                    <Button variant={mode === 'simulation' ? 'default' : 'ghost'} size="sm" className="rounded-r-none"
                      onClick={() => setMode('simulation')}>Simulation (tout approuvé)</Button>
                    <Button variant={mode === 'reel' ? 'default' : 'ghost'} size="sm" className="rounded-l-none border-l"
                      onClick={() => setMode('reel')}>Réel (approuvé)</Button>
                  </div>
                  {totals && (
                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{totals.now}</span> membres actuels ·
                      {' '}<span className="font-medium text-foreground">{totals.next}</span> l'an prochain
                      {totals.leaving > 0 && <> · <span className="font-medium text-orange-600">{totals.leaving}</span> quittent</>}
                    </div>
                  )}
                </div>

                {/* Caveats */}
                <div className="space-y-1.5">
                  {mode === 'simulation' && (
                    <p className="text-xs text-muted-foreground">
                      Simulation&nbsp;: toutes les lignes (en attente + acceptées) sont comptées comme acceptées. Passez en «&nbsp;Réel&nbsp;» pour ne compter que les lignes déjà acceptées.
                    </p>
                  )}
                  {data.missingLines > 0 && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {data.missingLines} membre(s) sans proposition de passage — supposés rester dans leur unité.
                    </p>
                  )}
                </div>

                {/* Per-unit table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left">
                        <th className="px-3 py-2 font-medium">Unité</th>
                        <th className="px-3 py-2 font-medium text-center">Actuel</th>
                        <th className="px-3 py-2 font-medium text-center">Arrivées</th>
                        <th className="px-3 py-2 font-medium text-center">Départs</th>
                        <th className="px-3 py-2 font-medium text-center">Projeté</th>
                        <th className="px-3 py-2 font-medium text-right">Quota</th>
                      </tr>
                    </thead>
                    {rows.map((r, idx) => {
                      const isOpen = expanded === r.u.unitId
                      const departures = r.movedOut.length + r.leaving.length
                      return (
                        <tbody key={r.u.unitId}>
                          <tr
                            className={`border-b cursor-pointer hover:bg-muted/30 ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}
                            onClick={() => setExpanded(isOpen ? null : r.u.unitId)}
                          >
                            <td className="px-3 py-2 font-medium">
                              <span className="inline-flex items-center gap-1.5">
                                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                                {r.u.unitCode} — {r.u.unitName}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center text-muted-foreground">{r.currentCount}</td>
                            <td className="px-3 py-2 text-center">{r.arrivals.length > 0 ? <span className="text-green-700">+{r.arrivals.length}</span> : <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-3 py-2 text-center">{departures > 0 ? <span className="text-orange-600">−{departures}</span> : <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`font-semibold ${r.overQuota ? 'text-red-600' : ''}`}>{r.projected}</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              {r.u.quota != null
                                ? <Badge variant={r.overQuota ? 'destructive' : 'outline'}>{r.projected}/{r.u.quota}</Badge>
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className={idx % 2 === 1 ? 'bg-muted/10' : ''}>
                              <td colSpan={6} className="px-3 pb-4 pt-1">
                                <div className="grid gap-4 sm:grid-cols-3">
                                  <MemberList title="Restent" tone="slate" items={r.stays.map(m => m.memberName)} />
                                  <MemberList title="Arrivent" tone="green"
                                    items={r.arrivals.map(m => `${m.memberName} (depuis ${codeById.get(m.currentUnitId) ?? '?'})`)} />
                                  <MemberList title="Partent" tone="orange"
                                    items={[
                                      ...r.movedOut.map(m => `${m.memberName} → ${codeById.get(r.eff.get(m.memberId) ?? '') ?? '?'}`),
                                      ...r.leaving.map(m => `${m.memberName} — quitte le groupe`),
                                    ]} />
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      )
                    })}
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// One coloured column of member names in the expanded unit detail.
function MemberList({ title, tone, items }: { title: string; tone: 'slate' | 'green' | 'orange'; items: string[] }) {
  const head = tone === 'green' ? 'text-green-700' : tone === 'orange' ? 'text-orange-600' : 'text-muted-foreground'
  return (
    <div>
      <div className={`mb-1 text-xs font-semibold ${head}`}>{title} — {items.length}</div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((t, i) => <li key={i} className="text-xs">{t}</li>)}
        </ul>
      )}
    </div>
  )
}
