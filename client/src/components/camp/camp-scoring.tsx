// Camp BP — scoring of the grand jeu. A match = two familles at one game and one time slot.
//  • MatchScoreDialog: enter / correct one match (arrival, rounds, esprit split, first arrived on a tie). The
//    rounds offered depend on lateness (lib/camp-scoring mirrors the server rules) and the result is previewed.
//    "Saisie" says whether it was filled on the spot or typed in from the paper sheet afterwards.
//  • MatchList: the matches of one game (étapiste) or of a filter (commission), each with its score or "À saisir".
//  • CampScoringTab: the commission's view — filter by game or by time slot, progress, paper sheets, ranking.
import { useState } from 'react'
import { toast } from 'sonner'
import {
  useCampMatches, useSaveMatchScore, useClearMatchScore, useCampRanking, useCampRotation, printScoreSheets,
  type CampMatchDto, type CampLateness, type CampSide,
} from '@/services/camp-service'
import { roundsPlan, previewScore, firstByLateness, hhmm, LATENESS_LABELS } from '@/lib/camp-scoring'
import { parseApiError, parseBlobError } from '@/lib/error-utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Printer, Trophy, Pencil, CheckCircle2, FileText, Wifi } from 'lucide-react'

const famLabel = (n: number, name: string | null) => (name ? `F${n} · ${name}` : `F${n}`)

// Small segmented control (a row of buttons, one selected).
export function Segmented<T extends string | number>({ value, onChange, options, disabled }: {
  value: T | null; onChange: (v: T) => void; options: { value: T; label: string }[]; disabled?: boolean
}) {
  return (
    <div className="inline-flex flex-wrap overflow-hidden rounded-md border">
      {options.map(o => (
        <button key={String(o.value)} type="button" disabled={disabled} onClick={() => onChange(o.value)}
          className={cn('border-r px-2.5 py-1.5 text-sm last:border-r-0', value === o.value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted disabled:opacity-50')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function MatchScoreDialog({ campId, match, defaultSource, onClose }: {
  campId: string; match: CampMatchDto; defaultSource: 'online' | 'paper'; onClose: () => void
}) {
  const save = useSaveMatchScore(campId)
  const clear = useClearMatchScore(campId)
  const [retardA, setRetardA] = useState<CampLateness>(match.retardA ?? 'none')
  const [retardB, setRetardB] = useState<CampLateness>(match.retardB ?? 'none')
  const [manche1, setManche1] = useState<CampSide | null>(match.manche1)
  const [manche2, setManche2] = useState<CampSide | null>(match.manche2)
  const [espritA, setEspritA] = useState<number | null>(match.espritA)
  const [firstArrived, setFirstArrived] = useState<'A' | 'B' | null>(match.firstArrived)
  const [source, setSource] = useState<'online' | 'paper'>(match.source ?? defaultSource)
  const [confirmClear, setConfirmClear] = useState(false)

  const A = `F${match.familleA}`, B = `F${match.familleB}`
  const plan = roundsPlan(retardA, retardB)
  const p = previewScore({ retardA, retardB, manche1: plan.manche1 == null ? null : manche1, manche2: plan.manche2 == null ? null : manche2, espritA, firstArrived })
  const lateOptions = (['none', 'A', 'B'] as CampLateness[]).map(v => ({ value: v, label: LATENESS_LABELS[v] }))
  const sideOptions = [{ value: 'A' as CampSide, label: `${A} gagne` }, { value: 'tie' as CampSide, label: 'Égalité' }, { value: 'B' as CampSide, label: `${B} gagne` }]

  // A round's picker (a plain render helper, not a component — keeps the dialog's state stable).
  const round = (n: number, stake: number | null, value: CampSide | null, set: (v: CampSide) => void) => (
    <div className="space-y-1">
      <p className="text-sm font-medium">Manche {n}{stake != null && <span className="font-normal text-muted-foreground"> · sur {stake} points</span>}</p>
      {stake != null
        ? <Segmented value={value} onChange={set} options={sideOptions} />
        : <p className="text-sm text-muted-foreground">
            {n === 1 && plan.fixedA + plan.fixedB > 0 && plan.manche2 != null
              ? `Non jouée : 50 points à ${plan.fixedA > 0 ? A : B} (arrivée à l'heure).`
              : 'Non jouée (retard).'}
          </p>}
    </div>
  )

  const submit = async () => {
    if (p.missing) { toast.error(`À compléter : ${p.missing}`); return }
    try {
      await save.mutateAsync({ matchId: match.id, retardA, retardB, manche1: plan.manche1 == null ? null : manche1, manche2: plan.manche2 == null ? null : manche2, espritA, firstArrived: p.needsFirstArrived ? firstArrived : null, source })
      toast.success('Score enregistré'); onClose()
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[95vw] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Jeu {match.gameNumber}{match.gameName ? ` — ${match.gameName}` : ''} · étape {match.slotNumber}</DialogTitle>
          <p className="text-sm text-muted-foreground">{hhmm(match.startTime)}–{hhmm(match.endTime)} · {famLabel(match.familleA, match.familleAName)} contre {famLabel(match.familleB, match.familleBName)}</p>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><p className="text-sm font-medium">Arrivée de {A}</p><Segmented value={retardA} onChange={setRetardA} options={lateOptions} /></div>
            <div className="space-y-1"><p className="text-sm font-medium">Arrivée de {B}</p><Segmented value={retardB} onChange={setRetardB} options={lateOptions} /></div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">À l'heure : 0–3 min · Retard A : 3–7 min · Retard B : 7–10 min.</p>
          {round(1, plan.manche1, manche1, setManche1)}
          {round(2, plan.manche2, manche2, setManche2)}
          <div className="space-y-1">
            <p className="text-sm font-medium">Points d'esprit (5 à partager)</p>
            <Segmented value={espritA} onChange={setEspritA}
              options={[5, 4, 3, 2, 1, 0].map(v => ({ value: v, label: `${v} – ${5 - v}` }))} />
            <p className="text-xs text-muted-foreground">{A} à gauche, {B} à droite.</p>
          </div>
          {p.needsFirstArrived && p.pointsA === p.pointsB && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Égalité : quelle famille est arrivée en premier au complet ? (pour l'énigme)</p>
              <Segmented value={firstArrived} onChange={setFirstArrived} options={[{ value: 'A' as const, label: A }, { value: 'B' as const, label: B }]} />
            </div>
          )}
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <span><b>{A}</b> : {p.pointsA} + {espritA ?? '—'} esprit</span>
              <span><b>{B}</b> : {p.pointsB} + {espritA == null ? '—' : 5 - espritA} esprit</span>
            </div>
            <p className="mt-1">Énigme : <b>{p.enigme ? (p.enigme === 'A' ? A : B) : p.missing ? '—' : 'personne'}</b>
              {firstByLateness(retardA, retardB) && p.pointsA === p.pointsB && <span className="text-muted-foreground"> (arrivée en premier)</span>}</p>
            {p.missing && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">À compléter : {p.missing}</p>}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Saisie</p>
            <Segmented value={source} onChange={setSource} options={[{ value: 'online', label: 'Sur place' }, { value: 'paper', label: 'Depuis la feuille papier' }]} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {match.scoredAt && <Button variant="ghost" className="mr-auto text-destructive" onClick={() => setConfirmClear(true)}>Effacer le score</Button>}
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </DialogFooter>
        <ConfirmDialog open={confirmClear} onOpenChange={setConfirmClear} title="Effacer le score" variant="destructive" confirmLabel="Effacer" loading={clear.isPending}
          description="Ce match repassera en « À saisir »."
          onConfirm={async () => { try { await clear.mutateAsync(match.id); toast.success('Score effacé'); onClose() } catch (e) { toast.error(parseApiError(e)) } }} />
      </DialogContent>
    </Dialog>
  )
}

// One line per match. showGame = show the game (when listing a time slot), else the time.
export function MatchList({ campId, matches, showGame, defaultSource }: { campId: string; matches: CampMatchDto[]; showGame?: boolean; defaultSource: 'online' | 'paper' }) {
  const [editing, setEditing] = useState<CampMatchDto | null>(null)
  if (matches.length === 0) return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Aucun match.</p>
  return (
    <div className="divide-y rounded-lg border">
      {matches.map((m, i) => {
        const dayHeader = !showGame && m.date !== matches[i - 1]?.date ? m.date : null
        const scored = !!m.scoredAt
        const aWins = scored && (m.pointsA! + m.espritA!) > (m.pointsB! + m.espritB!)
        const bWins = scored && (m.pointsB! + m.espritB!) > (m.pointsA! + m.espritA!)
        return (
          <div key={m.id}>
            {dayHeader && <div className="bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">{new Date(dayHeader + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
                {showGame ? `Jeu ${m.gameNumber}` : `${m.slotNumber}. ${hhmm(m.startTime)}`}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className={cn('font-semibold', aWins && 'text-emerald-700 dark:text-emerald-400')}>F{m.familleA}</span>
                {scored
                  ? <span className="tabular-nums">{m.pointsA}<span className="text-muted-foreground">+{m.espritA}</span> – {m.pointsB}<span className="text-muted-foreground">+{m.espritB}</span></span>
                  : <span className="text-muted-foreground">contre</span>}
                <span className={cn('font-semibold', bWins && 'text-emerald-700 dark:text-emerald-400')}>F{m.familleB}</span>
                {scored && m.enigme && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">énigme F{m.enigme === 'A' ? m.familleA : m.familleB}</span>}
              </span>
              {scored
                ? <span className="flex items-center gap-1 text-xs text-muted-foreground" title={m.scoredByName ?? ''}>
                    {m.source === 'paper' ? <FileText className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}{m.scoredByName}
                  </span>
                : <span className="text-xs font-medium text-amber-700 dark:text-amber-400">À saisir</span>}
              {m.canEdit && (
                <Button size="sm" variant={scored ? 'ghost' : 'outline'} className="h-8" onClick={() => setEditing(m)}>
                  {scored ? <Pencil className="h-3.5 w-3.5" /> : 'Saisir'}
                </Button>
              )}
            </div>
          </div>
        )
      })}
      {editing && <MatchScoreDialog campId={campId} match={editing} defaultSource={defaultSource} onClose={() => setEditing(null)} />}
    </div>
  )
}

// Commission view: filter by game or time slot, see progress, print the paper sheets, see the ranking.
export function CampScoringTab({ campId }: { campId: string }) {
  const { data: rotation, isLoading } = useCampRotation(campId)
  const [mode, setMode] = useState<'game' | 'slot' | 'ranking'>('game')
  const [game, setGame] = useState(1)
  const [slot, setSlot] = useState(1)
  const { data: matches, isLoading: loadingMatches } = useCampMatches(campId, mode === 'game' ? { game } : { slot }, mode !== 'ranking' && !!rotation?.generated)

  if (isLoading) return <div className="flex h-40 items-center justify-center"><LoadingSpinner /></div>
  if (!rotation?.generated) return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Générez d'abord la rotation (onglet Rotation).</p>
  const pct = rotation.matchCount ? Math.round((rotation.scoredCount / rotation.matchCount) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-60 flex-1">
          <p className="text-sm"><b>{rotation.scoredCount}</b> / {rotation.matchCount} matchs saisis</p>
          <div className="mt-1 h-2 max-w-md overflow-hidden rounded-full bg-muted"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
        </div>
        <Button variant="outline" size="sm" onClick={() => printScoreSheets(campId).catch(async e => toast.error(await parseBlobError(e)))}>
          <Printer className="mr-1 h-4 w-4" />Feuilles de pointage (papier)
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'game', label: 'Par jeu' }, { value: 'slot', label: 'Par étape' }, { value: 'ranking', label: 'Classement' }]} />
        {mode === 'game' && (
          <Select value={String(game)} onValueChange={v => setGame(Number(v))}>
            <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
            <SelectContent>
              {rotation.games.map(g => <SelectItem key={g.number} value={String(g.number)}>Jeu {g.number}{g.name ? ` — ${g.name}` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {mode === 'slot' && (
          <Select value={String(slot)} onValueChange={v => setSlot(Number(v))}>
            <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
            <SelectContent>
              {rotation.slots.map(s => <SelectItem key={s.number} value={String(s.number)}>Étape {s.number} · {hhmm(s.startTime)}–{hhmm(s.endTime)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {mode === 'game' && (
          <Button variant="ghost" size="sm" onClick={() => printScoreSheets(campId, game).catch(async e => toast.error(await parseBlobError(e)))}>
            <Printer className="mr-1 h-4 w-4" />Feuille du jeu {game}
          </Button>
        )}
      </div>

      {mode === 'ranking'
        ? <CampRanking campId={campId} />
        : loadingMatches ? <LoadingSpinner variant="table" /> : <MatchList campId={campId} matches={matches ?? []} showGame={mode === 'slot'} defaultSource="paper" />}
    </div>
  )
}

function CampRanking({ campId }: { campId: string }) {
  const { data, isLoading } = useCampRanking(campId)
  if (isLoading || !data) return <LoadingSpinner variant="table" />
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Total = points des jeux + points d'esprit ({data.scoredCount} / {data.matchCount} matchs saisis).</p>
      {data.superFamilles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.superFamilles.map((s, i) => (
            <div key={s.name} className="rounded-lg border px-3 py-2 text-sm">
              <p className="font-semibold">{i === 0 && <Trophy className="mr-1 inline h-4 w-4 text-amber-500" />}{s.name}</p>
              <p className="text-muted-foreground">moy. {s.average} · total {s.total}</p>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Famille</th><th className="px-3 py-2 text-right">Jeux</th><th className="px-3 py-2 text-right">Esprit</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Énigmes</th><th className="px-3 py-2 text-right">Joués</th></tr>
          </thead>
          <tbody>
            {data.familles.map(r => (
              <tr key={r.number} className="border-t">
                <td className="px-3 py-1.5 font-semibold tabular-nums">{r.rank <= 3 && r.total > 0 ? <Trophy className={cn('inline h-4 w-4', r.rank === 1 ? 'text-amber-500' : r.rank === 2 ? 'text-slate-400' : 'text-orange-700')} /> : r.rank}</td>
                <td className="px-3 py-1.5"><b>F{r.number}</b>{r.name && <span className="text-muted-foreground"> · {r.name}</span>}{r.superFamille && <span className="ml-1 text-xs text-muted-foreground">({r.superFamille})</span>}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.gamePoints}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.esprit}</td>
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{r.total}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.enigmes}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{r.played}/25</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.scoredCount === data.matchCount && data.matchCount > 0 && <p className="flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" />Tous les matchs sont saisis.</p>}
    </div>
  )
}
