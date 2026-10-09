// « Passages » card on the member file (Unités / Fonctions tab), for chefs and admins: the member's passage line for
// every scout year — where they were, what the chef d'unité proposed (with their note), what the CG decided (with
// their reason when it differs), the status, and who did what.
import { ArrowRight, ArrowRightLeft, LogOut } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { useMemberPassages, type MemberPassage } from '@/services/passage-service'

const STATUS: Record<string, { label: string; variant: 'warning' | 'success' | 'info' | 'secondary' }> = {
  Pending: { label: 'En attente', variant: 'warning' },
  Approved: { label: 'Accepté', variant: 'success' },
  Finalized: { label: 'Publié', variant: 'info' },
  Rejected: { label: 'Rejeté', variant: 'secondary' },
}

// « Unité · Équipe · Fonction », or « Quitte le groupe ».
function Placement({ leaving, unit, team, role }: { leaving: boolean; unit: string | null; team: string | null; role: string | null }) {
  if (leaving) return <span className="inline-flex items-center gap-1 font-medium text-orange-700 dark:text-orange-300"><LogOut className="h-3.5 w-3.5" />Quitte le groupe</span>
  return <span><span className="font-medium">{unit ?? '—'}</span>{team ? ` · ${team}` : ''}{role ? ` · ${role}` : ''}</span>
}

function PassageLine({ p }: { p: MemberPassage }) {
  const status = STATUS[p.status] ?? { label: p.status, variant: 'secondary' as const }
  const finalLeaving = p.finalIsLeaving ?? p.isLeaving
  // The CG's decision only matters when it differs from the proposal (CgModified) — else it's the same line.
  const hasFinal = p.cgModified
  return (
    <li className="space-y-1.5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{p.scoutYear}</span>
        <Badge variant={status.variant}>{status.label}</Badge>
        {p.cgModified && <Badge variant="warning">Modifié par le CG</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Placement leaving={false} unit={p.currentUnit} team={p.currentTeam} role={p.currentRole} />
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        <Placement leaving={p.isLeaving} unit={p.proposedUnit} team={p.proposedTeam} role={p.proposedRole} />
        {p.proposedBy && <span className="text-xs text-muted-foreground">(proposé par {p.proposedBy})</span>}
      </div>
      {p.cuNotes && <p className="text-xs text-muted-foreground">Note du chef d'unité : {p.cuNotes}</p>}
      {hasFinal && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 dark:border-amber-900 dark:bg-amber-950/40">
          <span className="text-xs font-medium text-amber-800 dark:text-amber-300">Décision du CG : </span>
          <Placement leaving={finalLeaving} unit={p.finalUnit} team={p.finalTeam} role={p.finalRole} />
          {p.cgNotes && <p className="text-xs text-amber-800 dark:text-amber-300">Raison : {p.cgNotes}</p>}
        </div>
      )}
      {!hasFinal && p.cgNotes && <p className="text-xs text-muted-foreground">Note du CG : {p.cgNotes}</p>}
      {p.reviewedBy && p.reviewedAt && (
        <p className="text-xs text-muted-foreground">Revu par {p.reviewedBy} le {formatDate(p.reviewedAt)}</p>
      )}
    </li>
  )
}

export function MemberPassages({ memberId }: { memberId: string }) {
  const { data, isLoading, isError } = useMemberPassages(memberId)
  // Nothing to show (or no right to see it): no card at all.
  if (isLoading || isError || !data || data.length === 0) return null
  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><ArrowRightLeft className="h-4 w-4" />Passages</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">{data.map((p) => <PassageLine key={p.id} p={p} />)}</ul>
      </CardContent>
    </Card>
  )
}
