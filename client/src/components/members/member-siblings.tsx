import { useState } from 'react'
import { Link } from 'react-router'
import { Users, X, Plus, Search, Flag } from 'lucide-react'
import { useMemberSiblings, useUnlinkSibling, useCreateSiblingReport } from '@/services/sibling-service'
import { useMembers } from '@/services/member-service'
import { useDebounce } from '@/hooks/use-debounce'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { SiblingReconcileSheet } from '@/components/members/sibling-reconcile-sheet'
import { parseApiError } from '@/lib/error-utils'
import { computeAge } from '@/lib/utils'
import { toast } from 'sonner'

// "Frères et sœurs" section on a member fiche. Shows the member's CONFIRMED siblings (from their fratrie group).
// `canManage` (CG) enables linking another member as a sibling + unlinking one; `linkable` makes siblings click
// through to their fiche (admin panel only — not on a youth's own Ma fiche). `canReport` (member's OWN Ma fiche)
// shows a "Signaler une erreur" button so the member can flag a missing/wrong sibling to the CG.
export function MemberSiblings({ memberId, canManage = false, linkable = false, canReport = false }: { memberId: string; canManage?: boolean; linkable?: boolean; canReport?: boolean }) {
  const { data: siblings, isLoading } = useMemberSiblings(memberId)
  const unlink = useUnlinkSibling()
  const [unlinkTarget, setUnlinkTarget] = useState<{ id: string; name: string } | null>(null)
  const [showLink, setShowLink] = useState(false)
  const [showReport, setShowReport] = useState(false)
  // The member being linked → opens the reconcile drawer (choose canonical parents/address for the whole family),
  // same flow as the Fratries page. The family set = this member + its existing siblings + the chosen target.
  const [reconcileTarget, setReconcileTarget] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 350)
  const { data: results } = useMembers({ search: debounced, pageSize: 10 })

  const doUnlink = async () => {
    if (!unlinkTarget) return
    try { await unlink.mutateAsync(unlinkTarget.id); toast.success('Lien de fratrie retiré'); setUnlinkTarget(null) }
    catch (e) { toast.error(parseApiError(e)) }
  }

  // Pick a target → close the search dialog and open the reconcile drawer.
  const pickTarget = (targetId: string) => { setReconcileTarget(targetId); setShowLink(false); setSearch('') }

  // Full family for the reconcile: this member + its confirmed siblings + the new target (deduped).
  const reconcileIds = reconcileTarget
    ? Array.from(new Set([memberId, ...(siblings ?? []).map((s) => s.memberId), reconcileTarget]))
    : []

  if (isLoading) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-primary" />Frères et sœurs</CardTitle>
        {canManage
          ? <Button size="sm" variant="outline" onClick={() => setShowLink(true)}><Plus className="mr-1 h-4 w-4" />Lier un frère/sœur</Button>
          : canReport && <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setShowReport(true)}><Flag className="mr-1 h-4 w-4" />Signaler une erreur</Button>}
      </CardHeader>
      <CardContent>

      {(!siblings || siblings.length === 0) ? (
        <p className="text-sm text-muted-foreground">Aucun frère ou sœur enregistré.</p>
      ) : (
        <ul className="space-y-1.5">
          {siblings.map((s) => {
            const age = computeAge(s.dateOfBirth)
            const body = (
              <span className="flex items-center gap-2">
                <span className="font-medium">{s.firstName} {s.lastName}</span>
                <span className="text-xs text-muted-foreground">{s.unitName ?? 'Sans unité'}{age != null ? ` · ${age} ans` : ''}</span>
              </span>
            )
            return (
              <li key={s.memberId} className="flex items-center justify-between rounded-md border px-3 py-1.5">
                {linkable
                  ? <Link to={`/members/${s.memberId}`} className="hover:underline">{body}</Link>
                  : body}
                {canManage && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setUnlinkTarget({ id: s.memberId, name: `${s.firstName} ${s.lastName}` })}
                    title="Retirer de la fratrie" aria-label="Retirer de la fratrie">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Manual link — search a member and link them as a sibling (CG). */}
      <Dialog open={showLink} onOpenChange={(o) => { setShowLink(o); if (!o) setSearch('') }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Lier un frère / une sœur</DialogTitle></DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input autoFocus placeholder="Rechercher un membre…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {results?.items?.filter((m) => m.id !== memberId).map((m) => (
              <button key={m.id} type="button" onClick={() => pickTarget(m.id)}
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50">
                <span className="font-medium">{m.firstName} {m.lastName}</span>
                <span className="text-xs text-muted-foreground">{m.cardNumber ?? ''}</span>
              </button>
            ))}
            {debounced && (!results?.items || results.items.filter((m) => m.id !== memberId).length === 0) && (
              <p className="py-4 text-center text-sm text-muted-foreground">Aucun membre trouvé.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reconcile drawer — same as the Fratries page: choose the canonical parents/address to keep for the whole
          family before linking (approve creates/merges the fratrie AND harmonises the shared data). */}
      {reconcileTarget && reconcileIds.length >= 2 && (
        <SiblingReconcileSheet
          key={reconcileTarget}
          memberIds={reconcileIds}
          title="Lier un frère / une sœur"
          confirmLabel="Lier et harmoniser"
          onClose={() => setReconcileTarget(null)}
        />
      )}

      {/* Member "Signaler une erreur" — flags a fratrie problem to the CG (who fixes it via link/unlink). */}
      {canReport && <ReportSiblingDialog open={showReport} onOpenChange={setShowReport} />}

      <ConfirmDialog
        open={!!unlinkTarget}
        onOpenChange={(o) => !o && setUnlinkTarget(null)}
        title="Retirer de la fratrie ?"
        description={`${unlinkTarget?.name ?? ''} ne sera plus lié(e) comme frère/sœur. Si la fratrie ne compte plus qu'un membre, elle est dissoute.`}
        confirmLabel="Retirer"
        onConfirm={doUnlink}
        loading={unlink.isPending}
        variant="destructive"
      />
      </CardContent>
    </Card>
  )
}

// The three problem kinds a member can flag (keep in sync with the backend SiblingReportKinds).
const REPORT_KINDS = [
  { value: 'missing', label: 'Il manque un frère ou une sœur' },
  { value: 'wrong', label: "Une des personnes n'est pas de ma famille" },
  { value: 'other', label: 'Autre problème' },
] as const

// Member-facing report dialog: pick a problem + optional note → sent to the Chef de Groupe.
function ReportSiblingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const report = useCreateSiblingReport()
  const [kind, setKind] = useState<string>('missing')
  const [note, setNote] = useState('')

  const submit = async () => {
    try {
      await report.mutateAsync({ kind, note: note.trim() || undefined })
      toast.success('Signalement envoyé à la maîtrise. Merci !')
      onOpenChange(false); setNote(''); setKind('missing')
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Signaler une erreur de fratrie</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Indiquez le problème : un chef de groupe le corrigera.</p>
        <div className="space-y-1.5">
          {REPORT_KINDS.map((k) => (
            <label key={k.value} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${kind === k.value ? 'border-primary/50 bg-primary/5' : ''}`}>
              <input type="radio" checked={kind === k.value} onChange={() => setKind(k.value)} className="h-4 w-4" />
              {k.label}
            </label>
          ))}
        </div>
        <textarea className="min-h-20 w-full rounded-md border bg-background p-2 text-sm" placeholder="Précisez si besoin (nom du frère/sœur manquant…)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} disabled={report.isPending}>{report.isPending ? 'Envoi…' : 'Envoyer'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
