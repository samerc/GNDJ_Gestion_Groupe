// CG "Comptes d'inscription" page ("/admin/demande-accounts", perm demande.view; verify/reset need demande.manage).
// Lists the applicant (parent) accounts behind the demandes — including UNVERIFIED accounts that have no demande
// yet, which is the whole point: email verification is required to submit, so a parent whose verification email
// never arrived is otherwise invisible and stuck. The CG can filter to the unverified ones, search, click
// "Vérifier manuellement" as a safety net, jump to an account's demande(s), and reset the account's portal
// password (shown once to relay to the parent).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemandeAccounts, useVerifyAccountEmail, useResetAccountPassword } from '@/services/demande-admin-service'
import { useDebounce } from '@/hooks/use-debounce'
import { parseApiError } from '@/lib/error-utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Tip } from '@/components/ui/tooltip'
import { CheckCircle2, MailWarning, Search, ShieldCheck, X, FileText, KeyRound, Copy } from 'lucide-react'
import { toast } from 'sonner'
import type { DemandeAccount } from '@/services/demande-admin-service'

export default function DemandeAccountsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [unverifiedOnly, setUnverifiedOnly] = useState(false)
  const debouncedSearch = useDebounce(search)
  const { data: accounts, isLoading } = useDemandeAccounts(unverifiedOnly, debouncedSearch)
  const verify = useVerifyAccountEmail()
  const reset = useResetAccountPassword()
  const [toVerify, setToVerify] = useState<DemandeAccount | null>(null)
  const [toReset, setToReset] = useState<DemandeAccount | null>(null)
  // Temp credentials shown once after a reset, for the CG to relay to the parent.
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null)

  // Jump to the review page filtered to this account's demande(s).
  const viewDemandes = (a: DemandeAccount) => {
    if (a.demandeCount === 0) return
    navigate(`/admin/demandes?account=${a.id}`)
  }

  const confirmVerify = async () => {
    if (!toVerify) return
    try {
      await verify.mutateAsync(toVerify.id)
      toast.success('Email vérifié — le parent peut maintenant se connecter et soumettre.')
      setToVerify(null)
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const confirmReset = async () => {
    if (!toReset) return
    try {
      const r = await reset.mutateAsync(toReset.id)
      setCreds({ email: r.email, password: r.temporaryPassword })
      setToReset(null)
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Comptes d'inscription</h1>
        <p className="text-sm text-muted-foreground">
          Comptes des parents. Cliquez sur une ligne pour voir ses demandes. Un parent dont l'email de
          vérification n'est jamais arrivé peut être vérifié manuellement, et son mot de passe réinitialisé.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par email ou nom…"
            className="pl-8 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
              aria-label="Effacer la recherche"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          variant={unverifiedOnly ? 'default' : 'outline'}
          onClick={() => setUnverifiedOnly((v) => !v)}
        >
          <MailWarning className="mr-2 h-4 w-4" />
          Non vérifiés uniquement
        </Button>
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !accounts || accounts.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Aucun compte" description="Aucun compte d'inscription à afficher." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Statut email</TableHead>
                <TableHead className="text-center">Demandes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => {
                const clickable = a.demandeCount > 0
                return (
                  <TableRow
                    key={a.id}
                    className={clickable ? 'cursor-pointer' : ''}
                    onClick={() => viewDemandes(a)}
                  >
                    <TableCell className="font-medium break-all">{a.email}</TableCell>
                    <TableCell>{a.contactName || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      {a.emailVerified ? (
                        <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Vérifié
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                          <MailWarning className="mr-1 h-3.5 w-3.5" /> Non vérifié
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {a.submittedCount}/{a.demandeCount}
                    </TableCell>
                    {/* Stop row-click propagation so the action buttons don't also navigate. */}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1.5">
                        {clickable && (
                          <Tip content="Voir les demandes de ce compte">
                            <Button size="sm" variant="outline" onClick={() => viewDemandes(a)}>
                              <FileText className="mr-1 h-4 w-4" />Demandes
                            </Button>
                          </Tip>
                        )}
                        <Tip content="Réinitialiser le mot de passe du portail">
                          <Button size="sm" variant="outline" onClick={() => setToReset(a)}>
                            <KeyRound className="mr-1 h-4 w-4" />Mot de passe
                          </Button>
                        </Tip>
                        {!a.emailVerified && (
                          <Button size="sm" variant="outline" onClick={() => setToVerify(a)}>
                            Vérifier
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={!!toVerify}
        onOpenChange={(o) => !o && setToVerify(null)}
        title="Vérifier l'email manuellement ?"
        description={`Confirmer que l'adresse « ${toVerify?.email} » est valide. Le parent pourra alors se connecter et soumettre sa demande sans cliquer sur le lien de vérification.`}
        confirmLabel="Vérifier"
        loading={verify.isPending}
        onConfirm={confirmVerify}
      />

      <ConfirmDialog
        open={!!toReset}
        onOpenChange={(o) => !o && setToReset(null)}
        title="Réinitialiser le mot de passe ?"
        description={`Un nouveau mot de passe temporaire sera généré pour « ${toReset?.email} » et affiché une seule fois. Toute session active du parent sera déconnectée. Vous devrez communiquer ce mot de passe au parent.`}
        confirmLabel="Réinitialiser"
        loading={reset.isPending}
        onConfirm={confirmReset}
      />

      {/* One-time credentials dialog after a reset. */}
      <Dialog open={!!creds} onOpenChange={(o) => { if (!o) setCreds(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouveau mot de passe</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Communiquez ces identifiants au parent. Le mot de passe n'est affiché qu'une seule fois.
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <div className="min-w-0"><div className="text-xs text-muted-foreground">Identifiant (email)</div><div className="break-all font-mono text-sm">{creds?.email}</div></div>
                <Button variant="ghost" size="sm" aria-label="Copier l'identifiant" title="Copier" onClick={() => { navigator.clipboard.writeText(creds?.email ?? ''); toast.success('Copié !') }}><Copy className="h-3.5 w-3.5" /></Button>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <div className="min-w-0"><div className="text-xs text-muted-foreground">Mot de passe temporaire</div><div className="font-mono text-sm">{creds?.password}</div></div>
                <Button variant="ghost" size="sm" aria-label="Copier le mot de passe" title="Copier" onClick={() => { navigator.clipboard.writeText(creds?.password ?? ''); toast.success('Copié !') }}><Copy className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          </div>
          <DialogFooter><Button onClick={() => setCreds(null)}>Fermer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
