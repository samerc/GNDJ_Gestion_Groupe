import { useMemo, useState } from 'react'
import { DndContext, DragOverlay, useDraggable, useDroppable, pointerWithin, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { useUnits } from '@/services/unit-service'
import { PERMISSIONS } from '@/lib/constants'
import { parseApiError } from '@/lib/error-utils'
import { cn } from '@/lib/utils'
import {
  useUnitOrganization, useSetPlacement,
  type OrgMember, type OrgRole,
} from '@/services/organization-service'
import { MemberPhoto } from '@/components/shared/member-photo'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { GripVertical, ArrowRightLeft, Users, Crown } from 'lucide-react'

// A board column = a team of the unit, plus a virtual "Sans équipe" column (teamId null).
interface Column { id: string | null; name: string; isMaitrise: boolean }

// "Organiser mon unité" — the CU roster board (Mode A: live roster tidy). Drag a member between équipes or
// change their fonction; every change edits the member's EXISTING active assignment in place (a correction,
// not history — the passage is what rolls members forward). Later this same board gains a "passage" mode with
// destination-branch columns when the CG opens passage. Access = leader of the unit (CU) or a group manager.
export default function OrganizeUnitPage() {
  const user = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  // A group manager (CG/ACG/super-admin) can organize ANY unit; a CU only their own led units.
  const isGroupManager = hasPermission(PERMISSIONS.MAITRISE_MANAGE)

  // Unit picker source: a CU's real led units (exclude the group-level Maîtrise assignment); a group manager
  // gets the full active-units list (their unitAccess only lists their own group assignment, not every unit).
  const leaderUnits = (user?.unitAccess ?? []).filter((u) => u.isLeader && !u.isGroupLevel)
  const { data: allUnits } = useUnits({ isActive: true, pageSize: 200 })
  const unitOptions = useMemo(
    () =>
      isGroupManager
        ? (allUnits?.items ?? []).map((u) => ({ unitId: u.id, unitName: u.name }))
        : leaderUnits.map((u) => ({ unitId: u.unitId, unitName: u.unitName })),
    [isGroupManager, allUnits, leaderUnits],
  )

  const [selectedUnit, setSelectedUnit] = useState('')
  const unitId = selectedUnit || unitOptions[0]?.unitId || ''

  const { data: org, isLoading } = useUnitOrganization(unitId)
  const setPlacement = useSetPlacement(unitId)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [dragName, setDragName] = useState<string | null>(null)
  const [moveMember, setMoveMember] = useState<OrgMember | null>(null)

  // Columns: teams (Maîtrise first, already ordered by the server) + a trailing "Sans équipe".
  const columns: Column[] = useMemo(() => {
    if (!org) return []
    return [
      ...org.teams.map((t) => ({ id: t.id as string | null, name: t.name, isMaitrise: t.isMaitrise })),
      { id: null, name: 'Sans équipe', isMaitrise: false },
    ]
  }, [org])

  const membersOf = (teamId: string | null) => (org?.members ?? []).filter((m) => m.teamId === teamId)

  // The one operation: set a member's (team, fonction) in place. teamId undefined = keep current team.
  const place = async (m: OrgMember, teamId: string | null, roleId?: string) => {
    try {
      await setPlacement.mutateAsync({ assignmentId: m.assignmentId, teamId, functionalRoleId: roleId ?? m.functionalRoleId })
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDragName(null)
    const a = e.active.data.current as { member: OrgMember } | undefined
    const o = e.over?.data.current as { teamId: string | null } | undefined
    if (!a || !e.over) return
    const target = o?.teamId ?? null
    if (a.member.teamId === target) return // dropped back in the same column
    place(a.member, target)
  }

  if (!user) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Organiser mon unité</h1>
          <p className="text-sm text-muted-foreground">
            Glissez un membre d'une équipe à l'autre, ou changez sa fonction. Les modifications sont enregistrées immédiatement.
          </p>
        </div>
        {unitOptions.length > 1 && (
          <Select value={unitId} onValueChange={setSelectedUnit}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Choisir une unité" /></SelectTrigger>
            <SelectContent>
              {unitOptions.map((u) => <SelectItem key={u.unitId} value={u.unitId}>{u.unitName}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {!unitId ? (
        <EmptyState icon={Users} title="Aucune unité" description="Vous ne dirigez aucune unité à organiser." />
      ) : isLoading || !org ? (
        <LoadingSpinner variant="cards" />
      ) : (
        <>
          {/* Hint for the mobile path (drag is finicky on phones — tap the ⇄ button on a card to move it). */}
          <p className="text-xs text-muted-foreground sm:hidden">
            Sur mobile, touchez le bouton <ArrowRightLeft className="inline h-3 w-3" /> d'un membre pour le déplacer.
          </p>

          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={(e) => setDragName((e.active.data.current as { member: OrgMember })?.member.lastName + ' ' + (e.active.data.current as { member: OrgMember })?.member.firstName)}
            onDragEnd={onDragEnd}
          >
            <div className="flex gap-3 overflow-x-auto pb-2">
              {columns.map((col) => (
                <BoardColumn
                  key={col.id ?? 'none'}
                  col={col}
                  members={membersOf(col.id)}
                  roles={org.roles}
                  onRole={(m, roleId) => place(m, m.teamId, roleId)}
                  onMove={setMoveMember}
                />
              ))}
            </div>
            <DragOverlay>
              {dragName ? <div className="rounded-md border bg-background px-2.5 py-1.5 text-sm font-medium shadow-lg">{dragName}</div> : null}
            </DragOverlay>
          </DndContext>
        </>
      )}

      {/* Mobile / fallback move dialog — pick team + fonction, then apply. Keyed so it re-seeds per member. */}
      <MoveDialog
        key={moveMember?.assignmentId ?? 'none'}
        member={moveMember}
        columns={columns}
        roles={org?.roles ?? []}
        onClose={() => setMoveMember(null)}
        onApply={async (teamId, roleId) => {
          if (moveMember) await place(moveMember, teamId, roleId)
          setMoveMember(null)
        }}
        busy={setPlacement.isPending}
      />
    </div>
  )
}

// ─── One column (a team, or "Sans équipe") ───
function BoardColumn({ col, members, roles, onRole, onMove }: {
  col: Column
  members: OrgMember[]
  roles: OrgRole[]
  onRole: (m: OrgMember, roleId: string) => void
  onMove: (m: OrgMember) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${col.id ?? 'none'}`, data: { teamId: col.id } })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-64 shrink-0 flex-col rounded-lg border bg-card',
        col.isMaitrise && 'border-primary/40 bg-primary/5',
        isOver && 'ring-2 ring-primary/50',
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
          {col.isMaitrise && <Crown className="h-3.5 w-3.5 text-primary" />}
          <span className="truncate">{col.name}</span>
        </span>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">{members.length}</span>
      </div>
      <div className="flex min-h-24 flex-1 flex-col gap-1.5 p-2">
        {members.length === 0 ? (
          <p className="px-1 py-3 text-center text-xs text-muted-foreground">Déposez un membre ici</p>
        ) : (
          members.map((m) => <MemberCard key={m.assignmentId} m={m} roles={roles} onRole={onRole} onMove={onMove} />)
        )}
      </div>
    </div>
  )
}

// ─── One member card (draggable via the grip handle; fonction inline; ⇄ opens the move dialog) ───
function MemberCard({ m, roles, onRole, onMove }: {
  m: OrgMember
  roles: OrgRole[]
  onRole: (m: OrgMember, roleId: string) => void
  onMove: (m: OrgMember) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `m-${m.assignmentId}`, data: { member: m } })
  // Show the member's current role even if it's archived / not in the active list.
  const roleOptions = roles.some((r) => r.id === m.functionalRoleId)
    ? roles
    : [{ id: m.functionalRoleId, name: `${m.functionalRoleName} (archivée)`, rank: m.roleRank, isMaitrise: false, isDefault: false }, ...roles]

  return (
    <div ref={setNodeRef} className={cn('rounded-md border bg-background p-1.5', isDragging && 'opacity-40')}>
      <div className="flex items-center gap-1.5">
        <button type="button" className="cursor-grab touch-none text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing" {...listeners} {...attributes} title="Glisser">
          <GripVertical className="h-4 w-4" />
        </button>
        <MemberPhoto memberId={m.memberId} name={`${m.firstName} ${m.lastName}`} photoPath={m.photoPath} size={30} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.firstName} {m.lastName}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onMove(m)} title="Déplacer">
          <ArrowRightLeft className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="mt-1.5 pl-6">
        <Select value={m.functionalRoleId} onValueChange={(rid) => onRole(m, rid)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {roleOptions.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

// ─── Mobile / fallback "Déplacer" dialog — pick team + fonction, apply once ───
function MoveDialog({ member, columns, roles, onClose, onApply, busy }: {
  member: OrgMember | null
  columns: Column[]
  roles: OrgRole[]
  onClose: () => void
  onApply: (teamId: string | null, roleId: string) => void
  busy: boolean
}) {
  // Local selections, seeded from the member each time the dialog opens (keyed remount via `key`).
  const [teamId, setTeamId] = useState<string | null>(member?.teamId ?? null)
  const [roleId, setRoleId] = useState<string>(member?.functionalRoleId ?? '')
  if (!member) return null

  const roleOptions = roles.some((r) => r.id === member.functionalRoleId)
    ? roles
    : [{ id: member.functionalRoleId, name: `${member.functionalRoleName} (archivée)`, rank: 0, isMaitrise: false, isDefault: false }, ...roles]

  return (
    <Dialog open={!!member} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Déplacer {member.firstName} {member.lastName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Équipe</label>
            <Select value={teamId ?? 'none'} onValueChange={(v) => setTeamId(v === 'none' ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {columns.map((c) => <SelectItem key={c.id ?? 'none'} value={c.id ?? 'none'}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Fonction</label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {roleOptions.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => onApply(teamId, roleId)} disabled={busy}>Appliquer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
