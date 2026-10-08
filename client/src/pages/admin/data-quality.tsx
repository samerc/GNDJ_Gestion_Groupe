// "Qualité des données" (Chef de Groupe): one place listing what needs fixing in the ACTIVE members' data —
// invalid emails, emails the providers couldn't deliver (bounces), members with no email at all, missing date of
// birth / gender, likely duplicates. Each line opens the member file; a fixed bounce is "Réactivé" here.
import { useState } from 'react'
import { todayIso } from '@/lib/utils'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ShieldCheck, ChevronDown, ChevronRight, CheckCircle2, RotateCcw, ExternalLink, Check, X, Crown, Undo2 } from 'lucide-react'
import {
  useDataQuality, useClearBounce, useAcknowledgeDataQuality, useRemoveDataQualityAck,
  type DataQualitySection, type DataQualityItem,
} from '@/services/data-quality-service'
import { useEndAssignment } from '@/services/assignment-service'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { parseApiError } from '@/lib/error-utils'
import { Tip } from '@/components/ui/tooltip'

// One collapsible check (title + count badge). Most sections list member rows; "multi-post" gets its own list and
// "duplicates" only links to Fratries → Doublons (the merge happens there).
function Section({ s }: { s: DataQualitySection }) {
  const [open, setOpen] = useState(false)
  const clear = useClearBounce()
  const ok = s.total === 0
  const isDuplicates = s.key === 'duplicates'

  // "Réactiver" deletes the bounce record so the email outbox sends to that address again.
  const reactivate = async (id: string) => {
    try {
      await clear.mutateAsync(id)
      toast.success('Adresse réactivée : les emails lui seront de nouveau envoyés')
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* Header row: the toggle button and the "Doublons" link are siblings (never nest a link in a button). */}
        <div className="flex items-center gap-3 pr-4">
        <button
          type="button"
          disabled={(ok && !s.confirmed?.length) || isDuplicates}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left disabled:cursor-default"
        >
          {ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
            : isDuplicates ? <span className="w-5" />
            : open ? <ChevronDown className="h-5 w-5 shrink-0" /> : <ChevronRight className="h-5 w-5 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 font-medium">
              {s.title}
              <Badge variant={ok ? 'success' : 'warning'}>
                {s.total}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{s.hint}</p>
          </div>
        </button>
          {isDuplicates && s.total > 0 && (
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link to="/admin/siblings?tab=duplicates"><ExternalLink className="mr-1 h-4 w-4" />Doublons</Link>
            </Button>
          )}
        </div>

        {open && s.key === 'multi-post' && <MultiPostList s={s} />}

        {open && s.key !== 'multi-post' && s.items.length > 0 && (
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2">Membre</th>
                  <th className="px-4 py-2">Unité</th>
                  <th className="px-4 py-2">Problème</th>
                  {s.key === 'bounced-email' && <th className="px-4 py-2 text-right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {s.items.map((it, i) => (
                  <tr key={`${it.memberId ?? it.name}-${i}`} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">
                      {it.memberId
                        ? <Link to={`/members/${it.memberId}`} className="text-primary hover:underline">{it.name}</Link>
                        : it.name}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{it.unit ?? '—'}</td>
                    <td className="px-4 py-2">{it.detail}</td>
                    {s.key === 'bounced-email' && (
                      <td className="px-4 py-2 text-right">
                        {it.bounceId && (
                          <Button variant="outline" size="sm" disabled={clear.isPending} onClick={() => reactivate(it.bounceId!)}>
                            <RotateCcw className="mr-1 h-4 w-4" />Réactiver
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {s.total > s.items.length && (
              <p className="px-4 py-2 text-xs text-muted-foreground">Seules les {s.items.length} premières lignes sont affichées.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Several active posts: each post can be closed here (today), or the whole case confirmed "C'est voulu" (e.g. a chef
// de groupe who is also chef d'unité elsewhere) — it then moves to "Confirmés" until those posts change.

// List for the "Plusieurs postes actifs" check, plus the collapsible "Confirmés comme voulus" sub-list.
function MultiPostList({ s }: { s: DataQualitySection }) {
  const ack = useAcknowledgeDataQuality()
  const unack = useRemoveDataQualityAck()
  const endPost = useEndAssignment()
  const [closing, setClosing] = useState<{ item: DataQualityItem; assignmentId: string; label: string } | null>(null)
  const [showConfirmed, setShowConfirmed] = useState(false)
  const confirmed = s.confirmed ?? []

  const confirm = async (it: DataQualityItem) => {
    try { await ack.mutateAsync({ checkKey: s.key, memberId: it.memberId! }); toast.success('Cas confirmé : il ne sera plus signalé tant que ses postes ne changent pas') }
    catch (e) { toast.error(parseApiError(e)) }
  }
  const undo = async (it: DataQualityItem) => {
    try { await unack.mutateAsync({ checkKey: s.key, memberId: it.memberId! }); toast.success('Confirmation annulée') }
    catch (e) { toast.error(parseApiError(e)) }
  }
  const close = async () => {
    if (!closing) return
    try { await endPost.mutateAsync({ id: closing.assignmentId, endDate: todayIso() }); toast.success('Poste clôturé'); setClosing(null) }
    catch (e) { toast.error(parseApiError(e)) }
  }

  const row = (it: DataQualityItem, isConfirmed: boolean) => (
    <div key={it.memberId} className="flex flex-col gap-2 border-b px-4 py-2.5 last:border-0 sm:flex-row sm:items-center">
      <div className="min-w-0 sm:w-56">
        <Link to={`/members/${it.memberId}`} className="font-medium text-primary hover:underline">{it.name}</Link>
        {isConfirmed && <p className="text-xs text-muted-foreground">Voulu{it.ackBy ? ` — ${it.ackBy}` : ''}</p>}
      </div>
      <div className="flex flex-1 flex-wrap gap-1.5">
        {(it.posts ?? []).map(p => (
          <span key={p.assignmentId} className="inline-flex items-center gap-1 rounded-md border bg-card py-0.5 pl-2 pr-0.5 text-xs">
            {p.isMaitrise && <Crown className="h-3 w-3 text-amber-500" />}{p.label}
            {!isConfirmed && (
              <Tip content="Clôturer ce poste aujourd'hui">
                <button type="button" aria-label={`Clôturer le poste ${p.label}`} className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setClosing({ item: it, assignmentId: p.assignmentId, label: p.label })}><X className="h-3.5 w-3.5" /></button>
              </Tip>
            )}
          </span>
        ))}
      </div>
      {isConfirmed
        ? <Button size="sm" variant="ghost" disabled={unack.isPending} onClick={() => undo(it)}><Undo2 className="mr-1 h-3.5 w-3.5" />Annuler</Button>
        : <Button size="sm" variant="outline" disabled={ack.isPending} onClick={() => confirm(it)}><Check className="mr-1 h-3.5 w-3.5" />C'est voulu</Button>}
    </div>
  )

  return (
    <div className="border-t">
      {s.items.map(it => row(it, false))}
      {s.items.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Rien à corriger.</p>}
      {confirmed.length > 0 && (
        <div className="border-t bg-muted/20">
          <button type="button" onClick={() => setShowConfirmed(v => !v)} className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-muted-foreground">
            {showConfirmed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Confirmés comme voulus ({confirmed.length})
          </button>
          {showConfirmed && confirmed.map(it => row(it, true))}
        </div>
      )}
      <ConfirmDialog
        open={!!closing}
        onOpenChange={o => { if (!o) setClosing(null) }}
        title="Clôturer le poste ?"
        description={closing ? `Le poste « ${closing.label} » de ${closing.item.name} sera clôturé aujourd'hui. Ses autres postes restent actifs.` : ''}
        confirmLabel="Clôturer"
        variant="destructive"
        loading={endPost.isPending}
        onConfirm={close}
      />
    </div>
  )
}

// Route /admin/data-quality (maitrise.manage). One GET /data-quality report; issues = sum of every section's total.
export default function DataQualityPage() {
  const { data, isLoading, isError } = useDataQuality()
  const issues = data?.sections.reduce((n, s) => n + s.total, 0) ?? 0

  return (
    <Page>
      <PageHeader
        title="Qualité des données"
        icon={ShieldCheck}
        description={data
          ? `${data.activeMembers} membres actifs vérifiés · ${issues} point(s) à corriger — ouvrez une ligne pour le détail.`
          : 'Ce qui doit être corrigé dans les fiches des membres actifs.'}
      />
      {isLoading ? <LoadingSpinner />
        : isError || !data ? <EmptyState icon={ShieldCheck} title="Impossible de charger le rapport" />
        : (
          <div className="space-y-3">
            {data.sections.map((s) => <Section key={s.key} s={s} />)}
          </div>
        )}
    </Page>
  )
}
