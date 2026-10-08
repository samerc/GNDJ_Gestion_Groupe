// « À traiter » on the chef d'unité's « Mon unité »: one compact row of shortcuts to what needs their action in this
// unit right now (members without équipe, documents to check, change requests, réunions to approve, passage choices
// missing, members absent several réunions in a row). Only non-zero items show; when there is nothing, a single green line says so. Counts come from
// GET /dashboard/unit/{id}/todo. « Sans équipe » filters the roster below instead of leaving the page.
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { CheckCircle2, UsersRound, FileCheck, ClipboardCheck, CalendarCheck, ArrowRightLeft, CalendarX } from 'lucide-react'
import { useUnitTodo } from '@/services/dashboard-service'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

// Amber shortcut pill (same look as the absences dropdown trigger below).
function Chip({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/70">
      {icon}{children}
    </button>
  )
}

// « 1 membre … » / « 3 membres … ».
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

// onShowWithoutTeam filters the roster on the same page; onOpenMember opens a member's file there.
export function UnitTodoStrip({ unitId, onShowWithoutTeam, onOpenMember }: {
  unitId: string; onShowWithoutTeam: () => void; onOpenMember: (memberId: string) => void
}) {
  const navigate = useNavigate()
  const { data } = useUnitTodo(unitId)
  if (!data) return null

  const items: ReactNode[] = []
  if (data.withoutTeam > 0)
    items.push(<Chip key="team" icon={<UsersRound className="h-4 w-4" />} onClick={onShowWithoutTeam}>
      {plural(data.withoutTeam, 'membre sans équipe', 'membres sans équipe')}</Chip>)
  if (data.documentsToVerify > 0)
    items.push(<Chip key="docs" icon={<FileCheck className="h-4 w-4" />} onClick={() => navigate('/unit-documents')}>
      {plural(data.documentsToVerify, 'document à vérifier', 'documents à vérifier')}</Chip>)
  if (data.changeRequests > 0)
    items.push(<Chip key="req" icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => navigate('/change-requests')}>
      {plural(data.changeRequests, 'modification à valider', 'modifications à valider')}</Chip>)
  if (data.meetingsToApprove > 0)
    items.push(<Chip key="meet" icon={<CalendarCheck className="h-4 w-4" />} onClick={() => navigate('/attendance')}>
      {plural(data.meetingsToApprove, 'réunion à approuver', 'réunions à approuver')}</Chip>)
  // Passage chip only while the passage is open and the unit hasn't finished it yet.
  if (data.passageOpen && !data.passageFinished)
    items.push(<Chip key="passage" icon={<ArrowRightLeft className="h-4 w-4" />} onClick={() => navigate('/passage')}>
      {data.passageMissing > 0
        ? `Passage : ${plural(data.passageMissing, 'membre sans choix', 'membres sans choix')}`
        : 'Passage : à terminer'}</Chip>)

  // Repeated absences: a dropdown listing each member with their run of missed réunions (threshold = setting).
  const absent = data.repeatedAbsences ?? []
  if (absent.length > 0)
    items.push(
      <DropdownMenu key="absent">
        <DropdownMenuTrigger asChild>
          <button type="button"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/70">
            <CalendarX className="h-4 w-4" />
            {plural(absent.length, 'membre absent plusieurs fois de suite', 'membres absents plusieurs fois de suite')}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
          <DropdownMenuLabel>Réunions manquées de suite</DropdownMenuLabel>
          {absent.map(a => (
            <DropdownMenuItem key={a.memberId} onSelect={() => onOpenMember(a.memberId)} className="justify-between gap-4">
              <span>{a.name}</span>
              <span className="tabular-nums text-muted-foreground">{a.count}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>)

  if (items.length === 0)
    return (
      <p className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4" />Rien à traiter dans l'unité pour le moment.
      </p>
    )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-muted-foreground">À traiter :</span>
      {items}
    </div>
  )
}
