import { useState, useEffect, useMemo } from 'react'
import { useCamps, useCamp, useCampAttendance, useSetCampAttendance, useCampGrading, useSaveCampGrades, type CampGradeRowDto } from '@/services/camp-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { Tent, Users, Save, Star } from 'lucide-react'
import { toast } from 'sonner'

// CU page: specify the camp info for their unit's members (attendance + Force + année + Père/Mère flag).
export default function CampPage() {
  const { data: camps, isLoading: loadingCamps } = useCamps()
  const active = useMemo(() => camps?.find(c => !c.isArchived) ?? camps?.[0], [camps])
  const campId = active?.id
  const { data: camp } = useCamp(campId)

  const { data: grading, isLoading } = useCampGrading(campId)
  const saveGrades = useSaveCampGrades(campId ?? '')

  const [rows, setRows] = useState<Record<string, { force: number | null; annee: number | null; isLeaderCandidate: boolean; notes: string }>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!grading) return
    const m: typeof rows = {}
    for (const g of grading) m[g.participantId] = { force: g.force, annee: g.annee, isLeaderCandidate: g.isLeaderCandidate, notes: g.notes ?? '' }
    setRows(m); setDirty(false)
  }, [grading])

  // Live Note preview from the camp formula.
  const noteOf = (branche: string | null, force: number | null, annee: number | null) => {
    if (!camp || force == null || annee == null) return null
    const mult = camp.branchMultipliers.find(b => b.unitTypeName === branche)?.multiplier ?? 5
    return camp.noteForceCoef * force + mult * annee + camp.noteOffset
  }

  const set = (pid: string, patch: Partial<{ force: number | null; annee: number | null; isLeaderCandidate: boolean; notes: string }>) => {
    setRows(r => ({ ...r, [pid]: { ...r[pid], ...patch } })); setDirty(true)
  }

  const save = async () => {
    try {
      await saveGrades.mutateAsync(Object.entries(rows).map(([participantId, v]) => ({ participantId, force: v.force, annee: v.annee, isLeaderCandidate: v.isLeaderCandidate, notes: v.notes || null })))
      toast.success('Notes enregistrées'); setDirty(false)
    } catch (e) { toast.error(parseApiError(e)) }
  }

  if (loadingCamps) return <div className="flex h-64 items-center justify-center"><LoadingSpinner /></div>
  if (!active) return (
    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      <Tent className="mx-auto mb-2 h-8 w-8 opacity-50" />Aucun camp n'est ouvert pour le moment.
    </div>
  )

  const byBranche = (grading ?? []).reduce<Record<string, CampGradeRowDto[]>>((acc, g) => { (acc[g.branche ?? '—'] ||= []).push(g); return acc }, {})

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><Tent className="h-5 w-5 text-primary" />{active.name}</h1>
          <p className="text-sm text-muted-foreground">Notez vos membres pour le camp — présence, force, année et candidats Père/Mère.</p>
        </div>
        <div className="flex items-center gap-2">
          {campId && <AttendanceButton campId={campId} />}
          <Button onClick={save} disabled={!dirty || saveGrades.isPending}><Save className="mr-1 h-4 w-4" />{saveGrades.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </div>
      </div>

      {isLoading ? <div className="flex h-40 items-center justify-center"><LoadingSpinner /></div> :
       (grading ?? []).length === 0 ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Aucun membre présent. Cliquez sur « Présences » pour marquer qui participe.</p> :
       Object.entries(byBranche).sort().map(([branche, gs]) => (
        <div key={branche} className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{branche} <span className="font-normal">({gs.length})</span></h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-left font-medium">Membre</th>
                  <th className="p-2 text-left font-medium w-20">Année</th>
                  <th className="p-2 text-left font-medium w-24">Force /5</th>
                  <th className="p-2 text-center font-medium w-24">Père/Mère</th>
                  <th className="p-2 text-right font-medium w-16">Note</th>
                  <th className="p-2 text-left font-medium">Cas particulier</th>
                </tr>
              </thead>
              <tbody>
                {gs.map(g => {
                  const r = rows[g.participantId] ?? { force: null, annee: null, isLeaderCandidate: false, notes: '' }
                  const note = noteOf(g.branche, r.force, r.annee)
                  return (
                    <tr key={g.participantId} className="border-t">
                      <td className="p-2">{g.firstName} {g.lastName} {g.gender === 'Féminin' ? '♀' : g.gender === 'Masculin' ? '♂' : ''}</td>
                      <td className="p-2"><Input type="number" min={1} max={10} value={r.annee ?? ''} onChange={e => set(g.participantId, { annee: e.target.value ? Number(e.target.value) : null })} className="h-8 w-16" /></td>
                      <td className="p-2">
                        <Select value={r.force?.toString() ?? ''} onValueChange={v => set(g.participantId, { force: v ? Number(v) : null })}>
                          <SelectTrigger className="h-8 w-20"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>{[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="p-2 text-center">
                        <button type="button" onClick={() => set(g.participantId, { isLeaderCandidate: !r.isLeaderCandidate })}
                          title="Candidat Père/Mère" className={r.isLeaderCandidate ? 'text-amber-500' : 'text-muted-foreground/40 hover:text-muted-foreground'}>
                          <Star className="h-4 w-4" fill={r.isLeaderCandidate ? 'currentColor' : 'none'} />
                        </button>
                      </td>
                      <td className="p-2 text-right font-medium tabular-nums">{note != null ? note : '—'}</td>
                      <td className="p-2"><Input value={r.notes} onChange={e => set(g.participantId, { notes: e.target.value })} className="h-8" placeholder="—" /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Attendance dialog ──
function AttendanceButton({ campId }: { campId: string }) {
  const [open, setOpen] = useState(false)
  const { data: attendees, isLoading } = useCampAttendance(open ? campId : undefined)
  const setAttendance = useSetCampAttendance(campId)
  const [present, setPresent] = useState<Record<string, boolean>>({})

  useEffect(() => { if (attendees) setPresent(Object.fromEntries(attendees.map(a => [a.memberId, a.isAttending]))) }, [attendees])

  const save = async () => {
    try {
      await setAttendance.mutateAsync(Object.entries(present).map(([memberId, attending]) => ({ memberId, attending })))
      toast.success('Présences enregistrées'); setOpen(false)
    } catch (e) { toast.error(parseApiError(e)) }
  }
  const byBranche = (attendees ?? []).reduce<Record<string, typeof attendees>>((acc, a) => { (acc[a.branche ?? '—'] ||= []).push(a); return acc }, {})
  const count = Object.values(present).filter(Boolean).length

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Users className="mr-1 h-4 w-4" />Présences</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Présences au camp — {count} présent(s)</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {isLoading ? <div className="flex h-32 items-center justify-center"><LoadingSpinner /></div> :
             Object.entries(byBranche).sort().map(([branche, members]) => (
              <div key={branche}>
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{branche}</p>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {(members ?? []).map(a => (
                    <label key={a.memberId} className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm">
                      <input type="checkbox" checked={present[a.memberId] ?? false} onChange={e => setPresent(p => ({ ...p, [a.memberId]: e.target.checked }))} />
                      {a.firstName} {a.lastName}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={save} disabled={setAttendance.isPending}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
