// CG "Comptes d'inscription" page ("/admin/demande-accounts", perm demande.view; verify needs demande.manage).
// Lists the applicant (parent) accounts behind the demandes — including UNVERIFIED accounts that have no demande
// yet, which is the whole point: email verification is required to submit, so a parent whose verification email
// never arrived is otherwise invisible and stuck. The CG can filter to the unverified ones, search, and click
// "Vérifier manuellement" as a safety net so that parent can log in and submit.
import { useState } from 'react'
import { useDemandeAccounts, useVerifyAccountEmail } from '@/services/demande-admin-service'
import { useDebounce } from '@/hooks/use-debounce'
import { parseApiError } from '@/lib/error-utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { CheckCircle2, MailWarning, Search, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import type { DemandeAccount } from '@/services/demande-admin-service'

export default function DemandeAccountsPage() {
  const [search, setSearch] = useState('')
  const [unverifiedOnly, setUnverifiedOnly] = useState(false)
  const debouncedSearch = useDebounce(search)
  const { data: accounts, isLoading } = useDemandeAccounts(unverifiedOnly, debouncedSearch)
  const verify = useVerifyAccountEmail()
  const [toVerify, setToVerify] = useState<DemandeAccount | null>(null)

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Comptes d'inscription</h1>
        <p className="text-sm text-muted-foreground">
          Comptes des parents. Un parent dont l'email de vérification n'est jamais arrivé peut être vérifié
          manuellement ici pour débloquer sa demande.
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
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
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
                  <TableCell className="text-right">
                    {!a.emailVerified && (
                      <Button size="sm" variant="outline" onClick={() => setToVerify(a)}>
                        Vérifier manuellement
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
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
    </div>
  )
}
