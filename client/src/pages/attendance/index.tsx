import { useState, useMemo } from 'react'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { calendarScoutYear, recentScoutYears } from '@/hooks/use-scout-year'
import { useTeams } from '@/services/team-service'
import {
  useAttendanceScope, useMeetings, useMeetingAttendance,
  useCreateMeeting, useUpdateMeeting, useApproveMeeting, useDeleteMeeting, useSaveMeetingAttendance,
  MEETING_TYPES, MEETING_TYPE_LABELS,
  type MeetingDto, type AttendanceRosterRow,
} from '@/services/meeting-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { CalendarCheck, Plus, Pencil, Trash2, CheckCircle2, Clock, ClipboardList } from 'lucide-react'

// Réunions / Absences — the CU (and chef d'équipe) attendance screen. Pick a unit → list its réunions
// (réunions / sorties / camps), create new ones (unit-wide or for a team), approve pending chef-d'équipe
// réunions, and open a réunion to fill the absentee list (present by default). A chef d'équipe only sees /
// creates réunions for their own team (server-enforced); their new réunions are pending until the CU approves.

function frDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// One réunion card in the list.
function MeetingCard({ meeting, onOpen, onEdit, onApprove, onDelete, busy }: {
  meeting: MeetingDto
  onOpen: () => void
  onEdit: () => void
  onApprove: () => void
  onDelete: () => void
  busy: boolean
}) {
  const present = Math.max(0, meeting.rosterCount - meeting.absentCount)
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-xs">{MEETING_TYPE_LABELS[meeting.type] ?? meeting.type}</Badge>
            <span className="font-medium">{meeting.title || MEETING_TYPE_LABELS[meeting.type] || 'Réunion'}</span>
            {meeting.status === 'Pending' && (
              <Badge className="gap-1 border-amber-200 bg-amber-50 text-amber-700"><Clock className="h-3 w-3" />En attente</Badge>
            )}
            {meeting.teamName ? (
              <Badge variant="outline" className="text-xs">{meeting.teamName}</Badge>
            ) : (
              <Badge variant="outline" className="text-xs">Toute l'unité</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {frDate(meeting.date)}{meeting.endDate && meeting.endDate !== meeting.date ? ` → ${frDate(meeting.endDate)}` : ''}
            {' · '}
            <span className="text-emerald-600">{present} présent{present > 1 ? 's' : ''}</span>
            {' · '}
            <span className={meeting.absentCount > 0 ? 'text-destructive' : ''}>{meeting.absentCount} absent{meeting.absentCount > 1 ? 's' : ''}</span>
            {` / ${meeting.rosterCount}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {meeting.status === 'Pending' && meeting.canManage && (
            <Button size="sm" variant="outline" onClick={onApprove} disabled={busy}>
              <CheckCircle2 className="mr-1 h-4 w-4" />Approuver
            </Button>
          )}
          <Button size="sm" onClick={onOpen}><ClipboardList className="mr-1 h-4 w-4" />Présences</Button>
          {meeting.canManage && (
            <Button size="sm" variant="ghost" onClick={onEdit} disabled={busy} title="Modifier la réunion">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {meeting.canManage && (
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete} disabled={busy} title="Supprimer la réunion">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// The attendance dialog: the réunion's roster with a "Présent / Absent" toggle + reason per member.
function AttendanceDialog({ meetingId, onClose }: { meetingId: string; onClose: () => void }) {
  const { data, isLoading } = useMeetingAttendance(meetingId)
  const save = useSaveMeetingAttendance()
  // Local edit state: memberId → { absent, reason }. Seeded from the loaded roster.
  const [rows, setRows] = useState<Record<string, { absent: boolean; reason: string }> | null>(null)

  // Seed local state once the roster loads (render-phase init, no effect).
  const seeded = useMemo(() => {
    if (!data) return null
    const m: Record<string, { absent: boolean; reason: string }> = {}
    for (const r of data.roster) m[r.memberId] = { absent: r.absent, reason: r.reason ?? '' }
    return m
  }, [data])
  const state = rows ?? seeded ?? {}

  const setRow = (id: string, patch: Partial<{ absent: boolean; reason: string }>) =>
    setRows(prev => ({ ...(prev ?? seeded ?? {}), [id]: { ...(prev ?? seeded ?? {})[id], ...patch } }))

  const absentCount = Object.values(state).filter(v => v.absent).length

  const handleSave = async () => {
    const absences = Object.entries(state)
      .filter(([, v]) => v.absent)
      .map(([memberId, v]) => ({ memberId, reason: v.reason.trim() || null }))
    try {
      await save.mutateAsync({ meetingId, absences })
      toast.success('Présences enregistrées')
      onClose()
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Présences — {data ? (MEETING_TYPE_LABELS[data.type] ?? data.type) : ''}{data?.title ? ` · ${data.title}` : ''}
          </DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="py-10"><LoadingSpinner /></div>
        ) : data.roster.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Aucun membre dans cette réunion.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {frDate(data.date)} · {data.teamName ?? "Toute l'unité"} · <span className="font-medium">{absentCount}</span> absent{absentCount > 1 ? 's' : ''} sur {data.roster.length}. Cochez uniquement les membres absents.
            </p>
            <div className="max-h-[55vh] divide-y overflow-y-auto rounded-md border">
              {data.roster.map((r: AttendanceRosterRow) => {
                const s = state[r.memberId] ?? { absent: false, reason: '' }
                return (
                  <div key={r.memberId} className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center">
                    <label className="flex flex-1 items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" className="h-4 w-4 shrink-0 accent-destructive" checked={s.absent}
                        onChange={e => setRow(r.memberId, { absent: e.target.checked })} />
                      <span className={s.absent ? 'font-medium text-destructive' : ''}>{r.name}</span>
                      {r.teamName && <span className="text-xs text-muted-foreground">{r.teamName}</span>}
                    </label>
                    {s.absent && (
                      <Input value={s.reason} onChange={e => setRow(r.memberId, { reason: e.target.value })}
                        placeholder="Motif (optionnel)" className="h-8 text-sm sm:w-64" maxLength={300} />
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fermer</Button>
          {data && data.roster.length > 0 && (
            <Button onClick={handleSave} disabled={save.isPending}>{save.isPending ? 'Enregistrement…' : 'Enregistrer les présences'}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// The réunion create/edit dialog. A CU can target the whole unit or any team; a chef d'équipe is restricted
// to the team(s) they lead in this unit (no "whole unit" option). Pass `meeting` to edit an existing réunion
// (editing is manager-only — the caller only shows the edit button when canManage).
function MeetingFormDialog({ unitId, memberGroupId, canManage, ledTeamIds, meeting, defaultDate, onClose }: {
  unitId?: string
  memberGroupId?: string // set for a member-group réunion (Grande Maîtrise, Chefs d'unité, …) — no team scope
  canManage: boolean
  ledTeamIds: string[]
  meeting?: MeetingDto
  defaultDate?: string // pre-fills the date for a NEW réunion (within the selected scout year)
  onClose: () => void
}) {
  const create = useCreateMeeting()
  const update = useUpdateMeeting()
  const editing = !!meeting
  const isGroup = !!memberGroupId // a member group defines its own membership → no team scope selector
  // CU picks from all the unit's teams; a chef d'équipe only from their led teams (fetched, then filtered).
  const { data: teamsData } = useTeams({ unitId: unitId || undefined, pageSize: 100, enabled: !isGroup && !!unitId })
  const teams = useMemo(() => {
    const all = teamsData?.items ?? []
    return canManage ? all : all.filter(t => ledTeamIds.includes(t.id))
  }, [teamsData, canManage, ledTeamIds])

  const [type, setType] = useState<string>(meeting?.type ?? 'Reunion')
  // '__unit__' = whole unit, else teamId. Edit prefills from the réunion; create defaults to whole unit for a CU.
  const [scope, setScope] = useState<string>(meeting ? (meeting.teamId ?? '__unit__') : (canManage ? '__unit__' : ''))
  const [title, setTitle] = useState(meeting?.title ?? '')
  const [date, setDate] = useState(meeting?.date ?? defaultDate ?? '')
  const [endDate, setEndDate] = useState(meeting?.endDate ?? '')
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!date) { setError('La date est requise.'); return }
    if (!isGroup && !scope) { setError('Choisissez une équipe.'); return }
    const payload = {
      teamId: isGroup ? null : (scope === '__unit__' ? null : scope),
      type,
      title: title.trim() || null,
      date,
      endDate: type === 'Camp' && endDate ? endDate : null,
      notes: null,
    }
    try {
      if (editing) {
        await update.mutateAsync({ id: meeting!.id, ...payload })
        toast.success('Réunion modifiée')
      } else {
        await create.mutateAsync(isGroup ? { memberGroupId, ...payload } : { unitId, ...payload })
        toast.success(canManage ? 'Réunion créée' : 'Réunion créée — en attente d\'approbation du chef d\'unité')
      }
      onClose()
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const saving = create.isPending || update.isPending

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? 'Modifier la réunion' : 'Nouvelle réunion'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <RequiredLabel required>Type</RequiredLabel>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MEETING_TYPES.map(t => <SelectItem key={t} value={t}>{MEETING_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!isGroup && (
            <div className="space-y-2">
              <RequiredLabel required>Concernés</RequiredLabel>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent>
                  {canManage && <SelectItem value="__unit__">Toute l'unité</SelectItem>}
                  {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {!canManage && teams.length === 0 && <p className="text-xs text-muted-foreground">Aucune équipe dirigée dans cette unité.</p>}
            </div>
          )}
          <div className="space-y-2">
            <RequiredLabel>Titre (optionnel)</RequiredLabel>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex : Réunion de rentrée" maxLength={150} />
          </div>
          <div className={type === 'Camp' ? 'grid grid-cols-2 gap-4' : ''}>
            <div className="space-y-2">
              <RequiredLabel required>{type === 'Camp' ? 'Date de début' : 'Date'}</RequiredLabel>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            {type === 'Camp' && (
              <div className="space-y-2">
                <RequiredLabel>Date de fin</RequiredLabel>
                <Input type="date" value={endDate} min={date || undefined} onChange={e => setEndDate(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : (editing ? 'Enregistrer' : 'Créer')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function AttendancePage() {
  // Year context: default to the year that CONTAINS TODAY (the running year), not the configured passage year.
  // A picker lets a leader switch to the next (pre-season) year so both run in parallel through the changeover.
  const yearOptions = useMemo(() => recentScoutYears(4), [])
  const [year, setYear] = useState<string>(() => calendarScoutYear())
  const { data: scope, isLoading: scopeLoading } = useAttendanceScope()
  const approve = useApproveMeeting()
  const del = useDeleteMeeting()

  // Units the caller can work in: the ones they manage (CU/CG) + the units of the teams they lead.
  const unitOptions = useMemo(() => {
    if (!scope) return []
    const map = new Map<string, string>()
    for (const u of scope.units) map.set(u.unitId, u.unitName)
    for (const t of scope.teams) if (!map.has(t.unitId)) map.set(t.unitId, t.unitName)
    return [...map.entries()].map(([unitId, unitName]) => ({ unitId, unitName }))
  }, [scope])

  // Combined scope selection: a unit ("u:<id>") or a member group ("g:<id>", e.g. Grande Maîtrise, Chefs d'unité).
  const groups = scope?.groups ?? []
  const [sel, setSel] = useState<string>('')
  const firstKey = unitOptions.length > 0 ? `u:${unitOptions[0].unitId}` : (groups.length > 0 ? `g:${groups[0].id}` : '')
  // Default to the first available scope once loaded (render-phase reset — no effect).
  if (!sel && firstKey) setSel(firstKey)
  const unitId = sel.startsWith('u:') ? sel.slice(2) : ''
  const groupId = sel.startsWith('g:') ? sel.slice(2) : ''

  // Manager of the selected unit (CU/CG) vs. only a chef d'équipe there? A member group is always caller-managed
  // (the scope query only returns groups they can manage).
  const canManageUnit = !!groupId || !!scope?.units.some(u => u.unitId === unitId)
  const ledTeamIds = useMemo(() => (scope?.teams ?? []).filter(t => t.unitId === unitId).map(t => t.teamId), [scope, unitId])

  const { data: meetings, isLoading: meetingsLoading } = useMeetings(unitId || undefined, year, groupId || undefined)

  // Default date for a NEW réunion: today if it's within the selected year, else that year's Oct-1 start — so a
  // réunion created while a year is selected lands in that year's window.
  const defaultDate = useMemo(() => {
    const startYear = Number(year.split('-')[0])
    const start = new Date(startYear, 9, 1) // Oct 1
    const end = new Date(startYear + 1, 9, 1)
    const today = new Date()
    const pick = today >= start && today < end ? today : start
    return `${pick.getFullYear()}-${String(pick.getMonth() + 1).padStart(2, '0')}-${String(pick.getDate()).padStart(2, '0')}`
  }, [year])

  const [createOpen, setCreateOpen] = useState(false)
  const [editMeeting, setEditMeeting] = useState<MeetingDto | null>(null)
  const [attendanceId, setAttendanceId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const handleApprove = async (id: string) => {
    try { await approve.mutateAsync(id); toast.success('Réunion approuvée') }
    catch (err) { toast.error(parseApiError(err)) }
  }
  const handleDelete = async () => {
    if (!deleteId) return
    try { await del.mutateAsync(deleteId); toast.success('Réunion supprimée'); setDeleteId(null) }
    catch (err) { toast.error(parseApiError(err)); setDeleteId(null) }
  }

  if (scopeLoading) return <LoadingSpinner variant="page" />

  if (unitOptions.length === 0 && groups.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Réunions &amp; absences</h1>
        <EmptyState icon={CalendarCheck} title="Aucune unité"
          description="Vous ne gérez aucune unité et ne dirigez aucune équipe. Les réunions sont créées par le chef d'unité." />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Réunions &amp; absences</h1>
          <p className="text-sm text-muted-foreground">Réunions, sorties et camps — suivez les présences.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={!sel}><Plus className="mr-1 h-4 w-4" />Nouvelle réunion</Button>
      </div>

      {/* Scope (unit or member group) + scout-year pickers. The year lets a leader view/log two years in parallel. */}
      <div className="flex flex-wrap items-center gap-2">
        {(unitOptions.length + groups.length) > 1 && (
          <Select value={sel} onValueChange={setSel}>
            <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
            <SelectContent>
              {unitOptions.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Unités</SelectLabel>
                  {unitOptions.map(u => <SelectItem key={u.unitId} value={`u:${u.unitId}`}>{u.unitName}</SelectItem>)}
                </SelectGroup>
              )}
              {groups.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Groupes</SelectLabel>
                  {groups.map(g => <SelectItem key={g.id} value={`g:${g.id}`}>{g.name}</SelectItem>)}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        )}
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {yearOptions.map(y => <SelectItem key={y} value={y}>Année {y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {meetingsLoading ? (
        <LoadingSpinner variant="table" />
      ) : !meetings || meetings.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="Aucune réunion"
          description="Créez une réunion, une sortie ou un camp pour commencer à suivre les présences." />
      ) : (
        <div className="space-y-3">
          {meetings.map(m => (
            <MeetingCard key={m.id} meeting={m}
              onOpen={() => setAttendanceId(m.id)}
              onEdit={() => setEditMeeting(m)}
              onApprove={() => handleApprove(m.id)}
              onDelete={() => setDeleteId(m.id)}
              busy={approve.isPending || del.isPending} />
          ))}
        </div>
      )}

      {createOpen && sel && (
        <MeetingFormDialog unitId={unitId || undefined} memberGroupId={groupId || undefined} canManage={canManageUnit} ledTeamIds={ledTeamIds} defaultDate={defaultDate} onClose={() => setCreateOpen(false)} />
      )}
      {editMeeting && (
        <MeetingFormDialog unitId={editMeeting.unitId} memberGroupId={editMeeting.memberGroupId ?? undefined} canManage={canManageUnit} ledTeamIds={ledTeamIds} meeting={editMeeting} onClose={() => setEditMeeting(null)} />
      )}
      {attendanceId && <AttendanceDialog meetingId={attendanceId} onClose={() => setAttendanceId(null)} />}
      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}
        title="Supprimer la réunion" description="Cette réunion et ses présences seront supprimées. Continuer ?"
        confirmLabel="Supprimer" variant="destructive" loading={del.isPending} onConfirm={handleDelete} />
    </div>
  )
}
