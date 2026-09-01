// CG "Comptes d'inscription" page ("/admin/demande-accounts", perm demande.view; verify/reset/delete need
// demande.manage). Lists the applicant (parent) accounts behind the demandes — including UNVERIFIED accounts
// that have no demande yet, which is the whole point: email verification is required to submit, so a parent
// whose verification email never arrived is otherwise invisible and stuck. The CG can filter to the unverified
// ones, search, sort the columns, click "Vérifier manuellement" as a safety net, jump to an account's
// demande(s), reset the account's portal password, and DELETE an account (which removes all its demandes too).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useDemandeAccounts, useVerifyAccountEmail, useResetAccountPassword, useDeleteAccount } from '@/services/demande-admin-service'
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
import { CheckCircle2, MailWarning, Search, ShieldCheck, X, FileText, KeyRound, Copy, Trash2, ArrowUp, ArrowDown, ArrowUpDown, MailCheck } from 'lucide-react'
import { toast } from 'sonner'
import type { DemandeAccount } from '@/services/demande-admin-service'

// A clickable, hoisted sort header (module scope to keep it stable across renders).
type SortKey = 'email' | 'contact' | 'status' | 'demandes' | 'created'
function SortHeader({ label, field, current, dir, onSort, className }: { label: string; field: SortKey; current: SortKey | null; dir: 'asc' | 'desc'; onSort: (f: SortKey) => void; className?: string }) {
  const active = current === field
  return (
    <button className={`flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground hover:text-foreground transition-colors ${className ?? ''}`} onClick={() => onSort(field)}>
      {label}
      {active ? (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-50" />}
    </button>
  )
}

// Email-verified badge — shared by the desktop table + the mobile cards.
function StatusBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Badge variant="outline" className="shrink-0 border-emerald-300 bg-emerald-50 text-emerald-700">
      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Vérifié
    </Badge>
  ) : (
    <Badge variant="outline" className="shrink-0 border-amber-300 bg-amber-50 text-amber-700">
      <MailWarning className="mr-1 h-3.5 w-3.5" /> Non vérifié
    </Badge>
  )
}

// Compact, labelled summary of an account's demandes — replaces the cryptic "1/3" ratio.
// Shows how many are SUBMITTED (ready for the CG to review) vs still DRAFTS (not yet soumises).
function DemandesSummary({ submitted, total, className }: { submitted: number; total: number; className?: string }) {
  if (total === 0) return <span className={`text-sm text-muted-foreground ${className ?? ''}`}>Aucune</span>
  const drafts = total - submitted
  return (
    <span className={`text-sm ${className ?? ''}`}>
      {submitted > 0
        ? <span className="font-medium text-emerald-700">{submitted} soumise{submitted > 1 ? 's' : ''}</span>
        : <span className="text-muted-foreground">0 soumise</span>}
      {drafts > 0 && <span className="text-muted-foreground"> · {drafts} brouillon{drafts > 1 ? 's' : ''}</span>}
    </span>
  )
}

// The per-account action buttons — shared by the desktop table cell (justify-end) and the mobile card
// (flex-wrap). "Demandes" is the PRIMARY action (the only way into a account's demandes now that the row
// isn't clickable) so it's filled; the rest are outline utilities. Each has a tooltip explaining what it does.
function AccountActions({ a, clickable, onView, onReset, onVerify, onDelete, className }: {
  a: DemandeAccount; clickable: boolean
  onView: (a: DemandeAccount) => void; onReset: (a: DemandeAccount) => void
  onVerify: (a: DemandeAccount) => void; onDelete: (a: DemandeAccount) => void; className?: string
}) {
  return (
    <div className={`flex gap-1.5 ${className ?? ''}`}>
      {clickable && (
        <Tip content="Voir les demandes (enfants) de ce compte">
          <Button size="sm" onClick={() => onView(a)}><FileText className="mr-1 h-4 w-4" />Voir les demandes</Button>
        </Tip>
      )}
      {!a.emailVerified && (
        <Tip content="Marquer l'email comme vérifié (si le lien de vérification n'est jamais arrivé)">
          <Button size="sm" variant="outline" onClick={() => onVerify(a)}><MailCheck className="mr-1 h-4 w-4" />Vérifier l'email</Button>
        </Tip>
      )}
      <Tip content="Réinitialiser le mot de passe du portail (affiché une fois, à communiquer au parent)">
        <Button size="sm" variant="outline" onClick={() => onReset(a)}><KeyRound className="mr-1 h-4 w-4" />Mot de passe</Button>
      </Tip>
      <Tip content="Supprimer ce compte et toutes ses demandes">
        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => onDelete(a)} aria-label="Supprimer le compte">
          <Trash2 className="h-4 w-4" />
        </Button>
      </Tip>
    </div>
  )
}

export default function DemandeAccountsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [unverifiedOnly, setUnverifiedOnly] = useState(false)
  const debouncedSearch = useDebounce(search)
  const { data: accounts, isLoading } = useDemandeAccounts(unverifiedOnly, debouncedSearch)
  const verify = useVerifyAccountEmail()
  const reset = useResetAccountPassword()
  const del = useDeleteAccount()
  const [toVerify, setToVerify] = useState<DemandeAccount | null>(null)
  const [toReset, setToReset] = useState<DemandeAccount | null>(null)
  const [toDelete, setToDelete] = useState<DemandeAccount | null>(null)
  // Temp credentials shown once after a reset, for the CG to relay to the parent.
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null)

  // Client-side sorting (the list is capped at 500 rows). Default = server order (createdAt desc).
  const [sortBy, setSortBy] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const handleSort = (f: SortKey) => {
    if (sortBy === f) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(f); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    if (!accounts) return []
    if (!sortBy) return accounts
    const factor = sortDir === 'asc' ? 1 : -1
    const val = (a: DemandeAccount): string | number => {
      switch (sortBy) {
        case 'email': return a.email.toLowerCase()
        case 'contact': return (a.contactName ?? '').toLowerCase()
        case 'status': return a.emailVerified ? 1 : 0
        case 'demandes': return a.demandeCount
        case 'created': return a.createdAt
      }
    }
    return [...accounts].sort((x, y) => {
      const vx = val(x), vy = val(y)
      if (vx < vy) return -1 * factor
      if (vx > vy) return 1 * factor
      return 0
    })
  }, [accounts, sortBy, sortDir])

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

  const confirmDelete = async () => {
    if (!toDelete) return
    try {
      const r = await del.mutateAsync(toDelete.id)
      toast.success(r.demandesDeleted > 0
        ? `Compte supprimé (${r.demandesDeleted} demande(s) supprimée(s)).`
        : 'Compte supprimé.')
      setToDelete(null)
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Comptes d'inscription</h1>
        <p className="text-sm text-muted-foreground">
          Comptes des parents. Chaque compte peut déposer une demande par enfant (« soumise » = prête à traiter,
          « brouillon » = pas encore soumise). Utilisez « Voir les demandes » pour les ouvrir. Un parent dont l'email
          de vérification n'est jamais arrivé peut être vérifié manuellement, et son mot de passe réinitialisé.
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
      ) : sorted.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Aucun compte" description="Aucun compte d'inscription à afficher." />
      ) : (
        <>
          {/* Desktop: sortable table. */}
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                {/* Compact header; every column is click-to-sort. */}
                <TableRow>
                  <TableHead className="h-9"><SortHeader label="Email" field="email" current={sortBy} dir={sortDir} onSort={handleSort} /></TableHead>
                  <TableHead className="h-9"><SortHeader label="Contact" field="contact" current={sortBy} dir={sortDir} onSort={handleSort} /></TableHead>
                  <TableHead className="h-9"><SortHeader label="Statut email" field="status" current={sortBy} dir={sortDir} onSort={handleSort} /></TableHead>
                  <TableHead className="h-9"><SortHeader label="Demandes" field="demandes" current={sortBy} dir={sortDir} onSort={handleSort} className="justify-center" /></TableHead>
                  <TableHead className="h-9 text-right text-xs uppercase text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((a) => {
                  const clickable = a.demandeCount > 0
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="py-1.5 text-sm font-medium break-all">{a.email}</TableCell>
                      <TableCell className="py-1.5 text-sm">{a.contactName || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="py-1.5"><StatusBadge verified={a.emailVerified} /></TableCell>
                      <TableCell className="py-1.5 text-center"><DemandesSummary submitted={a.submittedCount} total={a.demandeCount} /></TableCell>
                      <TableCell className="py-1.5 text-right">
                        <AccountActions a={a} clickable={clickable} onView={viewDemandes} onReset={(x) => setToReset(x)} onVerify={(x) => setToVerify(x)} onDelete={(x) => setToDelete(x)} className="justify-end" />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: card list (the table columns squeeze the email into unreadable character-wrapping). */}
          <div className="space-y-2 md:hidden">
            {sorted.map((a) => {
              const clickable = a.demandeCount > 0
              return (
                <div key={a.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="break-all text-sm font-medium leading-snug">{a.email}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{a.contactName || '—'}</div>
                      <div className="mt-1"><DemandesSummary submitted={a.submittedCount} total={a.demandeCount} className="text-xs" /></div>
                    </div>
                    <StatusBadge verified={a.emailVerified} />
                  </div>
                  <AccountActions a={a} clickable={clickable} onView={viewDemandes} onReset={(x) => setToReset(x)} onVerify={(x) => setToVerify(x)} onDelete={(x) => setToDelete(x)} className="mt-2.5 flex-wrap" />
                </div>
              )
            })}
          </div>
        </>
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

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Supprimer ce compte ?"
        description={`Le compte « ${toDelete?.email} » et TOUTES ses demandes${toDelete && toDelete.demandeCount > 0 ? ` (${toDelete.demandeCount})` : ''} seront définitivement supprimés. Les membres déjà créés à partir d'une demande sont conservés. Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={del.isPending}
        onConfirm={confirmDelete}
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
