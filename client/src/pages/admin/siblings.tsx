import { useState } from 'react'
import { Link } from 'react-router'
import { Users, Check, X, Search, Sparkles, ChevronRight, Phone, Mail, MapPin, UserRound, ArrowRight, GitMerge, Copy } from 'lucide-react'
import {
  useSiblingSuggestions, useSiblingGroups, useReconcileData,
  useApproveSiblingGroup, useRejectSiblingSuggestion, useUnlinkSibling,
  useDuplicateSuggestions, useMergeMembers, DUPLICATE_MATCH_KEYS,
  type SiblingSuggestion, type SiblingReconcileData, type SiblingGuardian, type SiblingAddress,
  type DuplicateGroup, type DuplicateMember, type MemberMergeFields,
} from '@/services/sibling-service'
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
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Users className="h-6 w-6 text-primary" />Fratries</h1>
        <p className="text-sm text-muted-foreground">Identifier et confirmer les frères et sœurs. Approuver une fratrie regroupe les membres et harmonise les informations de la famille (parents, adresse, contacts).</p>
      </div>
      <Tabs defaultValue="suggestions">
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
  const [reviewing, setReviewing] = useState<SiblingSuggestion | null>(null)
  const [rejecting, setRejecting] = useState<SiblingSuggestion | null>(null)

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

  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">{suggestions.length} famille(s) probable(s) à examiner.</p>
      <div className="space-y-3">
        {suggestions.map((s, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-0">
              <div className="grid md:grid-cols-[1fr_auto]">
                {/* Left: the children of this family */}
                <div className="p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant={s.confidence === 'Élevée' ? 'default' : 'secondary'}
                      className={s.confidence === 'Élevée' ? 'bg-emerald-600' : 'bg-amber-500 text-white'}>
                      Confiance {s.confidence.toLowerCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{s.members.length} enfants probables</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.members.map((m) => {
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
                {/* Right: what they have in common (the reason) */}
                <div className="border-t bg-muted/20 p-4 md:min-w-[260px] md:border-l md:border-t-0">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">En commun</p>
                  <ul className="space-y-1">
                    {s.evidence.map((e, j) => {
                      const Icon = evidenceIcon(e)
                      // Split "Label : value" so the value stands out.
                      const [label, ...rest] = e.split(' : ')
                      const value = rest.join(' : ')
                      return (
                        <li key={j} className="flex items-start gap-2 text-xs">
                          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                          <span><span className="text-muted-foreground">{label}{value ? ' : ' : ''}</span>{value && <span className="font-medium">{value}</span>}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
              <div className="flex gap-2 border-t bg-background p-3">
                <Button size="sm" onClick={() => setReviewing(s)}><Check className="mr-1 h-4 w-4" />Réviser et confirmer</Button>
                <Button size="sm" variant="outline" onClick={() => setRejecting(s)}><X className="mr-1 h-4 w-4" />Rejeter</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {reviewing && <ReconcileDialog suggestion={reviewing} onClose={() => setReviewing(null)} />}

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

// ── Reconcile dialog: pick the members to group + the canonical père/mère/adresse ──
const NONE = '__none__'

function ReconcileDialog({ suggestion, onClose }: { suggestion: SiblingSuggestion; onClose: () => void }) {
  const memberIds = suggestion.members.map((m) => m.memberId)
  const reconcile = useReconcileData()
  const approve = useApproveSiblingGroup()
  const [data, setData] = useState<SiblingReconcileData | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set(memberIds))
  const [father, setFather] = useState<string>(NONE)
  const [mother, setMother] = useState<string>(NONE)
  const [address, setAddress] = useState<string>(NONE)

  // Load the family detail once, defaulting the canonical choices to whichever record covers the most siblings.
  const load = async () => {
    if (data) return
    try {
      const d = await reconcile.mutateAsync(memberIds)
      setData(d)
      const best = (gs: SiblingGuardian[]) => gs.length ? [...gs].sort((a, b) => b.linkedMemberIds.length - a.linkedMemberIds.length)[0].guardianId : NONE
      setFather(best(d.fathers)); setMother(best(d.mothers))
      const primary = d.addresses.find((a) => a.isPrimary) ?? d.addresses[0]
      setAddress(primary ? primary.addressId : NONE)
    } catch (e) { toast.error(parseApiError(e)); onClose() }
  }

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const submit = async () => {
    if (selected.size < 2) { toast.error('Sélectionnez au moins deux membres.'); return }
    try {
      await approve.mutateAsync({
        memberIds: [...selected],
        fatherGuardianId: father === NONE ? null : father,
        motherGuardianId: mother === NONE ? null : mother,
        addressId: address === NONE ? null : address,
      })
      toast.success('Fratrie confirmée et informations harmonisées')
      onClose()
    } catch (e) { toast.error(parseApiError(e)) }
  }

  const nameOf = (id: string) => { const m = suggestion.members.find((x) => x.memberId === id); return m ? `${m.firstName} ${m.lastName}` : '' }
  const addrLabel = (a: SiblingAddress) => [a.details, a.city].filter(Boolean).join(', ')
  const guardianName = (gs: SiblingGuardian[], id: string) => { const g = gs.find((x) => x.guardianId === id); return g ? `${g.firstName} ${g.lastName}` : null }

  const chosenFather = data && father !== NONE ? guardianName(data.fathers, father) : null
  const chosenMother = data && mother !== NONE ? guardianName(data.mothers, mother) : null
  const chosenAddr = data && address !== NONE ? addrLabel(data.addresses.find((a) => a.addressId === address)!) : null

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onOpenAutoFocus={load}>
        <DialogHeader><DialogTitle>Confirmer la fratrie</DialogTitle></DialogHeader>
        {!data ? <LoadingSpinner /> : (
          <div className="space-y-5">
            {/* Result preview — the unified family after confirmation */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">Après confirmation</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" /><span className="font-semibold">{selected.size}</span> enfants regroupés</span>
                {chosenFather && <span className="inline-flex items-center gap-1.5"><UserRound className="h-4 w-4 text-muted-foreground" />Père : <span className="font-medium">{chosenFather}</span></span>}
                {chosenMother && <span className="inline-flex items-center gap-1.5"><UserRound className="h-4 w-4 text-muted-foreground" />Mère : <span className="font-medium">{chosenMother}</span></span>}
                {chosenAddr && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{chosenAddr}</span></span>}
              </div>
            </div>

            {/* Children */}
            <section>
              <p className="mb-2 text-sm font-semibold">Enfants de la fratrie <span className="font-normal text-muted-foreground">— décochez ceux à exclure</span></p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {data.members.map((m) => {
                  const on = selected.has(m.memberId)
                  return (
                    <label key={m.memberId} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${on ? 'border-primary/40 bg-primary/5' : 'opacity-60'}`}>
                      <input type="checkbox" checked={on} onChange={() => toggle(m.memberId)} className="h-4 w-4" />
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{(m.firstName[0] ?? '').toUpperCase()}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{m.firstName} {m.lastName}</span>
                        <span className="block truncate text-xs text-muted-foreground">{m.unitName ?? 'Sans unité'}</span>
                      </span>
                      {m.siblingGroupId && <span className="shrink-0 text-xs text-emerald-600">en fratrie</span>}
                    </label>
                  )
                })}
              </div>
            </section>

            <ParentSection role="Père" options={data.fathers} value={father} onChange={setFather} />
            <ParentSection role="Mère" options={data.mothers} value={mother} onChange={setMother} />

            {/* Address */}
            {data.addresses.length > 0 && (
              <section>
                <p className="mb-2 text-sm font-semibold">Adresse commune</p>
                <div className="space-y-1.5">
                  {data.addresses.map((a) => {
                    const on = address === a.addressId
                    return (
                      <label key={a.addressId} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${on ? 'border-primary/50 bg-primary/5' : ''}`}>
                        <input type="radio" checked={on} onChange={() => setAddress(a.addressId)} className="h-4 w-4" />
                        <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{addrLabel(a) || a.country}<span className="text-xs text-muted-foreground"> — {nameOf(a.memberId)}</span></span>
                      </label>
                    )
                  })}
                  <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${address === NONE ? 'border-primary/50 bg-primary/5' : ''}`}>
                    <input type="radio" checked={address === NONE} onChange={() => setAddress(NONE)} className="h-4 w-4" />
                    <span className="text-muted-foreground">Ne pas modifier les adresses</span>
                  </label>
                </div>
              </section>
            )}

            <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Les parents et l'adresse choisis seront partagés par tous les enfants sélectionnés; les fiches de parents en double sont fusionnées (contacts regroupés) et les doublons supprimés.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={!data || approve.isPending || selected.size < 2}>
            {approve.isPending ? 'Confirmation…' : 'Confirmer la fratrie'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// A père/mère section: the candidate parent records as comparison cards. When there are several (duplicates),
// the header explains they'll be merged; the selected one is "Principale", the others "Sera fusionné".
function ParentSection({ role, options, value, onChange }: { role: string; options: SiblingGuardian[]; value: string; onChange: (v: string) => void }) {
  if (options.length === 0) return null
  const many = options.length > 1
  return (
    <section>
      <p className="mb-1 text-sm font-semibold">{role}</p>
      {many && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-amber-600">
          <ArrowRight className="h-3.5 w-3.5" />{options.length} fiches semblent être la même personne — choisissez la principale, les autres seront fusionnées.
        </p>
      )}
      <div className="space-y-1.5">
        {options.map((g) => {
          const on = value === g.guardianId
          return (
            <label key={g.guardianId} className={`flex cursor-pointer gap-2.5 rounded-md border p-3 text-sm transition-colors ${on ? 'border-primary/50 bg-primary/5' : ''}`}>
              <input type="radio" checked={on} onChange={() => onChange(g.guardianId)} className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{g.firstName} {g.lastName}</span>
                  <span className="text-xs text-muted-foreground">· {g.linkedMemberIds.length} enfant(s)</span>
                  {many && (on
                    ? <Badge className="ml-auto bg-emerald-600 text-[10px]">Principale</Badge>
                    : <span className="ml-auto text-[10px] text-muted-foreground">Sera fusionné</span>)}
                </div>
                {(g.phones.length > 0 || g.emails.length > 0) && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {g.phones.map((p, i) => <span key={`p${i}`} className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{p}</span>)}
                    {g.emails.map((e, i) => <span key={`e${i}`} className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{e}</span>)}
                  </div>
                )}
              </div>
            </label>
          )
        })}
        <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${value === NONE ? 'border-primary/50 bg-primary/5' : ''}`}>
          <input type="radio" checked={value === NONE} onChange={() => onChange(NONE)} className="h-4 w-4" />
          <span className="text-muted-foreground">Ne pas modifier</span>
        </label>
      </div>
    </section>
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
                        <Link to={`/members/${m.memberId}`} className="font-medium hover:underline">{m.firstName} {m.lastName}</Link>
                        <span className="text-xs text-muted-foreground">· {m.unitName ?? 'Sans unité'}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => setUnlinkTarget({ id: m.memberId, name: `${m.firstName} ${m.lastName}` })}
                          title="Retirer de la fratrie" aria-label="Retirer de la fratrie">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    ))}
                    <Link to={`/members/${g.members[0]?.memberId}`} className="ml-auto text-muted-foreground hover:text-foreground" title="Ouvrir">
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
  // Configurable match criteria (default = Nom + Prénom + Date de naissance). A member is grouped with another
  // only when they share ALL the checked fields.
  const [keys, setKeys] = useState<string[]>(['lastName', 'firstName', 'dob'])
  const { data: groups, isLoading } = useDuplicateSuggestions(keys)
  const [merging, setMerging] = useState<DuplicateGroup | null>(null)

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

  return (
    <>
      {configBar}
      <p className="mb-3 text-sm text-muted-foreground">
        {groups.length} doublon(s) probable(s). Fusionnez pour n'en garder qu'un (les affectations, documents,
        contacts… du doublon sont transférés vers le membre conservé, qui est ensuite placé dans la Corbeille et
        restaurable).
      </p>
      <div className="space-y-3">
        {groups.map((g, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="flex flex-wrap items-center gap-2 p-4">
              <span className="mr-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><Copy className="h-3.5 w-3.5" />{g.evidence}</span>
              {g.members.map((m) => (
                <span key={m.memberId} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-1 pr-2.5 text-sm">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{(m.firstName[0] ?? '').toUpperCase()}</span>
                  <Link to={`/members/${m.memberId}`} className="font-medium hover:underline">{m.firstName} {m.lastName}</Link>
                  <span className="text-xs text-muted-foreground">{m.unitName ?? 'Sans unité'}{m.isActiveMember ? '' : ' · ancien'}{m.hasAccount ? ' · compte' : ''}</span>
                </span>
              ))}
              <Button size="sm" className="ml-auto" onClick={() => setMerging(g)}><GitMerge className="mr-1 h-4 w-4" />Fusionner</Button>
            </CardContent>
          </Card>
        ))}
      </div>

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
