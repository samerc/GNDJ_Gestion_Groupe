// Camp BP — the grand jeu rotation (commission, Jeux area). The grid is fixed (50 familles × 25 games × 25 slots,
// the same every year): only the two dates, the hours of the slots and the place of each game change.
//  • Generate: pick the two camp days → creates the 25 slots (default hours) and the 625 matches.
//  • Hours: edit each slot's date / start / end (the grid itself can't be changed).
//  • Plan B: switch the whole camp to the bad-weather places (lookup + passports follow).
//  • Games: which game has each number 1–25 (numbers are set in the Jeux tab) with its places.
//  • Printouts: famille passports and the paper score sheets.
import { useState } from 'react'
import { toast } from 'sonner'
import {
  useCampRotation, useGenerateRotation, useUpdateRotationSlots, useSetPlanB, printPassports, printScoreSheets,
  type CampRotationSlotDto,
} from '@/services/camp-service'
import { parseApiError, parseBlobError } from '@/lib/error-utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Printer, CloudRain, RefreshCw, Save, AlertTriangle, MapPin } from 'lucide-react'

const dayLabel = (date: string) => new Date(date + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

export function CampRotationTab({ campId, readOnly }: { campId: string; readOnly: boolean }) {
  const { data, isLoading } = useCampRotation(campId)
  const generate = useGenerateRotation(campId)
  const saveSlots = useUpdateRotationSlots(campId)
  const planB = useSetPlanB(campId)
  const [days, setDays] = useState({ first: '', second: '' })
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [slots, setSlots] = useState<CampRotationSlotDto[]>([])
  const [prev, setPrev] = useState(data)
  if (data !== prev) { setPrev(data); setSlots(data?.slots ?? []) }

  if (isLoading || !data) return <div className="flex h-40 items-center justify-center"><LoadingSpinner /></div>

  const runGenerate = async () => {
    if (!days.first || !days.second) { toast.error('Choisissez les deux jours du camp.'); return }
    try { await generate.mutateAsync({ firstDay: days.first, secondDay: days.second }); toast.success('Rotation générée'); setConfirmRegen(false) }
    catch (e) { toast.error(parseApiError(e)) }
  }
  const dayInputs = (
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm"><span className="block font-medium">1er jour (étapes 1–15)</span>
        <Input type="date" value={days.first} onChange={e => setDays(d => ({ ...d, first: e.target.value, second: d.second || nextDay(e.target.value) }))} className="w-44" /></label>
      <label className="space-y-1 text-sm"><span className="block font-medium">2ème jour (étapes 16–25)</span>
        <Input type="date" value={days.second} onChange={e => setDays(d => ({ ...d, second: e.target.value }))} className="w-44" /></label>
    </div>
  )

  if (!data.generated) return (
    <div className="max-w-2xl space-y-4 rounded-lg border p-5">
      <div>
        <h3 className="font-semibold">Rotation du grand jeu</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          La grille est fixe : 50 familles, 25 jeux, 25 étapes (15 le premier jour, 10 le second). À chaque étape, chaque jeu est joué par deux familles ;
          chaque famille joue tous les jeux une fois et ne rencontre jamais deux fois la même famille. Choisissez les deux jours du camp —
          les horaires habituels sont proposés et restent modifiables.
        </p>
      </div>
      {readOnly ? <p className="text-sm text-muted-foreground">La rotation n'a pas encore été générée.</p> : <>
        {dayInputs}
        <Button onClick={runGenerate} disabled={generate.isPending}><RefreshCw className="mr-1 h-4 w-4" />{generate.isPending ? 'Génération…' : 'Générer la rotation'}</Button>
      </>}
    </div>
  )

  const dirty = JSON.stringify(slots) !== JSON.stringify(data.slots)
  const missingGames = data.games.filter(g => !g.gameId).map(g => g.number)
  const setSlot = (n: number, patch: Partial<CampRotationSlotDto>) => setSlots(s => s.map(x => (x.number === n ? { ...x, ...patch } : x)))
  const byDay = [...new Set(slots.map(s => s.date))].sort()

  return (
    <div className="space-y-5">
      {/* Warnings that break the lookup / printouts. */}
      {(data.existingFamilles !== 50 || missingGames.length > 0) && (
        <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {data.existingFamilles !== 50 && <p className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />La grille prévoit 50 familles ; ce camp en a {data.existingFamilles}. Les familles au-delà n'ont pas de parcours, les numéros manquants laissent leur adversaire sans match.</p>}
          {missingGames.length > 0 && <p className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Aucun jeu n'a encore le numéro {missingGames.join(', ')} — donnez-leur un numéro dans l'onglet Jeux (sinon le lieu n'apparaît pas).</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', data.useBackupLocations && 'border-sky-400 bg-sky-50 dark:bg-sky-950/40')}>
          <CloudRain className="h-4 w-4 text-sky-600" />
          <span className="font-medium">Plan B (mauvais temps)</span>
          <Switch checked={data.useBackupLocations} disabled={readOnly || planB.isPending} aria-label="Plan B"
            onCheckedChange={async v => { try { await planB.mutateAsync(v); toast.success(v ? 'Plan B activé : les lieux de repli sont affichés' : 'Retour aux lieux habituels') } catch (e) { toast.error(parseApiError(e)) } }} />
        </label>
        <Button variant="outline" size="sm" onClick={() => printPassports(campId).catch(async e => toast.error(await parseBlobError(e)))}><Printer className="mr-1 h-4 w-4" />Passeports des familles</Button>
        <Button variant="outline" size="sm" onClick={() => printScoreSheets(campId).catch(async e => toast.error(await parseBlobError(e)))}><Printer className="mr-1 h-4 w-4" />Feuilles de pointage</Button>
        {!readOnly && data.scoredCount === 0 && <Button variant="ghost" size="sm" onClick={() => setConfirmRegen(true)}><RefreshCw className="mr-1 h-4 w-4" />Changer les jours</Button>}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Slot hours */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Horaires des étapes</h3>
            {!readOnly && dirty && <Button size="sm" disabled={saveSlots.isPending}
              onClick={async () => { try { await saveSlots.mutateAsync(slots); toast.success('Horaires enregistrés') } catch (e) { toast.error(parseApiError(e)) } }}>
              <Save className="mr-1 h-4 w-4" />Enregistrer</Button>}
          </div>
          {byDay.map(d => (
            <div key={d} className="rounded-lg border">
              <p className="border-b bg-muted/50 px-3 py-1.5 text-sm font-medium capitalize">{dayLabel(d)}</p>
              <div className="divide-y">
                {slots.filter(s => s.date === d).map(s => (
                  <div key={s.number} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="w-16 text-muted-foreground">Étape {s.number}</span>
                    <Input type="time" value={s.startTime.slice(0, 5)} disabled={readOnly} className="h-8 w-28" onChange={e => setSlot(s.number, { startTime: e.target.value + ':00' })} />
                    <span>–</span>
                    <Input type="time" value={s.endTime.slice(0, 5)} disabled={readOnly} className="h-8 w-28" onChange={e => setSlot(s.number, { endTime: e.target.value + ':00' })} />
                    {!readOnly && <select className="h-8 rounded border bg-background px-1 text-xs" value={s.date} onChange={e => setSlot(s.number, { date: e.target.value })}>
                      {byDay.map(x => <option key={x} value={x}>{dayLabel(x)}</option>)}
                    </select>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Games by number */}
        <div className="space-y-2">
          <h3 className="font-semibold">Jeux et lieux</h3>
          <div className="divide-y rounded-lg border">
            {data.games.map(g => (
              <div key={g.number} className={cn('flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5 text-sm', !g.gameId && 'bg-amber-50/60 dark:bg-amber-950/20')}>
                <span className="w-14 font-semibold">Jeu {g.number}</span>
                <span className="min-w-0 flex-1">
                  {g.name ?? <span className="text-amber-700 dark:text-amber-400">aucun jeu</span>}
                  {g.backupGameName && <span className={cn('ml-2 text-xs', data.useBackupLocations ? 'font-medium text-sky-700 dark:text-sky-400' : 'text-muted-foreground')}>· plan B : {g.backupGameName}</span>}
                </span>
                <span className={cn('flex items-center gap-1', data.useBackupLocations && 'text-muted-foreground line-through')}><MapPin className="h-3.5 w-3.5" />{g.mainLocation ?? '—'}</span>
                <span className={cn('flex items-center gap-1', !data.useBackupLocations && 'text-muted-foreground')}><CloudRain className="h-3.5 w-3.5" />{g.backupLocation ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ConfirmDialog open={confirmRegen} onOpenChange={setConfirmRegen} title="Changer les jours du camp" confirmLabel="Régénérer"
        description="La rotation est recréée pour ces deux jours avec les horaires habituels (les horaires modifiés sont perdus). Possible tant qu'aucun score n'a été saisi."
        loading={generate.isPending} onConfirm={runGenerate}>{dayInputs}</ConfirmDialog>
    </div>
  )
}

function nextDay(d: string) {
  if (!d) return ''
  const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
