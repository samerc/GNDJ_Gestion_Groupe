// "Accès délégués" overview — shown on the Accès maîtrise page so the CG can TRACK who holds a per-person
// delegation (invisible extra access, no role) and manage it in one place: add (member search → delegation
// dialog), edit (reopen the dialog) or remove (clear). Backed by GET /members/delegations. See DelegationDialog.
import { useState } from 'react'
import { useMemberDelegations, useSetMemberDelegation, type MemberDelegationSummary } from '@/services/member-service'
import { MemberPickerDialog } from '@/components/shared/member-picker-dialog'
import { DelegationDialog } from '@/pages/members/delegation-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { parseApiError } from '@/lib/error-utils'
import { UserPlus, ShieldCheck, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'

export function MemberDelegationsSection() {
  const { data: delegations, isLoading } = useMemberDelegations()
  const [pickerOpen, setPickerOpen] = useState(false)
  // The member whose delegation dialog is open (from "Ajouter" pick or a row "Modifier").
  const [dialogMember, setDialogMember] = useState<{ id: string; name: string } | null>(null)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />Accès délégués
          </CardTitle>
          <Button size="sm" onClick={() => setPickerOpen(true)}>
            <UserPlus className="mr-1 h-4 w-4" />Ajouter
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Accès accordés à une personne précise sans rôle visible (par ex. un futur Chef de Groupe, ou un accès
          ciblé comme « Camp BP »). Prend effet à la prochaine connexion de la personne.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? <LoadingSpinner variant="table" /> : (
          (delegations && delegations.length > 0) ? (
            <div className="divide-y rounded-md border">
              {delegations.map(d => (
                <DelegationRow key={d.memberId} row={d} onEdit={() => setDialogMember({ id: d.memberId, name: d.name })} />
              ))}
            </div>
          ) : (
            <EmptyState icon={ShieldCheck} title="Aucun accès délégué" description="Aucun accès délégué pour le moment." />
          )
        )}
      </CardContent>

      {/* Add: pick a member, then open the delegation dialog for them. */}
      <MemberPickerDialog open={pickerOpen} onOpenChange={setPickerOpen}
        title="Ajouter un accès délégué"
        description="Choisissez le membre à qui accorder un accès."
        onPick={(m) => { setPickerOpen(false); setDialogMember(m) }} />

      {dialogMember && (
        <DelegationDialog memberId={dialogMember.id} memberName={dialogMember.name}
          open onOpenChange={(v) => { if (!v) setDialogMember(null) }} />
      )}
    </Card>
  )
}

function DelegationRow({ row, onEdit }: { row: MemberDelegationSummary; onEdit: () => void }) {
  const setMutation = useSetMemberDelegation(row.memberId)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const remove = async () => {
    try {
      await setMutation.mutateAsync({ profileId: null, areaLevels: {} }) // empty clears the delegation
      toast.success(`Accès délégué retiré pour ${row.name}`)
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {row.name}
          {row.unitCode && <span className="ml-1.5 text-xs font-normal text-muted-foreground">· {row.unitCode}</span>}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {row.profileName && <Badge className="gap-1"><ShieldCheck className="h-3 w-3" />Profil : {row.profileName}</Badge>}
          {row.areas.map(a => <Badge key={a} variant="secondary">{a}</Badge>)}
          {!row.profileName && row.areas.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit}><Pencil className="mr-1 h-3.5 w-3.5" />Modifier</Button>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
          onClick={() => setConfirmOpen(true)} disabled={setMutation.isPending}>
          <X className="mr-1 h-3.5 w-3.5" />Retirer
        </Button>
      </div>
      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Retirer l'accès délégué ?"
        description={`Retirer l'accès délégué de ${row.name} ? Il/elle perdra cet accès à sa prochaine connexion.`}
        confirmLabel="Retirer" variant="destructive" loading={setMutation.isPending} onConfirm={remove} />
    </div>
  )
}

