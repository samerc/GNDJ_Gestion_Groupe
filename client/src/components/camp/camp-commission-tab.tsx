// "Commission" tab of a Camp BP: the members the Chef de Groupe names to run THIS camp (usually 2 ACGs + the ACUs
// they choose). While the camp is active they get the camp screens (camp.manage + camp.grade) — nothing else of
// the CG's powers — from their next sign-in / session refresh. Only the CG (roles.manage_group) can change it;
// commission members themselves see the list read-only.
import { useState } from 'react'
import { toast } from 'sonner'
import { UserPlus, X, Users } from 'lucide-react'
import { useIsCampCg } from './use-is-camp-cg'
import { parseApiError } from '@/lib/error-utils'
import { useCampCommission, useSetCampCommission } from '@/services/camp-service'
import { Button } from '@/components/ui/button'
import { MemberPickerDialog } from '@/components/shared/member-picker-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'

export function CampCommissionTab({ campId }: { campId: string }) {
  const canEdit = useIsCampCg()
  const { data: members, isLoading } = useCampCommission(campId)
  const save = useSetCampCommission(campId)
  const [picking, setPicking] = useState(false)

  const ids = (members ?? []).map((m) => m.memberId)
  const update = async (next: string[], ok: string) => {
    try { await save.mutateAsync(next); toast.success(ok) } catch (err) { toast.error(parseApiError(err)) }
  }

  if (isLoading) return <LoadingSpinner />
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Les membres de la Commission BP gèrent ce camp (familles, jeux, paramètres, notes) sans les autres droits du
          chef de groupe. L'accès s'active à leur prochaine connexion (au plus tard ~15 min) et s'arrête quand le camp est archivé.
        </p>
        {canEdit && (
          <Button size="sm" onClick={() => setPicking(true)} disabled={save.isPending}>
            <UserPlus className="mr-1.5 h-4 w-4" />Ajouter un membre
          </Button>
        )}
      </div>

      {!members || members.length === 0 ? (
        <EmptyState icon={Users} title="Aucun membre dans la commission" description={canEdit ? 'Ajoutez les assistants et chefs qui organisent ce camp.' : 'Le chef de groupe n\'a pas encore nommé la commission.'} />
      ) : (
        <div className="divide-y rounded-lg border">
          {members.map((m) => (
            <div key={m.memberId} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{m.lastName} {m.firstName}</p>
                {m.roles && <p className="truncate text-xs text-muted-foreground">{m.roles}</p>}
              </div>
              {canEdit && (
                <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-destructive" disabled={save.isPending}
                  onClick={() => update(ids.filter((x) => x !== m.memberId), 'Retiré de la commission')}>
                  <X className="mr-1 h-4 w-4" />Retirer
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <MemberPickerDialog open={picking} onOpenChange={setPicking} title="Ajouter à la Commission BP"
        description="Choisissez un membre (assistant de groupe, chef d'unité…)."
        onPick={async (m) => {
          setPicking(false)
          if (ids.includes(m.id)) { toast.info('Déjà dans la commission'); return }
          await update([...ids, m.id], `${m.name} ajouté(e) à la commission`)
        }} />
    </div>
  )
}
