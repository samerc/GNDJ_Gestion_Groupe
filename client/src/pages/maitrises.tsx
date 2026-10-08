import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  useMaitrisePlan, usePlanMaitriseStart, usePlanMaitriseEnd, usePlanMaitriseChange, useCancelMaitrisePlan,
  useAddMaitriseNow, useRemoveFromMaitrise, useTransferMaitrise, useMaitriseCandidates,
  type MaitrisePlan, type MaitrisePlanLine, type MaitrisePlanMember, type MaitrisePlanUnit,
} from '@/services/maitrise-service'
import { useFunctionalRoles } from '@/services/role-service'
import { useDebounce } from '@/hooks/use-debounce'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { parseApiError } from '@/lib/error-utils'
import { cn, formatDateLong } from '@/lib/utils'
import { Callout } from '@/components/shared/callout'
import { EmptyState } from '@/components/shared/empty-state'
import { SearchInput } from '@/components/shared/search-input'
import { Textarea } from '@/components/ui/textarea'
import { Tip } from '@/components/ui/tooltip'
import {
  Crown, ChevronRight, UserPlus, ArrowRightLeft, UserMinus, Undo2, AlertTriangle, CalendarClock, CheckCircle2, ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'

// Maîtrises (CG, maitrise.manage). Like the passage page: one row per unit showing this year's maîtrise and next
// year's, with who stays / arrives / leaves. Changes are PLANNED for next year by default and applied when the CG
// publishes the passage (same passage date); a "maintenant" option still exists for mid-year changes.

// Everything the page shows for one unit, derived from the plan.
interface UnitView {
  unit: MaitrisePlanUnit
  staying: MaitrisePlanMember[]
  leaving: { member: MaitrisePlanMember; line: MaitrisePlanLine; where: string }[]
  arriving: { line: MaitrisePlanLine; origin: string }[]
  nowCount: number
  nextCount: number
  headNow: string | null
  headNext: string | null
  changes: number
}

// Only lines not yet applied count (applied ones are already reflected in `unit.current` after the passage).
function buildViews(plan: MaitrisePlan): UnitView[] {
  const pending = plan.lines.filter(l => !l.applied)
  const codeOf = new Map(plan.units.map(u => [u.unitId, u.unitCode]))
  const currentUnitsOf = new Map<string, string[]>()
  for (const u of plan.units) for (const m of u.current) currentUnitsOf.set(m.memberId, [...(currentUnitsOf.get(m.memberId) ?? []), u.unitId])
  const name = (m: { firstName: string; lastName: string }) => `${m.firstName} ${m.lastName}`
  const distinct = (ids: string[]) => new Set(ids).size

  return plan.units.map(unit => {
    const ends = pending.filter(l => l.kind === 'End' && l.unitId === unit.unitId)
    const starts = pending.filter(l => l.kind === 'Start' && l.unitId === unit.unitId)
    const endIds = new Set(ends.map(l => l.assignmentId))
    const staying = unit.current.filter(m => !endIds.has(m.assignmentId))
    // A member who changes function inside the unit (e.g. assistant → chef) is shown once, under Arrivent.
    const leaving = ends.filter(line => !starts.some(s => s.memberId === line.memberId)).map(line => {
      const member = unit.current.find(m => m.assignmentId === line.assignmentId)!
      const start = pending.find(l => l.kind === 'Start' && l.memberId === line.memberId && l.unitId !== unit.unitId)
      const by = line.causedByLineId ? pending.find(l => l.id === line.causedByLineId && l.memberId !== line.memberId) : undefined
      // Why a leader leaves: moves to another unit, is replaced by a new head (head swap), or simply stops.
      const where = start ? `va à ${codeOf.get(start.unitId)}` : by ? `remplacé(e) par ${by.firstName} ${by.lastName}` : 'arrête'
      return { member, line, where }
    }).filter(x => x.member)
    const arriving = starts.map(line => {
      const fromEnd = pending.find(l => l.kind === 'End' && l.memberId === line.memberId && l.unitId !== unit.unitId)
      const sameUnitEnd = ends.find(l => l.memberId === line.memberId)
      const origin = sameUnitEnd ? `était ${sameUnitEnd.functionName}`
        : fromEnd ? `vient de ${codeOf.get(fromEnd.unitId)}`
        : line.joinsFromYouth ? `jeune${line.youthUnitCode ? ` de ${line.youthUnitCode}` : ''}`
        : (currentUnitsOf.get(line.memberId) ?? []).includes(unit.unitId) ? 'nouvelle fonction'
        : (currentUnitsOf.get(line.memberId) ?? []).length ? 'en plus de ses fonctions actuelles'
        : 'nouveau'
      return { line, origin }
    })
    const headNowM = unit.current.find(m => m.isHead)
    // Next year's head = a staying head, else an arriving line that gives a head function.
    const headNextM = staying.find(m => m.isHead) ?? arriving.find(a => a.line.isHead)?.line
    return {
      unit, staying, leaving, arriving,
      // Counts are distinct MEMBERS (one person can hold two functions in the same unit).
      nowCount: distinct(unit.current.map(m => m.memberId)),
      nextCount: distinct([...staying.map(m => m.memberId), ...arriving.map(a => a.line.memberId)]),
      headNow: headNowM ? name(headNowM) : null,
      headNext: headNextM ? name(headNextM) : null,
      changes: leaving.length + arriving.length,
    }
  })
}

// Route /maitrises (maitrise.manage). One GET of the plan for the current scout year; every unit row is derived from it.
export default function MaitrisesPage() {
  const { data: plan, isLoading } = useMaitrisePlan()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [onlyChanges, setOnlyChanges] = useState(false)
  const [changeTarget, setChangeTarget] = useState<{ member: MaitrisePlanMember; unit: MaitrisePlanUnit } | null>(null)
  const [addUnit, setAddUnit] = useState<MaitrisePlanUnit | null>(null)
  const cancel = useCancelMaitrisePlan()

  const views = useMemo(() => (plan ? buildViews(plan) : []), [plan])
  if (isLoading || !plan) return (
    <Page>
      <PageHeader title="Maîtrises" icon={Crown} description="Préparez la maîtrise de l'an prochain. Rien ne change avant la publication du passage." />
      <LoadingSpinner variant="table" />
    </Page>
  )

  const pendingCount = plan.lines.filter(l => !l.applied).length
  // Alerts (Groupe unit excluded): a unit that will have chefs but no chef d'unité, or no chef at all.
  const noHead = views.filter(v => !v.unit.isGroupUnit && v.nextCount > 0 && !v.headNext)
  const empty = views.filter(v => !v.unit.isGroupUnit && v.nextCount === 0 && v.nowCount > 0)
  const shown = onlyChanges ? views.filter(v => v.changes > 0 || noHead.includes(v) || empty.includes(v)) : views
  const date = formatDateLong(plan.passageDate)
  const toggle = (id: string) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const undo = async (id: string) => {
    try { await cancel.mutateAsync(id); toast.success('Changement annulé') } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <Page>
      <PageHeader title={`Maîtrises — ${plan.scoutYear}`} icon={Crown}
        description="Préparez la maîtrise de l'an prochain. Rien ne change avant la publication du passage." />

      {/* How it works + where the year stands */}
      {plan.published ? (
        <Callout tone="success" icon={CheckCircle2}>
          Le passage {plan.scoutYear} est publié : la maîtrise prévue a été appliquée. Les changements se font maintenant au jour le jour (« maintenant »).
        </Callout>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center">
            <CalendarClock className="hidden h-8 w-8 shrink-0 text-primary sm:block" />
            <div className="flex-1 space-y-1 text-sm">
              <p className="font-medium">Les changements prévus s'appliquent avec le passage{date ? `, le ${date}` : ''}.</p>
              <p className="text-muted-foreground">Ouvrez une unité pour changer un chef d'unité ou de fonction, arrêter une fonction ou ajouter un chef.
                Un jeune qui rejoint la maîtrise quitte automatiquement son unité (sa ligne de passage est remplacée).</p>
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
              <Badge variant={pendingCount ? 'default' : 'secondary'}>{pendingCount} changement{pendingCount > 1 ? 's' : ''} prévu{pendingCount > 1 ? 's' : ''}</Badge>
              <Button asChild size="sm" variant="outline"><Link to="/admin/passage-validation">Aller au passage <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(noHead.length > 0 || empty.length > 0) && !plan.published && (
        <Callout tone="warning" icon={AlertTriangle} title="À vérifier pour l'an prochain">
          {noHead.length > 0 && <p>Sans chef d'unité : {noHead.map(v => v.unit.unitCode).join(', ')}</p>}
          {empty.length > 0 && <p>Plus aucun chef : {empty.map(v => v.unit.unitCode).join(', ')}</p>}
        </Callout>
      )}

      <div className="flex items-center justify-end gap-2 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={onlyChanges} onChange={e => setOnlyChanges(e.target.checked)} />
          Seulement les unités avec des changements ou des alertes
        </label>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_9rem] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase text-muted-foreground md:grid">
            <span>Unité</span><span>Chef d'unité l'an prochain</span><span>Chefs : cette année → l'an prochain</span><span />
          </div>
          <div className="divide-y">
            {shown.map(v => {
              const isOpen = open.has(v.unit.unitId)
              const warn = !v.unit.isGroupUnit && v.nextCount > 0 && !v.headNext
              return (
                <div key={v.unit.unitId}>
                  <button type="button" onClick={() => toggle(v.unit.unitId)} aria-expanded={isOpen}
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_9rem] md:gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
                      <UnitBadge unit={v.unit} />
                      <span className="truncate text-sm text-muted-foreground">{v.unit.isGroupUnit ? '' : v.unit.unitName}</span>
                    </span>
                    <span className="col-start-1 row-start-2 min-w-0 pl-6 text-sm md:col-start-auto md:row-start-auto md:pl-0">
                      {v.unit.isGroupUnit ? <span className="text-muted-foreground">—</span>
                        : warn ? <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400"><AlertTriangle className="h-3.5 w-3.5" />Aucun</span>
                        : v.headNext ? <span className={cn('truncate', v.headNext !== v.headNow && 'font-medium text-primary')}>{v.headNext}{v.headNext !== v.headNow && v.headNow ? ' (nouveau)' : ''}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </span>
                    <span className="col-start-1 row-start-3 pl-6 text-sm tabular-nums md:col-start-auto md:row-start-auto md:pl-0">
                      {v.nowCount} → <b>{v.nextCount}</b>
                      {v.arriving.length > 0 && <span className="ml-2 text-green-700 dark:text-green-400">+{v.arriving.length}</span>}
                      {v.leaving.length > 0 && <span className="ml-1 text-red-600 dark:text-red-400">−{v.leaving.length}</span>}
                    </span>
                    <span className="row-span-3 self-center justify-self-end md:row-span-1">
                      {v.changes > 0 && <Badge variant="outline">{v.changes} changement{v.changes > 1 ? 's' : ''}</Badge>}
                    </span>
                  </button>
                  {isOpen && (
                    <UnitDetail view={v} published={plan.published}
                      onChange={m => setChangeTarget({ member: m, unit: v.unit })}
                      onAdd={() => setAddUnit(v.unit)} onUndo={undo} undoing={cancel.isPending} />
                  )}
                </div>
              )
            })}
            {shown.length === 0 && <EmptyState icon={Crown} title="Aucune unité à afficher" description={onlyChanges ? 'Aucune unité avec des changements ou des alertes.' : undefined} />}
          </div>
        </CardContent>
      </Card>

      {changeTarget && <ChangeDialog plan={plan} target={changeTarget} onClose={() => setChangeTarget(null)} />}
      {addUnit && <AddDialog plan={plan} unit={addUnit} onClose={() => setAddUnit(null)} />}
    </Page>
  )
}

// Unit code pill tinted with its unit-type colour (the Groupe unit gets a crown badge instead).
function UnitBadge({ unit }: { unit: MaitrisePlanUnit }) {
  const c = unit.unitTypeColor
  return unit.isGroupUnit
    ? <Badge className="shrink-0 gap-1" style={c ? { backgroundColor: c } : undefined}><Crown className="h-3 w-3" />Maîtrise de Groupe</Badge>
    : <Badge variant="outline" className="shrink-0" style={c ? { borderColor: c, color: c, backgroundColor: `${c}14` } : undefined}>{unit.unitCode}</Badge>
}

// Expanded unit: who stays (with Changer), who arrives and who leaves (each with Annuler), and "Ajouter un chef".
function UnitDetail({ view, published, onChange, onAdd, onUndo, undoing }: {
  view: UnitView; published: boolean
  onChange: (m: MaitrisePlanMember) => void; onAdd: () => void; onUndo: (lineId: string) => void; undoing: boolean
}) {
  return (
    <div className="grid gap-3 border-t bg-muted/20 px-4 py-3 md:grid-cols-3">
      <Column title="Restent" count={view.staying.length} tone="neutral">
        {view.staying.map(m => (
          <PersonRow key={m.assignmentId} name={`${m.lastName} ${m.firstName}`} detail={m.functionName} head={m.isHead}
            action={<Button size="sm" variant="ghost" onClick={() => onChange(m)}><ArrowRightLeft className="mr-1 h-3.5 w-3.5" />Changer</Button>} />
        ))}
      </Column>
      <Column title="Arrivent" count={view.arriving.length} tone="green">
        {view.arriving.map(({ line, origin }) => (
          <PersonRow key={line.id} name={`${line.lastName} ${line.firstName}`} detail={`${line.functionName} · ${origin}`} head={line.isHead}
            action={!published && <UndoButton onClick={() => onUndo(line.id)} disabled={undoing} />} />
        ))}
        <Button size="sm" variant="outline" className="mt-1 w-full" onClick={onAdd}><UserPlus className="mr-1 h-3.5 w-3.5" />Ajouter un chef</Button>
      </Column>
      <Column title="Partent" count={view.leaving.length} tone="red">
        {view.leaving.map(({ member, line, where }) => (
          <PersonRow key={line.id} name={`${member.lastName} ${member.firstName}`}
            detail={`${member.functionName} · ${where}`} head={member.isHead}
            action={!published && <UndoButton onClick={() => onUndo(line.id)} disabled={undoing} />} />
        ))}
      </Column>
    </div>
  )
}

// One of the three columns (Restent / Arrivent / Partent); an empty Arrivent shows only its "Ajouter" button.
function Column({ title, count, tone, children }: { title: string; count: number; tone: 'neutral' | 'green' | 'red'; children: React.ReactNode }) {
  const color = { neutral: 'text-muted-foreground', green: 'text-green-700 dark:text-green-400', red: 'text-red-600 dark:text-red-400' }[tone]
  return (
    <div className="space-y-1.5">
      <p className={cn('text-xs font-semibold uppercase', color)}>{title} ({count})</p>
      {count === 0 && tone !== 'green' && <p className="text-xs text-muted-foreground">—</p>}
      {children}
    </div>
  )
}

// A person line (crown = head of the unit) with an optional action on the right.
function PersonRow({ name, detail, head, action }: { name: string; detail: string; head: boolean; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 truncate text-sm font-medium">{head && <Crown className="h-3 w-3 shrink-0 text-amber-500" />}{name}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      {action}
    </div>
  )
}

function UndoButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Tip content="Annuler ce changement">
      <Button size="sm" variant="ghost" onClick={onClick} disabled={disabled} aria-label="Annuler ce changement"><Undo2 className="h-3.5 w-3.5" /></Button>
    </Tip>
  )
}

// Optional note kept on a planned change (not used for "maintenant" changes).
function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Textarea className="min-h-16" value={value}
    onChange={e => onChange(e.target.value)} placeholder="Note (facultatif)" maxLength={1000} />
}

// "Au passage" (planned) vs "Maintenant" (effective today). After publication only "maintenant" is possible.
function WhenChoice({ value, onChange, published, date }: { value: 'plan' | 'now'; onChange: (v: 'plan' | 'now') => void; published: boolean; date: string | null }) {
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <p className="font-medium">Quand ?</p>
      {!published && (
        <label className="flex cursor-pointer items-start gap-2">
          <input type="radio" className="mt-1" checked={value === 'plan'} onChange={() => onChange('plan')} />
          <span><b>Au passage</b>{date ? ` (${date})` : ''} — appliqué quand le passage est publié</span>
        </label>
      )}
      <label className="flex cursor-pointer items-start gap-2">
        <input type="radio" className="mt-1" checked={value === 'now'} onChange={() => onChange('now')} />
        <span><b>Maintenant</b> — prend effet aujourd'hui (correction en cours d'année)</span>
      </label>
    </div>
  )
}

// Maîtrise functions of a unit's type (non-archived).
function useLeaderRoles(unitTypeId?: string) {
  const { data } = useFunctionalRoles(unitTypeId)
  return unitTypeId ? (data ?? []).filter(r => r.isMaitrise && !r.isArchived).sort((a, b) => b.rank - a.rank) : []
}

function RolePicker({ unitTypeId, value, onChange }: { unitTypeId?: string; value: string; onChange: (v: string) => void }) {
  const roles = useLeaderRoles(unitTypeId)
  return (
    <>
    <Select value={value} onValueChange={onChange} disabled={!unitTypeId}>
      <SelectTrigger><SelectValue placeholder="Choisir une fonction…" /></SelectTrigger>
      <SelectContent>
        {roles.length ? roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)
          : <div className="px-2 py-1.5 text-sm text-muted-foreground">Aucune fonction de maîtrise pour ce type d'unité.</div>}
      </SelectContent>
    </Select>
    <p className="text-xs text-muted-foreground">Nommer un chef d'unité remplace le chef d'unité actuel (il arrête).</p>
    </>
  )
}

// A current leader's function: change unit/function (optionally keeping it too) or stop it — planned or now.
function ChangeDialog({ plan, target, onClose }: { plan: MaitrisePlan; target: { member: MaitrisePlanMember; unit: MaitrisePlanUnit }; onClose: () => void }) {
  const { member, unit } = target
  const [mode, setMode] = useState<'change' | 'stop'>('change')
  const [when, setWhen] = useState<'plan' | 'now'>(plan.published ? 'now' : 'plan')
  const [unitId, setUnitId] = useState(unit.unitId)
  const [roleId, setRoleId] = useState('')
  const [keepOld, setKeepOld] = useState(false)
  const [notes, setNotes] = useState('')
  const planChange = usePlanMaitriseChange(), planEnd = usePlanMaitriseEnd()
  const transfer = useTransferMaitrise(), remove = useRemoveFromMaitrise()
  const busy = planChange.isPending || planEnd.isPending || transfer.isPending || remove.isPending
  const dest = plan.units.find(u => u.unitId === unitId)
  const date = formatDateLong(plan.passageDate)

  const submit = async () => {
    try {
      if (mode === 'stop') {
        if (when === 'plan') await planEnd.mutateAsync({ assignmentId: member.assignmentId, notes: notes || undefined })
        else await remove.mutateAsync(member.assignmentId)
      } else {
        if (!roleId) return
        if (when === 'plan') await planChange.mutateAsync({ assignmentId: member.assignmentId, newUnitId: unitId, newFunctionalRoleId: roleId, keepOld, notes: notes || undefined })
        else await transfer.mutateAsync({ assignmentId: member.assignmentId, newUnitId: unitId, newFunctionalRoleId: roleId, keepOld })
      }
      toast.success(when === 'plan' ? 'Changement prévu pour le passage' : 'Changement appliqué')
      onClose()
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{member.firstName} {member.lastName}</DialogTitle>
          <DialogDescription>{member.functionName} · {unit.isGroupUnit ? 'Maîtrise de Groupe' : unit.unitCode}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button variant={mode === 'change' ? 'default' : 'outline'} onClick={() => setMode('change')}><ArrowRightLeft className="mr-1 h-4 w-4" />Changer</Button>
            <Button variant={mode === 'stop' ? 'destructive' : 'outline'} onClick={() => setMode('stop')}><UserMinus className="mr-1 h-4 w-4" />Arrête</Button>
          </div>
          {mode === 'change' && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Unité</label>
                <Select value={unitId} onValueChange={v => { setUnitId(v); setRoleId('') }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {plan.units.map(u => <SelectItem key={u.unitId} value={u.unitId}>{u.isGroupUnit ? 'Maîtrise de Groupe' : `${u.unitCode} — ${u.unitName}`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Fonction</label>
                <RolePicker unitTypeId={dest?.unitTypeId} value={roleId} onChange={setRoleId} />
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={keepOld} onChange={e => setKeepOld(e.target.checked)} />
                <span>Garder aussi « {member.functionName} » (cumul des deux fonctions)</span>
              </label>
            </>
          )}
          <WhenChoice value={when} onChange={setWhen} published={plan.published} date={date} />
          {when === 'plan' && <NoteField value={notes} onChange={setNotes} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Retour</Button>
          <Button onClick={submit} disabled={busy || (mode === 'change' && !roleId)} variant={mode === 'stop' ? 'destructive' : 'default'}>
            {when === 'plan' ? 'Prévoir' : 'Appliquer maintenant'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Add a chef to a unit: any member (a youth joining the maîtrise leaves their unit), planned or now.
function AddDialog({ plan, unit, onClose }: { plan: MaitrisePlan; unit: MaitrisePlanUnit; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search)
  // Candidates come from GET /maitrises/candidates (server excludes youth of the younger branches).
  const { data: results } = useMaitriseCandidates(debounced)
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null)
  const [roleId, setRoleId] = useState('')
  const [when, setWhen] = useState<'plan' | 'now'>(plan.published ? 'now' : 'plan')
  const [notes, setNotes] = useState('')
  const planStart = usePlanMaitriseStart(), addNow = useAddMaitriseNow()
  const busy = planStart.isPending || addNow.isPending

  const submit = async () => {
    if (!picked || !roleId) return
    try {
      if (when === 'plan') await planStart.mutateAsync({ memberId: picked.id, unitId: unit.unitId, functionalRoleId: roleId, notes: notes || undefined })
      else await addNow.mutateAsync({ memberId: picked.id, unitId: unit.unitId, functionalRoleId: roleId })
      toast.success(when === 'plan' ? 'Arrivée prévue pour le passage' : 'Chef ajouté')
      onClose()
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un chef — {unit.isGroupUnit ? 'Maîtrise de Groupe' : unit.unitCode}</DialogTitle>
          <DialogDescription>Si c'est un jeune, il quittera son unité (sa ligne de passage est remplacée).</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Membre</label>
            {picked ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="font-medium">{picked.name}</span>
                <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>Changer</Button>
              </div>
            ) : (
              <>
                <SearchInput autoFocus value={search} onChange={setSearch} placeholder="Rechercher un membre…" />
                {debounced && results && (
                  <div className="max-h-56 overflow-y-auto rounded-md border text-sm">
                    {results.length === 0
                      ? <EmptyState icon={UserPlus} title="Aucun membre trouvé" />
                      : results.map(m => (
                        <button key={m.memberId} type="button" className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                          onClick={() => setPicked({ id: m.memberId, name: `${m.firstName} ${m.lastName}` })}>
                          <span className="font-medium">{m.lastName} {m.firstName}</span>
                          <span className="truncate text-xs text-muted-foreground">{m.posts}</span>
                        </button>
                      ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Les jeunes des Meutes, Rondes, Troupes et Compagnies ne sont pas proposés.</p>
              </>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Fonction</label>
            <RolePicker unitTypeId={unit.unitTypeId} value={roleId} onChange={setRoleId} />
          </div>
          <WhenChoice value={when} onChange={setWhen} published={plan.published} date={formatDateLong(plan.passageDate)} />
          {when === 'plan' && <NoteField value={notes} onChange={setNotes} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Retour</Button>
          <Button onClick={submit} disabled={busy || !picked || !roleId}>{when === 'plan' ? 'Prévoir' : 'Ajouter maintenant'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
