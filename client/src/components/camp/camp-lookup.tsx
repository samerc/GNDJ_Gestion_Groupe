// Camp BP — "where is this famille?" A lost member at the camp: type their name (or a famille number), pick them,
// and see their famille with the step before, the step in progress (or the next one when between two steps) and
// the step after — game, place (rain plan aware), opponent, étapistes — plus the Père / Mère to call.
// The moment defaults to now (camp time, taken from the server so a wrong phone clock doesn't matter) and can be
// changed to answer "where will they be at 15h?". Used by the commission, the CUs (/camp) and the étapistes.
import { useEffect, useState } from 'react'
import { useCampLookup, useFamilleSchedule, type CampScheduleStepDto, type CampFamilleScheduleDto } from '@/services/camp-service'
import { useDebounce } from '@/hooks/use-debounce'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { SearchInput } from '@/components/shared/search-input'
import { Callout } from '@/components/shared/callout'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Search, MapPin, CloudRain, Phone, Users, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { hhmm } from '@/lib/camp-scoring'

// Local wall-clock Date from 'yyyy-MM-dd' + 'HH:mm:ss' (camp time).
const at = (date: string, time: string) => new Date(`${date}T${time}`)
const dayLabel = (date: string) => new Date(date + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

interface Position { prev: CampScheduleStepDto | null; current: CampScheduleStepDto | null; next: CampScheduleStepDto | null; status: string }

// Where the famille is at `t`: the step running now, else "on the way" to the next one.
function positionAt(steps: CampScheduleStepDto[], t: Date): Position {
  const sorted = [...steps].sort((a, b) => a.slot - b.slot)
  const i = sorted.findIndex(s => at(s.date, s.startTime) <= t && t <= at(s.date, s.endTime))
  if (i >= 0) return { prev: sorted[i - 1] ?? null, current: sorted[i], next: sorted[i + 1] ?? null, status: 'En jeu' }
  const nextIdx = sorted.findIndex(s => at(s.date, s.startTime) > t)
  if (nextIdx === 0) return { prev: null, current: null, next: sorted[0], status: "Le grand jeu n'a pas encore commencé" }
  if (nextIdx < 0) return { prev: sorted[sorted.length - 1] ?? null, current: null, next: null, status: 'Le grand jeu est terminé' }
  const prev = sorted[nextIdx - 1], next = sorted[nextIdx]
  const sameDay = prev.date === next.date
  return { prev, current: null, next, status: sameDay ? `Entre deux étapes — prochaine à ${hhmm(next.startTime)}` : `Pause — reprise ${dayLabel(next.date)} à ${hhmm(next.startTime)}` }
}

export function CampLookup({ campId }: { campId: string }) {
  const [q, setQ] = useState('')
  const debounced = useDebounce(q.trim(), 250)
  const { data: results, isFetching } = useCampLookup(campId, debounced)
  const [famille, setFamille] = useState<number | null>(null)
  const [who, setWho] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <SearchInput value={q} onChange={setQ} placeholder="Nom d'un membre ou numéro de famille…" className="max-w-md" />

      {debounced && (
        <div className="max-w-md">
          {isFetching && !results ? <LoadingSpinner /> : (results ?? []).length === 0
            ? <p className="text-sm text-muted-foreground">Aucun résultat.</p>
            : <div className="divide-y rounded-lg border">
                {results!.map(r => (
                  <button key={`${r.memberId}-${r.familleNumber}`} type="button" disabled={r.familleNumber == null}
                    onClick={() => { setFamille(r.familleNumber); setWho(r.role === 'Famille' ? null : `${r.firstName} ${r.lastName}`); setQ('') }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50">
                    <span className="min-w-0">
                      <span className="font-medium">{r.role === 'Famille' ? `Famille ${r.familleNumber}` : `${r.firstName} ${r.lastName}`}</span>
                      {r.role !== 'Famille' && <span className="text-muted-foreground"> · {r.unitCode ?? '—'}{r.role !== 'Membre' && ` · ${r.role}`}</span>}
                    </span>
                    <span className="shrink-0 font-semibold">F{r.familleNumber}{r.familleName && <span className="font-normal text-muted-foreground"> · {r.familleName}</span>}</span>
                  </button>
                ))}
              </div>}
        </div>
      )}

      {famille != null && <FamilleWhereabouts campId={campId} number={famille} who={who} />}
    </div>
  )
}

function FamilleWhereabouts({ campId, number, who }: { campId: string; number: number; who: string | null }) {
  const { data, isLoading, error } = useFamilleSchedule(campId, number)
  if (isLoading) return <LoadingSpinner />
  if (error || !data) return <Callout tone="danger">Parcours introuvable (la rotation a-t-elle été générée ?).</Callout>
  return <Whereabouts data={data} who={who} />
}

function Whereabouts({ data, who }: { data: CampFamilleScheduleDto; who: string | null }) {
  // Camp time = server time: remember the gap with this device's clock, then tick every 30 s.
  const [offset] = useState(() => new Date(data.now).getTime() - Date.now())
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setTick(Date.now()), 30_000); return () => clearInterval(t) }, [])
  const [custom, setCustom] = useState<string>('') // 'yyyy-MM-ddTHH:mm' — empty = now
  const [showAll, setShowAll] = useState(false)
  const moment = custom ? new Date(custom) : new Date(tick + offset)
  const pos = positionAt(data.steps, moment)
  const days = [...new Set(data.steps.map(s => s.date))].sort()

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-4">
        {who && <p className="text-sm text-muted-foreground">{who} est dans la</p>}
        <p className="text-2xl font-bold">Famille {data.number}{data.name && <span className="font-semibold text-muted-foreground"> · {data.name}</span>}</p>
        <p className="text-sm text-muted-foreground">{data.superFamille && <>{data.superFamille} · </>}<Users className="mr-0.5 inline h-3.5 w-3.5" />{data.memberCount} membres</p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {[['Père', data.pereName, data.perePhone], ['Mère', data.mereName, data.merePhone]].map(([label, name, phone]) => name && (
            <span key={label}>{label} : <b>{name}</b>{phone && <a href={`tel:${phone!.replace(/\s/g, '')}`} className="ml-1.5 inline-flex items-center gap-1 text-primary hover:underline"><Phone className="h-3.5 w-3.5" />{phone}</a>}</span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{custom ? moment.toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : `Maintenant (${moment.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})`}</span>
        <span className="text-muted-foreground">·</span>
        <select aria-label="Jour" className="rounded border bg-background px-2 py-1 text-sm" value={custom ? custom.slice(0, 10) : ''}
          onChange={e => setCustom(e.target.value ? `${e.target.value}T${custom ? custom.slice(11) : '12:00'}` : '')}>
          <option value="">Maintenant</option>
          {days.map(d => <option key={d} value={d}>{dayLabel(d)}</option>)}
        </select>
        {custom && <input type="time" aria-label="Heure" className="rounded border bg-background px-2 py-1 text-sm" value={custom.slice(11, 16)} onChange={e => setCustom(`${custom.slice(0, 10)}T${e.target.value}`)} />}
        {data.useBackupLocations && <Badge variant="info" className="gap-1"><CloudRain className="h-3.5 w-3.5" />Plan B (mauvais temps)</Badge>}
      </div>
      <p className="text-sm font-medium">{pos.status}</p>

      <div className="grid gap-3 md:grid-cols-3">
        <StepCard title="Étape précédente" step={pos.prev} planB={data.useBackupLocations} />
        {pos.current
          ? <StepCard title="En ce moment" step={pos.current} planB={data.useBackupLocations} highlight />
          : <StepCard title="Prochaine étape" step={pos.next} planB={data.useBackupLocations} highlight />}
        <StepCard title={pos.current ? 'Étape suivante' : 'Celle d’après'}
          step={pos.current ? pos.next : (pos.next ? data.steps.find(s => s.slot === pos.next!.slot + 1) ?? null : null)} planB={data.useBackupLocations} />
      </div>

      <Button variant="ghost" size="sm" onClick={() => setShowAll(v => !v)}>
        {showAll ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}Tout le parcours
      </Button>
      {showAll && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <tbody>
              {[...data.steps].sort((a, b) => a.slot - b.slot).map(s => {
                const active = pos.current?.slot === s.slot || (!pos.current && pos.next?.slot === s.slot)
                return (
                  <tr key={s.slot} className={cn('border-t first:border-t-0', active && 'bg-primary/10 font-medium')}>
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-muted-foreground">{s.slot}. {hhmm(s.startTime)}</td>
                    <td className="px-3 py-1.5">Jeu {s.gameNumber}{s.gameName && ` — ${s.gameName}`}</td>
                    <td className="px-3 py-1.5">{place(s, data.useBackupLocations) ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right">contre F{s.opponent}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const place = (s: CampScheduleStepDto, planB: boolean) => (planB ? s.backupLocation ?? s.mainLocation : s.mainLocation)

function StepCard({ title, step, planB, highlight }: { title: string; step: CampScheduleStepDto | null; planB: boolean; highlight?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-3', highlight ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card')}>
      <p className={cn('text-xs font-semibold uppercase tracking-wide', highlight ? 'text-primary' : 'text-muted-foreground')}>{title}</p>
      {!step ? <p className="mt-2 text-sm text-muted-foreground">—</p> : (
        <div className="mt-1 space-y-1">
          <p className="text-sm text-muted-foreground">{hhmm(step.startTime)}–{hhmm(step.endTime)} · étape {step.slot}</p>
          <p className="font-semibold">Jeu {step.gameNumber}{(planB && step.backupGameName ? step.backupGameName : step.gameName) && ` — ${planB && step.backupGameName ? step.backupGameName : step.gameName}`}</p>
          {planB && step.backupGameName && <p className="text-xs text-sky-700 dark:text-sky-400">Jeu de repli (au lieu de « {step.gameName ?? `Jeu ${step.gameNumber}`} »)</p>}
          <p className={cn('flex items-center gap-1.5', highlight && 'text-lg font-bold')}>
            {planB ? <CloudRain className="h-4 w-4 shrink-0 text-sky-600" /> : <MapPin className="h-4 w-4 shrink-0 text-primary" />}
            {place(step, planB) ?? 'Lieu non défini'}
          </p>
          {planB && step.mainLocation && step.backupLocation && <p className="text-xs text-muted-foreground">(habituellement : {step.mainLocation})</p>}
          <p className="text-sm">contre <b>F{step.opponent}</b>{step.opponentName && <span className="text-muted-foreground"> · {step.opponentName}</span>}</p>
          {step.etapistes.length > 0 && <p className="text-xs text-muted-foreground">Étapistes : {step.etapistes.join(', ')}</p>}
        </div>
      )}
    </div>
  )
}

// Collapsible card version (CU Camp BP page, "Mes jeux"): closed by default so it doesn't push the page down.
export function CampLookupCard({ campId }: { campId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border bg-card">
      <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="flex items-center gap-2 font-semibold"><Search className="h-4 w-4 text-primary" />Où est une famille ?</span>
        <span className="text-sm text-muted-foreground">{open ? 'Fermer' : 'Retrouver un membre perdu'}</span>
      </button>
      {open && <div className="border-t p-4"><CampLookup campId={campId} /></div>}
    </div>
  )
}
