import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Users, X, Search, Sparkles, ChevronRight, Phone, Mail, MapPin, UserRound, GitMerge, Copy } from 'lucide-react'
import {
  useSiblingSuggestions, useSiblingGroups,
  useRejectSiblingSuggestion, useUnlinkSibling,
  useDuplicateSuggestions, useMergeMembers, DUPLICATE_MATCH_KEYS,
  type SiblingSuggestion,
  type DuplicateGroup, type DuplicateMember, type MemberMergeFields,
} from '@/services/sibling-service'
import { SiblingReconcileSheet } from '@/components/members/sibling-reconcile-sheet'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { parseApiError } from '@/lib/error-utils'
import { computeAge } from '@/lib/utils'
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
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Users className="h-6 w-6 text-primary" />Fratries</h1>
        <p className="text-sm text-muted-foreground">Identifier et confirmer les frères et sœurs. Approuver une fratrie regroupe les membres et harmonise les informations de la famille (parents, adresse, contacts).</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
          <TabsTrigger value="confirmed">Fratries confirmées</TabsTrigger>
          <TabsTrigger value="duplicates">Doublons</TabsTrigger>
        </TabsList>
        <TabsContent value="suggestions" className="mt-4"><SuggestionsTab /></TabsContent>
        <TabsContent value="confirmed" className="mt-4"><ConfirmedTab /></TabsContent>
        <TabsContent value="duplicates" className="mt-4"><DuplicatesTab /></TabsContent>
      </Tabs>
    </div>
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
  const { data: suggestions, isLoading } = useSiblingSuggestions()
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

  if (isLoading) return <LoadingSpinner variant="table" />
  if (!suggestions || suggestions.length === 0)
    return <EmptyState icon={Sparkles} title="Aucune suggestion" description="Aucune fratrie probable à examiner pour le moment." />

  // Client-side filter (the full list is loaded): matches any member's name/unit or the shared evidence.
  const term = searchKey(search.trim())
  const filtered = term
    ? suggestions.filter((s) =>
        s.members.some((m) => searchKey(`${m.firstName} ${m.lastName} ${m.unitName ?? ''}`).includes(term))
        || s.evidence.some((e) => searchKey(e).includes(term)))
    : suggestions

  return (
    <>
      <div className="relative mb-3 max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Rechercher un nom, une unité…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
      </div>
      <p className="mb-3 text-sm text-muted-foreground">{filtered.length} famille(s) probable(s){term ? ` sur ${suggestions.length}` : ''} à examiner. Cliquez sur une famille pour ouvrir ses informations communes (parents, adresse, contacts) sur le côté et la confirmer.</p>
      {filtered.length === 0 ? (
        <EmptyState icon={Sparkles} title="Aucun résultat" description="Aucune fratrie probable ne correspond à votre recherche." />
      ) : (
        <div className="space-y-3">
          {filtered.map((s, i) => <SuggestionRow key={i} suggestion={s} onReview={() => setReviewing(s)} onReject={() => setRejecting(s)} />)}
        </div>
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
    <Card className="cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/20" onClick={onReview}>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge variant={suggestion.confidence === 'Élevée' ? 'default' : 'secondary'}
              className={suggestion.confidence === 'Élevée' ? 'bg-emerald-600' : 'bg-amber-500 text-white'}>
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
                  <span className="text-xs text-muted-foreground">{m.unitName ?? 'Sans unité'}{age != null ? ` · ${age} ans` : ''}</span>
                  {m.siblingGroupId && <span className="text-xs text-emerald-600">(déjà en fratrie)</span>}
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

  return (
    <>
      <div className="relative mb-3 max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Rechercher un membre…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
      </div>

      {isLoading ? <LoadingSpinner variant="table" />
        : !groups || groups.length === 0
          ? <EmptyState icon={Users} title="Aucune fratrie confirmée" description="Confirmez des suggestions ou liez des membres manuellement depuis leur fiche." />
          : (
            <div className="space-y-3">
              {groups.map((g) => (
                <Card key={g.groupId}>
                  <CardContent className="flex flex-wrap items-center gap-2 p-4">
                    {g.members.map((m) => (
                      <span key={m.memberId} className="flex items-center gap-1 rounded-full border bg-muted/40 py-1 pl-3 pr-1 text-sm">
                        {/* Open in a new tab so the reconciliation list stays put (no losing your place / back-button). */}
                        <Link to={`/members/${m.memberId}`} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{m.firstName} {m.lastName}</Link>
                        <span className="text-xs text-muted-foreground">· {m.unitName ?? 'Sans unité'}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => setUnlinkTarget({ id: m.memberId, name: `${m.firstName} ${m.lastName}` })}
                          title="Retirer de la fratrie" aria-label="Retirer de la fratrie">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    ))}
                    <Link to={`/members/${g.members[0]?.memberId}`} target="_blank" rel="noopener noreferrer" className="ml-auto text-muted-foreground hover:text-foreground" title="Ouvrir">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
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

// ── Doublons (duplicate members: members sharing the selected criteria = likely the same person twice) ──
function DuplicatesTab() {
  // Configurable match criteria (default = Nom + Prénom — DOB left off so import duplicates with a missing/
  // wrong birth date still surface; the CG confirms via the richer per-member info below). A member is grouped
  // with another only when they share ALL the checked fields.
  const [keys, setKeys] = useState<string[]>(['lastName', 'firstName'])
  const { data: groups, isLoading } = useDuplicateSuggestions(keys)
  const [merging, setMerging] = useState<DuplicateGroup | null>(null)
  const [search, setSearch] = useState('')

  const toggleKey = (k: string) => setKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))

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
      {keys.length === 0 && <p className="mt-1.5 text-xs text-amber-600">Cochez au moins un critère (sinon les critères par défaut nom + prénom + date de naissance sont utilisés).</p>}
    </div>
  )

  if (isLoading) return <>{configBar}<LoadingSpinner variant="table" /></>
  if (!groups || groups.length === 0)
    return <>{configBar}<EmptyState icon={Copy} title="Aucun doublon" description="Aucun membre partageant tous les critères sélectionnés n'a été détecté." /></>

  // Client-side filter by any member's name in the group.
  const term = searchKey(search.trim())
  const filtered = term
    ? groups.filter((g) => g.members.some((m) => searchKey(`${m.firstName} ${m.lastName}`).includes(term)))
    : groups

  const searchBar = (
    <div className="relative mb-3 max-w-sm">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input placeholder="Rechercher un nom…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
    </div>
  )

  return (
    <>
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
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Copy className="h-3.5 w-3.5" />{g.evidence}</span>
                <Button size="sm" onClick={() => setMerging(g)}><GitMerge className="mr-1 h-4 w-4" />Fusionner</Button>
              </div>
              {/* Richer per-member info so the CG can decide if these really are the same person (same-name people
                  aren't always duplicates). DOB/matricule/n° carte/école/unité/statut/nb d'affectations. */}
              <div className="grid gap-2 sm:grid-cols-2">
                {g.members.map((m) => {
                  const age = computeAge(m.dateOfBirth)
                  const bits = [
                    m.dateOfBirth ? `${new Date(m.dateOfBirth).toLocaleDateString('fr-FR')}${age != null ? ` (${age} ans)` : ''}` : 'Naissance ?',
                    m.gender ? m.gender[0] : null,
                    m.cardNumber ? `Mat. ${m.cardNumber}` : null,
                    m.externalCardNumber ? `N° ${m.externalCardNumber}` : null,
                    m.school,
                    m.classe,
                    m.unitName ?? 'Sans unité',
                    m.isActiveMember ? 'actif' : 'ancien',
                    m.hasAccount ? 'compte' : null,
                    `${m.assignmentCount} affect.`,
                  ].filter(Boolean) as string[]
                  return (
                    <div key={m.memberId} className="rounded-md border bg-muted/20 p-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{(m.firstName[0] ?? '').toUpperCase()}</span>
                        <Link to={`/members/${m.memberId}`} target="_blank" rel="noopener noreferrer" className="truncate font-medium hover:underline">{m.firstName} {m.lastName}</Link>
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

      {merging && <MergeDialog group={merging} onClose={() => setMerging(null)} />}
    </>
  )
}

// Fields the CG can choose from when merging (label + accessor). The internal matricule is intentionally absent —
// the keeper always keeps its own. Order = most likely to differ / matter first.
const MERGE_FIELDS: { key: keyof MemberMergeFields; label: string; get: (m: DuplicateMember) => string | null }[] = [
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

// Merge dialog: pick the member to KEEP + for each field that differs, which value wins. Everything from the
// other members is transferred onto the keeper; they're then soft-deleted (Corbeille).
function MergeDialog({ group, onClose }: { group: DuplicateGroup; onClose: () => void }) {
  const merge = useMergeMembers()
  const members = group.members
  const [keeperId, setKeeperId] = useState(members[0].memberId)
  // Per field, which member's value to use (memberId). Defaults computed from the keeper below.
  const [choices, setChoices] = useState<Record<string, string>>({})

  // Default each field's source: the keeper if it has a value, else the first member that does. Recomputed
  // (render-phase reset) whenever the keeper changes — React's derive-from-props pattern keyed on keeperId.
  const [seededKeeper, setSeededKeeper] = useState<string | null>(null)
  if (seededKeeper !== keeperId) {
    setSeededKeeper(keeperId)
    const keeper = members.find((m) => m.memberId === keeperId)!
    const next: Record<string, string> = {}
    for (const f of MERGE_FIELDS) {
      const withValue = members.find((m) => norm(f.get(m)))
      next[f.key] = norm(f.get(keeper)) ? keeperId : (withValue?.memberId ?? keeperId)
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
      toast.success(`Fusion effectuée — ${r.merged} doublon(s) placé(s) dans la Corbeille.`)
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
                        {m.unitName ?? 'Sans unité'}{age != null ? ` · ${age} ans` : ''}{m.isActiveMember ? ' · actif' : ' · ancien'}
                        {m.hasAccount ? ' · compte' : ''}{m.cardNumber ? ` · ${m.cardNumber}` : ''}
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
            <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Les fiches sont identiques — rien à choisir, la fusion transfère simplement les données.</p>
          )}

          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Les affectations, documents, cotisations, progressions, contacts et liens parents des autres fiches
            seront transférés vers le membre conservé. Les doublons seront placés dans la Corbeille (restaurables).
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={merge.isPending}>{merge.isPending ? 'Fusion…' : 'Fusionner'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
