// "Comptes manquants" — create login accounts for members who have none. Pick a scope (all active members for a
// group manager, or a single unit), see who's missing a login, and create accounts one-by-one or in bulk. Members
// with a contact email get an activation link by email; members without one get a temp password shown on screen
// (LoginCredsDialog) for the CG to relay by hand. Requires members.reset_password.
import { useState } from 'react'
import { UserPlus, AlertTriangle, Mail, KeyRound } from 'lucide-react'
import { useUnits } from '@/services/unit-service'
import { useIsManager } from '@/lib/use-is-manager'
import { useMissingLogins, useCreateMemberLogin, useCreateMissingLogins } from '@/services/member-service'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/shared/empty-state'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { PageHeader } from '@/components/shared/page-header'
import { Page } from '@/components/shared/page'
import { EmailDeliveryWarning } from '@/components/shared/email-delivery-warning'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoginCredsDialog, type LoginCred } from '@/components/admin/login-creds-dialog'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'

const ALL_ACTIVE = '__all_active__'

// `embedded` = rendered as a tab elsewhere (hides its own header).
export default function MissingLoginsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { data: units } = useUnits({ pageSize: 100, isActive: true })
  const isManager = useIsManager()
  const [unitId, setUnitId] = useState<string>(isManager ? ALL_ACTIVE : '')
  const isAll = unitId === ALL_ACTIVE
  const enabled = isAll ? isManager : !!unitId
  const { data: missing, isLoading } = useMissingLogins(isAll ? undefined : (unitId || undefined), enabled)
  const createOne = useCreateMemberLogin()
  const createAll = useCreateMissingLogins()
  const [creds, setCreds] = useState<{ emailSent: number; alreadyHad: number; list: LoginCred[] } | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null) // disable only the acting row

  const onScopeChange = (v: string) => { setUnitId(v); setCreds(null) }

  const createFor = async (m: { memberId: string; memberName: string }) => {
    setBusyId(m.memberId)
    try {
      const r = await createOne.mutateAsync(m.memberId)
      if (r.sentToEmail) toast.success(`Email d'activation envoyé à ${r.sentToEmail}`)
      else setCreds({ emailSent: 0, alreadyHad: 0, list: [{ memberName: m.memberName, username: r.username, temporaryPassword: r.temporaryPassword! }] })
    } catch (e) { toast.error(parseApiError(e)) } finally { setBusyId(null) }
  }

  const createBulk = async () => {
    try {
      const r = await createAll.mutateAsync(isAll ? { allActive: true } : { unitId })
      setConfirmAll(false)
      setCreds({ emailSent: r.emailSent, alreadyHad: r.alreadyHad, list: r.noEmailCreds })
      toast.success(`${r.created} compte(s) créé(s)` + (r.emailSent ? ` · ${r.emailSent} email(s) d'activation` : ''))
    } catch (e) { toast.error(parseApiError(e)); setConfirmAll(false) }
  }

  const scopeName = isAll ? 'Tous les membres actifs' : (units?.items.find(u => u.id === unitId)?.name ?? '')

  return (
    <Page>
      {!embedded && (
        <PageHeader
          title="Comptes manquants"
          icon={UserPlus}
          description="Créez un identifiant de connexion pour les membres qui n'en ont pas encore. Ceux qui ont un email reçoivent un lien d'activation ; pour les autres, un mot de passe temporaire est affiché à l'écran (à communiquer à la main)."
        />
      )}
      <EmailDeliveryWarning />

      {/* Scope picker */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={unitId} onValueChange={onScopeChange}>
          <SelectTrigger className="w-full sm:w-80"><SelectValue placeholder="Choisir une portée…" /></SelectTrigger>
          <SelectContent>
            {isManager && <SelectItem value={ALL_ACTIVE}>Tous les membres actifs</SelectItem>}
            {units?.items.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {enabled && missing && missing.length > 0 && (
          <Button onClick={() => setConfirmAll(true)} disabled={createAll.isPending}>
            <KeyRound className="mr-2 h-4 w-4" />
            {createAll.isPending ? 'Création…' : `Créer les ${missing.length} comptes`}
          </Button>
        )}
      </div>

      {!enabled ? (
        <EmptyState icon={UserPlus} title="Choisissez une portée" description="Sélectionnez une unité (ou « Tous les membres actifs ») pour voir les membres sans compte." />
      ) : isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !missing || missing.length === 0 ? (
        <EmptyState icon={UserPlus} title="Aucun compte manquant" description="Tous les membres de cette portée ont déjà un identifiant." />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{scopeName} · {missing.length} membre(s) sans compte</p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Membre</th>
                  <th className="p-2">Unité</th>
                  <th className="p-2">Email de contact</th>
                  <th className="p-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {missing.map(m => (
                  <tr key={m.memberId} className="border-t hover:bg-muted/30">
                    <td className="p-2 font-medium">{m.memberName}</td>
                    <td className="p-2 text-muted-foreground">{m.unitCode ?? '—'}</td>
                    <td className="p-2">
                      {m.hasEmail
                        ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Mail className="h-3.5 w-3.5" />{m.contactEmail}</span>
                        : <span className="inline-flex items-center gap-1 text-warning"><AlertTriangle className="h-3.5 w-3.5" />aucun (mot de passe à l'écran)</span>}
                    </td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => createFor(m)} disabled={busyId === m.memberId || createAll.isPending}>
                        {busyId === m.memberId ? 'Création…' : 'Créer le compte'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={(o) => !o && setConfirmAll(false)}
        title="Créer tous les comptes manquants ?"
        description={`${missing?.length ?? 0} identifiant(s) seront créés pour ${scopeName}. Les membres avec un email reçoivent un lien d'activation ; les autres, un mot de passe temporaire affiché ensuite à l'écran.`}
        confirmLabel="Créer les comptes"
        onConfirm={createBulk}
        loading={createAll.isPending}
      />

      {creds && (
        <LoginCredsDialog
          open={!!creds}
          onOpenChange={(o) => !o && setCreds(null)}
          emailSent={creds.emailSent}
          alreadyHad={creds.alreadyHad}
          creds={creds.list}
        />
      )}
    </Page>
  )
}
