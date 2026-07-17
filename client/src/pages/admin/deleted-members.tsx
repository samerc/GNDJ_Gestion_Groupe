// "Corbeille" (trash) — soft-deleted members. They stay restorable until a background job permanently purges
// them after member.purge_after_days (default 30). Restore undoes the deletion + re-enables the login; "Supprimer
// définitivement" purges now (member + login + all connected data + files). Perm members.delete.
import { useState } from 'react'
import { Trash2, RotateCcw, X } from 'lucide-react'
import { useDeletedMembers, useRestoreMember, usePurgeMember, type DeletedMember } from '@/services/member-service'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Tip } from '@/components/ui/tooltip'
import { formatDateLong } from '@/lib/utils'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'

function daysUntil(purgeAt: string): number {
  return Math.ceil((new Date(purgeAt).getTime() - Date.now()) / 86_400_000)
}

export default function DeletedMembersPage() {
  const { data: members, isLoading } = useDeletedMembers()
  const restore = useRestoreMember()
  const purge = usePurgeMember()
  const [action, setAction] = useState<{ member: DeletedMember; kind: 'restore' | 'purge' } | null>(null)

  const runAction = async () => {
    if (!action) return
    const { member, kind } = action
    try {
      if (kind === 'restore') { await restore.mutateAsync(member.id); toast.success(`${member.firstName} ${member.lastName} restauré(e)`) }
      else { await purge.mutateAsync(member.id); toast.success(`${member.firstName} ${member.lastName} supprimé(e) définitivement`) }
      setAction(null)
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold"><Trash2 className="h-5 w-5 text-primary" />Corbeille</h1>
        <p className="text-sm text-muted-foreground">Membres supprimés. Vous pouvez les restaurer jusqu'à leur suppression définitive automatique. Passé ce délai, le membre, son compte et toutes ses données sont effacés définitivement.</p>
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !members || members.length === 0 ? (
        <EmptyState icon={Trash2} title="Corbeille vide" description="Aucun membre supprimé." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">Membre</th>
                <th className="px-4 py-2.5">Matricule</th>
                <th className="px-4 py-2.5">Supprimé le</th>
                <th className="px-4 py-2.5">Suppression définitive</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => {
                const days = daysUntil(m.purgeAt)
                return (
                  <tr key={m.id} className={i % 2 ? 'bg-muted/20' : ''}>
                    <td className="px-4 py-2.5 font-medium">{m.lastName} {m.firstName}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{m.cardNumber ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatDateLong(m.deletedAt)}</td>
                    <td className="px-4 py-2.5">
                      <span className={days <= 3 ? 'font-medium text-destructive' : 'text-muted-foreground'}>
                        {days <= 0 ? 'imminente' : `dans ${days} jour${days > 1 ? 's' : ''}`}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <Tip content="Restaurer le membre et réactiver son compte">
                          <Button variant="outline" size="sm" onClick={() => setAction({ member: m, kind: 'restore' })}>
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />Restaurer
                          </Button>
                        </Tip>
                        <Tip content="Supprimer définitivement maintenant">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setAction({ member: m, kind: 'purge' })}>
                            <X className="h-4 w-4" />
                          </Button>
                        </Tip>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!action}
        onOpenChange={(o) => { if (!o) setAction(null) }}
        title={action?.kind === 'restore' ? 'Restaurer le membre' : 'Supprimer définitivement'}
        description={action?.kind === 'restore'
          ? `Restaurer ${action?.member.firstName} ${action?.member.lastName} ? Le membre redevient visible et son compte est réactivé (sans affectation active — à réaffecter si besoin).`
          : `Supprimer définitivement ${action?.member.firstName} ${action?.member.lastName} ? Le membre, son compte et toutes ses données (contacts, famille, documents, cotisations…) seront effacés immédiatement. Cette action est irréversible.`}
        confirmLabel={action?.kind === 'restore' ? 'Restaurer' : 'Supprimer définitivement'}
        variant={action?.kind === 'purge' ? 'destructive' : 'default'}
        loading={restore.isPending || purge.isPending}
        onConfirm={runAction}
      />
    </div>
  )
}
