import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Users, X, Sparkles, ChevronRight, Phone, Mail, MapPin, UserRound, GitMerge, Copy, Flag, Check } from 'lucide-react'
import {
  useSiblingSuggestions, useSiblingGroups,
  useRejectSiblingSuggestion, useUnlinkSibling,
  useDuplicateSuggestions, useMergeMembers, useRejectDuplicateMembers, useMembersForMerge, DUPLICATE_MATCH_KEYS,
  useSiblingReports, useResolveSiblingReport, useReplySiblingReport,
  type SiblingSuggestion,
  type DuplicateGroup, type DuplicateMember, type MemberMergeFields,
  type SiblingReport,
} from '@/services/sibling-service'
import { SiblingReconcileSheet } from '@/components/members/sibling-reconcile-sheet'
import { MemberPickerDialog } from '@/components/shared/member-picker-dialog'

// Clicking a member on the Fratries page opens their fiche directly on the Contact & famille tab (what a CG
// needs when reconciling siblings), in the SAME tab, and carries a `from` so the fiche shows a "Retour" button
// back to this page on the SAME sibling tab. (Was: open in a new tab — the back button is friendlier here.)
const memberLink = (id: string | undefined, fromTab: string) => ({
  to: `/members/${id}?tab=famille`,
  state: { from: `/admin/siblings?tab=${fromTab}`, fromLabel: 'Fratries' },
})
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { SearchInput } from '@/components/shared/search-input'
import { Callout } from '@/components/shared/callout'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tip } from '@/components/ui/tooltip'
import { parseApiError } from '@/lib/error-utils'
import { computeAge, formatDate, formatDateLong } from '@/lib/utils'
import { useDebounce } from '@/hooks/use-debounce'
import { toast } from 'sonner'

// CG-only page (perm maitrise.manage): identify + confirm fratries. Two tabs —
//  • Suggestions : families the matching engine proposes (shared parent / phone / email / name+address). The CG
//    reviews each (picking the canonical père/mère/adresse → the data is reconciled onto all siblings) or rejects.
//  • Fratries confirmées : the confirmed groups, with per-member unlink.
export default function SiblingsPage() {
  // The active tab lives in the URL (?tab=…) so opening a member's file and hitting the browser Back button
  // returns to the SAME tab (e.g. Doublons) instead of resetting to Suggestions. replace:true keeps each tab
  // switch out of the history stack (Back doesn't cycle through tabs).
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') ?? 'suggestions'
  const setTab = (v: string) => setSearchParams(prev => { prev.set('tab', v); return prev }, { replace: true })

  return (
    <Page>
      <PageHeader
        title="Fratries"
        icon={Users}
        description="Identifier et confirmer les frères et sœurs, puis harmoniser les informations de la famille."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
          <TabsTrigger value="confirmed">Fratries confirmées</TabsTrigger>
          <TabsTrigger value="reports"><ReportsTabLabel /></TabsTrigger>
          <TabsTrigger value="duplicates">Doublons</TabsTrigger>
        </TabsList>
        <TabsContent value="suggestions" className="mt-4"><SuggestionsTab /></TabsContent>
        <TabsContent value="confirmed" className="mt-4"><ConfirmedTab /></TabsContent>
        <TabsContent value="reports" className="mt-4"><ReportsTab /></TabsContent>
        <TabsContent value="duplicates" className="mt-4"><DuplicatesTab /></TabsContent>
      </Tabs>
    </Page>
  )
}

// Accent- + case-insensitive key for the client-side search boxes (Suggestions / Doublons are loaded in full,
// so filtering happens on the client — "rhea" matches "Rhéa", "hadad" matches "Haddad").
const searchKey = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Categorize an evidence string into an icon so "what they have in common" reads at a glance.
function evidenceIcon(e: string) {
  if (e.startsWith('Parent commun')) return UserRound
  if (e.startsWith('Même téléphone')) return Phone
  if (e.startsWith('Même email')) return Mail
  return MapPin
}

// ── Suggestions ──
function SuggestionsTab() {
  const { data, isLoading } = useSiblingSuggestions()
  // total = the REAL number of probable families still to review (uncapped); items = the loaded page of them.
  const suggestions = data?.items ?? []
  const total = data?.total ?? 0
  const reject = useRejectSiblingSuggestion()
  const [rejecting, setRejecting] = useState<SiblingSuggestion | null>(null)
  const [reviewing, setReviewing] = useState<SiblingSuggestion | null>(null)
  const [search, setSearch] = useState('')

  const doReject = async () => {
    if (!rejecting) return
    try {
      await reject.mutateAsync(rejecting.members.map((m) => m.memberId))
      toast.success('Suggestion rejetée')
      setRejecting(null)
    } catch (e) { toast.error(parseApiError(e)) }
  }

  // Client-side filter (only the loaded page is filtered): matches any member's name/unit or the shared evidence.
  const term = searchKey(search.trim())
  const filtered = term
    ? suggestions.filter((s) =>
        s.members.some((m) => searchKey(`${m.firstName} ${m.lastName} ${m.unitName ?? ''}`).includes(term))
        || s.evidence.some((e) => searchKey(e).includes(term)))
    : suggestions
  // The server caps the detailed list — say so when there are more families than are shown.
  const capped = total > suggestions.length
  const empty = !isLoading && (!data || suggestions.length === 0)

  return (
    <>
      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : empty ? (
        <EmptyState icon={Sparkles} title="Aucune suggestion" description="Aucune fratrie probable à examiner pour le moment." />
      ) : (
        <>
          <SearchInput className="mb-3 max-w-sm" placeholder="Rechercher un nom, une unité…" value={search} onChange={setSearch} />
          <p className="mb-3 text-sm text-muted-foreground">
            {term
              ? `${filtered.length} résultat(s) sur ${total} famille(s) probable(s) à examiner.`
              : `${total} famille(s) probable(s) à examiner${capped ? ` (les ${suggestions.length} premières sont affichées)` : ''}.`}
            {' '}Cliquez sur une famille pour ouvrir ses informations communes (parents, adresses, contacts) sur le côté et la confirmer.
          </p>
          {filtered.length === 0 ? (
            <EmptyState icon={Sparkles} title="Aucun résultat" description="Aucune fratrie probable ne correspond à votre recherche." />
          ) : (
            <div className="space-y-3">
              {filtered.map((s, i) => <SuggestionRow key={i} suggestion={s} onReview={() => setReviewing(s)} onReject={() => setRejecting(s)} />)}
            </div>
          )}
        </>
      )}

      {/* Details open in a right-side drawer (keeps the list compact). Keyed so it remounts per family. */}
      {reviewing && <SiblingReconcileSheet key={reviewing.members[0]?.memberId ?? ''} memberIds={reviewing.members.map((m) => m.memberId)} onClose={() => setReviewing(null)} />}

      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={(o) => !o && setRejecting(null)}
        title="Rejeter cette suggestion ?"
        description="Ces membres ne seront plus proposés comme fratrie. Vous pourrez toujours les lier manuellement plus tard."
        confirmLabel="Rejeter"
        onConfirm={doReject}
        loading={reject.isPending}
      />
    </>
  )
}

// Compact suggestion row — click anywhere to open the family's shared "common information" in a side sheet.
// Rejeter stays reachable without opening (stopPropagation so it doesn't also open the sheet).
function SuggestionRow({ suggestion, onReview, onReject }: { suggestion: SiblingSuggestion; onReview: () => void; onReject: () => void }) {
  // The raw evidence repeats one entry per matching pair ("Même email parent" ×3, etc.) → dedupe to distinct types.
  const distinctEvidence = Array.from(new Map(suggestion.evidence.map((e) => [e.split(' : ')[0], e])).values())
  return (
    <Card className="cursor-pointer transition-all duration-200 hover:border-primary/40 hover:bg-muted/20 hover:shadow-lg motion-safe:hover:-translate-y-0.5" onClick={onReview}>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge variant={suggestion.confidence === 'Élevée' ? 'success' : 'warning'}>
              Confiance {suggestion.confidence.toLowerCase()}
            </Badge>
            <span className="text-xs text-muted-foreground">{suggestion.members.length} enfants probables</span>
            {/* One-line "why": DISTINCT shared signals (deduped), rendered as a light inline list (not pills). */}
            {distinctEvidence.length > 0 && (
              <>
                <span className="hidden h-3.5 w-px bg-border sm:block" aria-hidden />
                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
                  {distinctEvidence.map((e, j) => {
                    const Icon = evidenceIcon(e)
                    return (
                      <span key={j} className="inline-flex items-center gap-1">
                        <Icon className="h-3 w-3 text-primary/60" />{e.split(' : ')[0]}
                      </span>
                    )
                  })}
                </span>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestion.members.map((m) => {
              const age = computeAge(m.dateOfBirth)
              return (
                <span key={m.memberId} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-1 pr-2.5 text-sm">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {(m.firstName[0] ?? '').toUpperCase()}
                  </span>
                  <span className="font-medium">{m.firstName} {m.lastName}</span>
                  <span className="text-xs text-muted-foreground">{m.unitCode ?? 'Sans unité'}{age != null ? ` · ${age} ans` : ''}</span>
                  {m.siblingGroupId && <Badge variant="success" className="px-1.5 py-0 text-[10px] font-medium">déjà en fratrie</Badge>}
                </span>
              )
            })}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onReject() }}><X className="mr-1 h-4 w-4" />Rejeter</Button>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  )
}

// ── Confirmed fratries ──
function ConfirmedTab() {
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 350)
  const { data: groups, isLoading } = useSiblingGroups(debounced)
  const unlink = useUnlinkSibling()
  const [unlinkTarget, setUnlinkTarget] = useState<{ id: string; name: string } | null>(null)

  const doUnlink = async () => {
    if (!unlinkTarget) return
    try { await unlink.mutateAsync(unlinkTarget.id); toast.success('Membre retiré de la fratrie'); setUnlinkTarget(null) }
    catch (e) { toast.error(parseApiError(e)) }
  }

  const shown = groups ?? []

  return (
    <>
      <SearchInput className="mb-3 max-w-sm" placeholder="Rechercher un membre…" value={search} onChange={setSearch} />

      {isLoading ? <LoadingSpinner variant="table" />
        : shown.length === 0
          ? <EmptyState icon={Users} title="Aucune fratrie confirmée"
              description="Confirmez des suggestions ou liez des membres manuellement depuis leur fiche." />
          : (
            <div className="space-y-3">
              {shown.map((g) => (
                <Card key={g.groupId}>
                  <CardContent className="flex flex-wrap items-center gap-2 p-4">
                    {g.members.map((m) => (
                      <span key={m.memberId} className="flex items-center gap-1 rounded-full border bg-muted/40 py-1 pl-3 pr-1 text-sm">
                        <Link {...memberLink(m.memberId, 'confirmed')} className="font-medium hover:underline">{m.firstName} {m.lastName}</Link>
                        <span className="text-xs text-muted-foreground">· {m.unitCode ?? 'Sans unité'}</span>
                        <Tip content="Retirer de la fratrie">
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => setUnlinkTarget({ id: m.memberId, name: `${m.firstName} ${m.lastName}` })}
                            aria-label={`Retirer ${m.firstName} ${m.lastName} de la fratrie`}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </Tip>
                      </span>
                    ))}
                    <Tip content="Ouvrir la fiche">
                      <Link {...memberLink(g.members[0]?.memberId, 'confirmed')}
                        className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Ouvrir la fiche">
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Tip>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

      <ConfirmDialog
        open={!!unlinkTarget}
        onOpenChange={(o) => !o && setUnlinkTarget(null)}
        title="Retirer de la fratrie ?"
        description={`${unlinkTarget?.name ?? ''} ne sera plus lié(e). Si la fratrie ne compte plus qu'un membre, elle est dissoute.`}
        confirmLabel="Retirer"
        onConfirm={doUnlink}
        loading={unlink.isPending}
        variant="destructive"
      />
    </>
  )
}

// ── Signalements de fratrie (member-filed error reports → CG worklist) ──
const REPORT_KIND_LABELS: Record<string, string> = {
  missing: 'Il manque un frère/sœur',
  wrong: "Une personne n'est pas de la fratrie",
  other: 'Autre',
}

// The tab label carries a pending-count badge so the CG sees new reports at a glance.
function ReportsTabLabel() {
  const { data } = useSiblingReports(false)
  const n = data?.length ?? 0
  return (
    <span className="flex items-center gap-1.5">
      Signalements
      {n > 0 && <Badge variant="warning" className="h-5 min-w-5 justify-center px-1 text-[11px]">{n}</Badge>}
    </span>
  )
}

function ReportsTab() {
  const [includeResolved, setIncludeResolved] = useState(false)
  const { data: reports, isLoading } = useSiblingReports(includeResolved)
  const resolve = useResolveSiblingReport()
  const reply = useReplySiblingReport()
  // "Répondre" dialog: send the reporter a message (bell/push) — this also marks the report resolved.
  const [replyTarget, setReplyTarget] = useState<SiblingReport | null>(null)
  const [replyText, setReplyText] = useState('')

  const doResolve = async (r: SiblingReport, on: boolean) => {
    try { await resolve.mutateAsync({ id: r.id, resolve: on }); toast.success(on ? 'Signalement résolu' : 'Signalement rouvert') }
    catch (e) { toast.error(parseApiError(e)) }
  }

  const doReply = async () => {
    if (!replyTarget || !replyText.trim()) return
    try {
      await reply.mutateAsync({ id: replyTarget.id, message: replyText.trim() })
      toast.success('Réponse envoyée au membre')
      setReplyTarget(null); setReplyText('')
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Signalements des membres sur leur fratrie (frère/sœur manquant, erreur…). Corrigez via « Fratries confirmées » ou la fiche du membre, puis marquez comme résolu.
        </p>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-sm">
          <input type="checkbox" checked={includeResolved} onChange={(e) => setIncludeResolved(e.target.checked)} className="h-4 w-4 rounded" />
          Voir les résolus
        </label>
      </div>

      {isLoading ? <LoadingSpinner variant="table" />
        : !reports || reports.length === 0
          ? <EmptyState icon={Flag} title="Aucun signalement" description="Les membres n'ont signalé aucune erreur de fratrie." />
          : (
            <div className="space-y-2">
              {reports.map((r) => (
                <Card key={r.id} className={r.status === 'Resolved' ? 'opacity-70' : 'border-amber-300 dark:border-amber-800'}>
                  <CardContent className="flex items-start gap-3 p-4">
                    <Flag className={`mt-0.5 h-4 w-4 shrink-0 ${r.status === 'Resolved' ? 'text-muted-foreground' : 'text-amber-500'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <Link {...memberLink(r.reporterMemberId, 'reports')} className="font-medium hover:underline">{r.reporterName || 'Membre'}</Link>
                        <span className="text-xs text-muted-foreground">· {r.reporterUnit ?? 'Sans unité'}</span>
                        <Badge variant="secondary" className="text-[11px]">{REPORT_KIND_LABELS[r.kind] ?? r.kind}</Badge>
                        {r.status === 'Resolved' && <Badge variant="success" className="text-[11px]">Résolu</Badge>}
                      </div>
                      {r.note && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{r.note}</p>}
                      {r.replyMessage && (
                        <Callout tone="muted" className="mt-1.5 p-2.5">
                          <p className="whitespace-pre-line"><span className="font-medium text-primary">Votre réponse : </span>{r.replyMessage}</p>
                        </Callout>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">{formatDateLong(r.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => { setReplyTarget(r); setReplyText(r.replyMessage ?? '') }}>
                        <Mail className="mr-1 h-4 w-4" />Répondre
                      </Button>
                      {r.status === 'Resolved'
                        ? <Button size="sm" variant="ghost" onClick={() => doResolve(r, false)} disabled={resolve.isPending}>Rouvrir</Button>
                        : <Button size="sm" variant="ghost" onClick={() => doResolve(r, true)} disabled={resolve.isPending}><Check className="mr-1 h-4 w-4" />Résolu</Button>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

      <Dialog open={!!replyTarget} onOpenChange={(o) => { if (!o) { setReplyTarget(null); setReplyText('') } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Répondre au signalement</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Votre message sera envoyé à {replyTarget?.reporterName || 'ce membre'} (notification dans l'application, et sur son téléphone s'il a activé les notifications). Le signalement sera marqué résolu.
          </p>
          {replyTarget?.note && (
            <Callout tone="muted"><p className="whitespace-pre-line">« {replyTarget.note} »</p></Callout>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="sibling-report-reply">Votre réponse</Label>
            <Textarea
              id="sibling-report-reply"
              className="min-h-24"
              placeholder="Votre réponse au membre…"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              maxLength={2000}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReplyTarget(null); setReplyText('') }}>Annuler</Button>
            <Button onClick={doReply} disabled={reply.isPending || !replyText.trim()}>
              <Mail className="mr-1 h-4 w-4" />{reply.isPending ? 'Envoi…' : 'Envoyer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Doublons (duplicate members: members sharing the selected criteria = likely the same person twice) ──
function DuplicatesTab() {
  // Configurable match criteria (default = Nom + Prénom — DOB left off so import duplicates with a missing/
  // wrong birth date still surface; the CG confirms via the richer per-member info below). A member is grouped
  // with another only when they share ALL the checked fields.
  const [keys, setKeys] = useState<string[]>(['lastName', 'firstName'])
  const { data: groups, isLoading } = useDuplicateSuggestions(keys)
  const [merging, setMerging] = useState<DuplicateGroup | null>(null)
  const [search, setSearch] = useState('')
  // "Ce ne sont pas des doublons" — tombstones the group's pairs so it's not re-flagged.
  const notDup = useRejectDuplicateMembers()
  const [rejecting, setRejecting] = useState<DuplicateGroup | null>(null)

  // Manual "merge any two members": pick two arbitrary members (not from the auto-detected list) and feed the
  // same MergeDialog. mergeData is fetched only when two distinct members are chosen.
  const [mmA, setMmA] = useState<{ id: string; name: string } | null>(null)
  const [mmB, setMmB] = useState<{ id: string; name: string } | null>(null)
  const [pickerFor, setPickerFor] = useState<'a' | 'b' | null>(null)
  const sameMember = !!(mmA && mmB && mmA.id === mmB.id)
  const { data: mergeData } = useMembersForMerge([mmA?.id ?? '', mmB?.id ?? ''])
  const canManualMerge = !!(mmA && mmB && !sameMember && mergeData && mergeData.length === 2)
  const openManualMerge = () => { if (mergeData && mergeData.length === 2) setMerging({ members: mergeData, evidence: 'Fusion manuelle' }) }

  const toggleKey = (k: string) => setKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))

  const doReject = async () => {
    if (!rejecting) return
    try {
      await notDup.mutateAsync(rejecting.members.map((m) => m.memberId))
      toast.success('Marqués comme non-doublons')
      setRejecting(null)
    } catch (e) { toast.error(parseApiError(e)) }
  }

  // Config bar: pick which fields must match. Kept above the results so it's clear what drives the list.
  const configBar = (
    <div className="mb-3 rounded-md border bg-muted/20 p-3">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">Critères de détection — les membres doivent partager TOUS les champs cochés</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {DUPLICATE_MATCH_KEYS.map((k) => (
          <label key={k.key} className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input type="checkbox" checked={keys.includes(k.key)} onChange={() => toggleKey(k.key)} className="h-4 w-4 rounded" />
            {k.label}
          </label>
        ))}
      </div>
      {keys.length === 0 && <p className="mt-1.5 text-xs text-warning">Cochez au moins un critère (sinon les critères par défaut nom + prénom + date de naissance sont utilisés).</p>}
    </div>
  )

  // Manual merge panel + the shared MergeDialog + member picker. Rendered in every branch (loading / empty /
  // results) so you can merge any two members even when nothing is auto-detected.
  const manualSection = (
    <>
      <Card className="mb-4 border-primary/30">
        <CardContent className="space-y-3 p-4">
          <div>
            <p className="text-sm font-semibold">Fusionner deux membres</p>
            <p className="text-xs text-muted-foreground">
              Sélectionnez deux membres à fusionner, même s'ils ne sont pas détectés automatiquement ci-dessous. Vous
              choisirez ensuite le membre à conserver et, pour chaque champ qui diffère, la valeur à garder. Les téléphones,
              emails et adresses des deux fiches sont conservés (les doublons exacts sont supprimés).
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {([['Membre 1', mmA, () => setPickerFor('a'), () => setMmA(null)], ['Membre 2', mmB, () => setPickerFor('b'), () => setMmB(null)]] as const).map(([label, val, pick, clear]) => (
              <div key={label} className="flex items-center gap-2 rounded-md border p-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                  {val ? <p className="truncate text-sm font-medium">{val.name}</p> : <p className="text-sm text-muted-foreground">Aucun membre choisi</p>}
                </div>
                {val && <Tip content="Retirer"><Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={clear} aria-label={`Retirer ${val.name}`}><X className="h-4 w-4" /></Button></Tip>}
                <Button size="sm" variant="outline" className="shrink-0" onClick={pick}>{val ? 'Changer' : 'Choisir'}</Button>
              </div>
            ))}
          </div>
          {sameMember && <p className="text-xs text-warning">Choisissez deux membres différents.</p>}
          <Button size="sm" disabled={!canManualMerge} onClick={openManualMerge}><GitMerge className="mr-1 h-4 w-4" />Fusionner ces deux membres</Button>
        </CardContent>
      </Card>
      <MemberPickerDialog open={pickerFor !== null} onOpenChange={(o) => !o && setPickerFor(null)}
        title="Choisir un membre à fusionner" description="Recherchez le membre par nom."
        onPick={(m) => { if (pickerFor === 'a') setMmA(m); else if (pickerFor === 'b') setMmB(m); setPickerFor(null) }} />
      {merging && <MergeDialog group={merging} onClose={() => setMerging(null)} />}
    </>
  )

  if (isLoading) return <>{manualSection}{configBar}<LoadingSpinner variant="table" /></>
  if (!groups || groups.length === 0)
    return <>{manualSection}{configBar}<EmptyState icon={Copy} title="Aucun doublon" description="Aucun membre partageant tous les critères sélectionnés n'a été détecté." /></>

  // Client-side filter by any member's name in the group.
  const term = searchKey(search.trim())
  const filtered = term
    ? groups.filter((g) => g.members.some((m) => searchKey(`${m.firstName} ${m.lastName}`).includes(term)))
    : groups

  const searchBar = (
    <SearchInput className="mb-3 max-w-sm" placeholder="Rechercher un nom…" value={search} onChange={setSearch} />
  )

  return (
    <>
      {manualSection}
      {configBar}
      {searchBar}
      {filtered.length === 0 ? (
        <EmptyState icon={Copy} title="Aucun résultat" description="Aucun doublon ne correspond à votre recherche." />
      ) : (
      <>
      <p className="mb-3 text-sm text-muted-foreground">
        {filtered.length} doublon(s) probable(s){term ? ` sur ${groups.length}` : ''}. Fusionnez pour n'en garder qu'un (les affectations, documents,
        contacts… du doublon sont transférés vers le membre conservé, qui est ensuite placé dans la Corbeille et
        restaurable).
      </p>
      <div className="space-y-3">
        {filtered.map((g, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Copy className="h-3.5 w-3.5" />{g.evidence}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setRejecting(g)}><X className="mr-1 h-4 w-4" />Ce ne sont pas des doublons</Button>
                  <Button size="sm" onClick={() => setMerging(g)}><GitMerge className="mr-1 h-4 w-4" />Fusionner</Button>
                </div>
              </div>
              {/* Richer per-member info so the CG can decide if these really are the same person (same-name people
                  aren't always duplicates). DOB/matricule/n° carte/école/unité/statut/nb d'affectations. */}
              <div className="grid gap-2 sm:grid-cols-2">
                {g.members.map((m) => {
                  const age = computeAge(m.dateOfBirth)
                  const bits = [
                    m.dateOfBirth ? `${formatDate(m.dateOfBirth)}${age != null ? ` (${age} ans)` : ''}` : 'Naissance ?',
                    m.gender ? m.gender[0] : null,
                    m.cardNumber ? `Mat. ${m.cardNumber}` : null,
                    m.externalCardNumber ? `N° ${m.externalCardNumber}` : null,
                    m.school,
                    m.classe,
                    m.unitCode ?? 'Sans unité',
                    m.isActiveMember ? 'actif' : 'ancien',
                    m.hasAccount ? 'compte' : null,
                    `${m.assignmentCount} affect.`,
                  ].filter(Boolean) as string[]
                  return (
                    <div key={m.memberId} className="rounded-md border bg-muted/20 p-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{(m.firstName[0] ?? '').toUpperCase()}</span>
                        <Link {...memberLink(m.memberId, 'duplicates')} className="truncate font-medium hover:underline">{m.firstName} {m.lastName}</Link>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {bits.map((b, k) => <span key={k}>{b}</span>)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      </>
      )}

      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={(o) => !o && setRejecting(null)}
        title="Ce ne sont pas des doublons ?"
        description="Ces membres ne seront plus signalés comme doublons (ce sont des personnes différentes). Vous pourrez toujours les fusionner manuellement plus tard si besoin."
        confirmLabel="Confirmer"
        onConfirm={doReject}
        loading={notDup.isPending}
      />
    </>
  )
}

// Fields the CG can choose from when merging (label + accessor). The internal matricule is intentionally absent —
// the keeper always keeps its own. Order = most likely to differ / matter first.
const MERGE_FIELDS: { key: keyof MemberMergeFields; label: string; get: (m: DuplicateMember) => string | null }[] = [
  { key: 'username', label: 'Identifiant de connexion', get: (m) => m.username },
  { key: 'externalCardNumber', label: 'N° de carte (SDL/GDL)', get: (m) => m.externalCardNumber },
  { key: 'firstName', label: 'Prénom', get: (m) => m.firstName },
  { key: 'lastName', label: 'Nom', get: (m) => m.lastName },
  { key: 'dateOfBirth', label: 'Date de naissance', get: (m) => m.dateOfBirth },
  { key: 'gender', label: 'Sexe', get: (m) => m.gender },
  { key: 'nationality', label: 'Nationalité', get: (m) => m.nationality },
  { key: 'bloodType', label: 'Groupe sanguin', get: (m) => m.bloodType },
  { key: 'school', label: 'École', get: (m) => m.school },
  { key: 'classe', label: 'Classe', get: (m) => m.classe },
  { key: 'section', label: 'Section', get: (m) => m.section },
  { key: 'professionDomain', label: 'Domaine pro.', get: (m) => m.professionDomain },
  { key: 'profession', label: 'Profession', get: (m) => m.profession },
  { key: 'primaryContactEmail', label: 'Email de contact', get: (m) => m.primaryContactEmail },
  { key: 'medicalNotes', label: 'Médical', get: (m) => m.medicalNotes },
  { key: 'allergies', label: 'Allergies', get: (m) => m.allergies },
  { key: 'notes', label: 'Notes', get: (m) => m.notes },
  { key: 'photoPath', label: 'Photo', get: (m) => m.photoPath },
]

const norm = (v: string | null) => (v ?? '').trim()
// Fields that stay with the kept file even when a demande file wins the data: the login, the official card number, the photo.
const KEEPER_OWNED = new Set<keyof MemberMergeFields>(['username', 'externalCardNumber', 'photoPath'])

// Merge dialog: pick the member to KEEP + for each field that differs, which value wins. Everything from the
// other members is transferred onto the keeper; they're then soft-deleted (Corbeille).
function MergeDialog({ group, onClose }: { group: DuplicateGroup; onClose: () => void }) {
  const merge = useMergeMembers()
  const members = group.members
  // A child re-enrolled through a demande (file created by « Envoyer les réponses ») next to their older file: keep the
  // OLDER file by default (history, matricule, the identifiant the family already had) but take the demande's data —
  // the family's latest — for every field that differs, except the login, the SDL/GDL card number and the photo.
  const demandeMember = members.filter((m) => m.fromDemande).length === 1 ? members.find((m) => m.fromDemande) : undefined
  const [keeperId, setKeeperId] = useState(
    demandeMember ? (members.find((m) => !m.fromDemande) ?? members[0]).memberId : members[0].memberId)
  // Per field, which member's value to use (memberId). Defaults computed from the keeper below.
  const [choices, setChoices] = useState<Record<string, string>>({})

  // Default each field's source: the demande file when there is one (except the keeper-owned fields), else the
  // keeper if it has a value, else the first member that does. Recomputed (render-phase reset) whenever the keeper
  // changes — React's derive-from-props pattern keyed on keeperId.
  const [seededKeeper, setSeededKeeper] = useState<string | null>(null)
  if (seededKeeper !== keeperId) {
    setSeededKeeper(keeperId)
    const keeper = members.find((m) => m.memberId === keeperId)!
    const next: Record<string, string> = {}
    for (const f of MERGE_FIELDS) {
      const withValue = members.find((m) => norm(f.get(m)))
      const demandeWins = demandeMember && !KEEPER_OWNED.has(f.key) && norm(f.get(demandeMember))
      next[f.key] = demandeWins ? demandeMember.memberId
        : norm(f.get(keeper)) ? keeperId : (withValue?.memberId ?? keeperId)
    }
    setChoices(next)
  }

  // Only fields where members actually DIFFER (distinct non-empty values, or one has a value another lacks) get a picker.
  const differingFields = MERGE_FIELDS.filter((f) => {
    const vals = members.map((m) => norm(f.get(m)))
    const distinct = new Set(vals.filter(Boolean))
    return distinct.size > 1 || (distinct.size === 1 && vals.some((v) => !v))
  })

  const submit = async () => {
    const keeper = members.find((m) => m.memberId === keeperId)!
    // Build the final field set: each field = the chosen member's value (falling back to keeper's).
    const fields = {} as Record<keyof MemberMergeFields, string | null>
    for (const f of MERGE_FIELDS) {
      const src = members.find((m) => m.memberId === (choices[f.key] ?? keeperId)) ?? keeper
      fields[f.key] = f.get(src) ?? null
    }
    try {
      const r = await merge.mutateAsync({ keeperId, loserIds: members.filter((m) => m.memberId !== keeperId).map((m) => m.memberId), fields })
      toast.success(`Fusion effectuée — ${r.merged} doublon(s) placé(s) dans la Corbeille`)
      onClose()
    } catch (e) { toast.error(parseApiError(e)) }
  }

  const nameOf = (id: string) => { const m = members.find((x) => x.memberId === id); return m ? `${m.firstName} ${m.lastName}` : '' }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Fusionner les doublons</DialogTitle></DialogHeader>
        <div className="space-y-5">
          {/* Choose the keeper */}
          <section>
            <p className="mb-2 text-sm font-semibold">Membre à conserver</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {members.map((m) => {
                const on = keeperId === m.memberId
                const age = computeAge(m.dateOfBirth)
                return (
                  <label key={m.memberId} className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${on ? 'border-primary/50 bg-primary/5' : ''}`}>
                    <input type="radio" checked={on} onChange={() => setKeeperId(m.memberId)} className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.firstName} {m.lastName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {m.unitCode ?? 'Sans unité'}{age != null ? ` · ${age} ans` : ''}{m.isActiveMember ? ' · actif' : ' · ancien'}
                        {m.hasAccount ? ' · compte' : ''}{m.cardNumber ? ` · ${m.cardNumber}` : ''}{m.fromDemande ? ' · Inscription' : ''}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </section>

          {/* Per-field value choice (only where they differ) */}
          {differingFields.length > 0 ? (
            <section>
              <p className="mb-2 text-sm font-semibold">Valeurs à conserver <span className="font-normal text-muted-foreground">— pour les champs qui diffèrent</span></p>
              <div className="space-y-2.5">
                {differingFields.map((f) => (
                  <div key={f.key} className="rounded-md border p-2.5">
                    <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{f.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {members.map((m) => {
                        const v = norm(f.get(m))
                        const on = (choices[f.key] ?? keeperId) === m.memberId
                        return (
                          <button key={m.memberId} type="button"
                            onClick={() => setChoices((prev) => ({ ...prev, [f.key]: m.memberId }))}
                            className={`rounded-md border px-2.5 py-1 text-left text-xs transition-colors ${on ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-muted'}`}>
                            <span className="block max-w-[16rem] truncate">{v || <span className="italic text-muted-foreground">(vide)</span>}</span>
                            <span className="block text-[10px] text-muted-foreground">{nameOf(m.memberId)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <Callout tone="muted">Les fiches sont identiques — rien à choisir, la fusion transfère simplement les données.</Callout>
          )}

          <Callout tone="warning">
            Toutes les coordonnées (téléphones, emails, adresses) et les liens parents des fiches sont
            <span className="font-semibold"> conservés et fusionnés</span> (les doublons exacts sont supprimés) — rien n'est perdu.
            Les affectations, documents, cotisations et progressions sont également transférés vers le membre conservé,
            puis les doublons sont placés dans la Corbeille (restaurables).
          </Callout>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={merge.isPending}>{merge.isPending ? 'Fusion…' : 'Fusionner'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
