// "Super administrateurs" management — super-admin ONLY. Super-admin is a manual account flag (not a role/profile)
// granting ALL permissions on ALL units. Lists the current super-admins and lets a super-admin add (member search
// → grant) or remove one. The last super-admin can't be removed (server-enforced). Takes effect at next login.
import { useState } from 'react'
import { useSuperAdmins, useSetSuperAdmin } from '@/services/role-service'
import { MemberPickerDialog } from '@/components/shared/member-picker-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { Crown, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'

export function SuperAdminsSection() {
  const { data: admins, isLoading } = useSuperAdmins()
  const setSuperAdmin = useSetSuperAdmin()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)
  const [grantConfirm, setGrantConfirm] = useState<{ id: string; name: string } | null>(null)

  const grant = async () => {
    if (!grantConfirm) return
    try {
      await setSuperAdmin.mutateAsync({ memberId: grantConfirm.id, grant: true })
      toast.success(`${grantConfirm.name} est maintenant super-administrateur.`)
      setGrantConfirm(null)
    } catch (e) { toast.error(parseApiError(e)) }
  }

  const remove = async () => {
    if (!removing) return
    try {
      await setSuperAdmin.mutateAsync({ memberId: removing.id, grant: false })
      toast.success(`Super-administrateur retiré pour ${removing.name}.`)
      setRemoving(null)
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-600" />Super administrateurs
          </CardTitle>
          <Button size="sm" onClick={() => setPickerOpen(true)}>
            <UserPlus className="mr-1 h-4 w-4" />Ajouter
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Accès total à toute l'application, indépendamment de toute fonction. Réservé à quelques comptes de
          confiance. Le changement prend effet à la prochaine connexion de la personne.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? <LoadingSpinner variant="table" /> : (
          (admins && admins.length > 0) ? (
            <div className="divide-y rounded-md border">
              {admins.map(a => (
                <div key={a.memberId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.email ?? '—'}{a.unitCode ? ` · ${a.unitCode}` : ''}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                    onClick={() => setRemoving({ id: a.memberId, name: a.name })} disabled={setSuperAdmin.isPending}>
                    <X className="mr-1 h-3.5 w-3.5" />Retirer
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucun super-administrateur.</p>
          )
        )}
      </CardContent>

      <MemberPickerDialog open={pickerOpen} onOpenChange={setPickerOpen}
        title="Ajouter un super-administrateur"
        description="Choisissez le membre à promouvoir. Il doit avoir un compte de connexion."
        onPick={(m) => { setPickerOpen(false); setGrantConfirm(m) }} />

      <ConfirmDialog open={!!grantConfirm} onOpenChange={(v) => { if (!v) setGrantConfirm(null) }}
        title="Rendre super-administrateur"
        description={`Accorder l'accès super-administrateur à ${grantConfirm?.name} ? Cette personne aura TOUS les droits sur TOUT le groupe.`}
        confirmLabel="Accorder" loading={setSuperAdmin.isPending} onConfirm={grant} />

      <ConfirmDialog open={!!removing} onOpenChange={(v) => { if (!v) setRemoving(null) }}
        title="Retirer le super-administrateur"
        description={`Retirer l'accès super-administrateur de ${removing?.name} ?`}
        confirmLabel="Retirer" variant="destructive" loading={setSuperAdmin.isPending} onConfirm={remove} />
    </Card>
  )
}
