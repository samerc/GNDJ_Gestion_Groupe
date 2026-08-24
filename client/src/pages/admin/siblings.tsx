import { useState } from 'react'
import { Link } from 'react-router'
import { Users, Check, X, Search, Sparkles, ChevronRight } from 'lucide-react'
import {
  useSiblingSuggestions, useSiblingGroups, useReconcileData,
  useApproveSiblingGroup, useRejectSiblingSuggestion, useUnlinkSibling,
  type SiblingSuggestion, type SiblingReconcileData, type SiblingGuardian, type SiblingAddress,
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
        </TabsList>
        <TabsContent value="suggestions" className="mt-4"><SuggestionsTab /></TabsContent>
        <TabsContent value="confirmed" className="mt-4"><ConfirmedTab /></TabsContent>
      </Tabs>
    </div>
  )
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
          <Card key={i}>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Badge variant={s.confidence === 'Élevée' ? 'default' : 'secondary'}
                  className={s.confidence === 'Élevée' ? 'bg-emerald-600' : 'bg-amber-500 text-white'}>
                  Confiance {s.confidence.toLowerCase()}
                </Badge>
                <span className="text-xs text-muted-foreground">{s.members.length} membres</span>
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {s.members.map((m) => {
                  const age = computeAge(m.dateOfBirth)
                  return (
                    <span key={m.memberId} className="rounded-full border bg-muted/40 px-2.5 py-1 text-sm">
                      <span className="font-medium">{m.firstName} {m.lastName}</span>
                      <span className="text-xs text-muted-foreground"> · {m.unitName ?? 'Sans unité'}{age != null ? ` · ${age} ans` : ''}</span>
                      {m.siblingGroupId && <span className="ml-1 text-xs text-emerald-600">(déjà en fratrie)</span>}
                    </span>
                  )
                })}
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {s.evidence.map((e, j) => (
                  <span key={j} className="rounded bg-primary/5 px-2 py-0.5 text-xs text-muted-foreground">{e}</span>
                ))}
              </div>
              <div className="flex gap-2">
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
  const addrLabel = (a: SiblingAddress) => [a.details, a.city, a.country].filter(Boolean).join(', ') + ` — ${nameOf(a.memberId)}`

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg" onOpenAutoFocus={load}>
        <DialogHeader><DialogTitle>Confirmer la fratrie</DialogTitle></DialogHeader>
        {!data ? <LoadingSpinner /> : (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium">Membres de la fratrie</p>
              <div className="space-y-1">
                {data.members.map((m) => (
                  <label key={m.memberId} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <input type="checkbox" checked={selected.has(m.memberId)} onChange={() => toggle(m.memberId)} className="h-4 w-4" />
                    <span className="font-medium">{m.firstName} {m.lastName}</span>
                    <span className="text-xs text-muted-foreground">{m.unitName ?? 'Sans unité'}</span>
                    {m.siblingGroupId && <span className="ml-auto text-xs text-emerald-600">déjà en fratrie</span>}
                  </label>
                ))}
              </div>
            </div>

            <ReconcilePicker label="Père (parent commun)" options={data.fathers} value={father} onChange={setFather} />
            <ReconcilePicker label="Mère (parent commun)" options={data.mothers} value={mother} onChange={setMother} />

            <div>
              <p className="mb-1.5 text-sm font-medium">Adresse commune</p>
              <select value={address} onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                <option value={NONE}>Ne pas modifier les adresses</option>
                {data.addresses.map((a) => <option key={a.addressId} value={a.addressId}>{addrLabel(a)}</option>)}
              </select>
            </div>

            <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Les parents/adresse choisis seront partagés par tous les membres sélectionnés; les doublons de parents seront fusionnés (contacts regroupés).
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

// Radio-style picker for the canonical père / mère (with a "don't touch" option).
function ReconcilePicker({ label, options, value, onChange }: { label: string; options: SiblingGuardian[]; value: string; onChange: (v: string) => void }) {
  if (options.length === 0) return null
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      <div className="space-y-1">
        <label className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
          <input type="radio" checked={value === NONE} onChange={() => onChange(NONE)} className="h-4 w-4" />
          <span className="text-muted-foreground">Ne pas modifier</span>
        </label>
        {options.map((g) => (
          <label key={g.guardianId} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
            <input type="radio" checked={value === g.guardianId} onChange={() => onChange(g.guardianId)} className="h-4 w-4" />
            <span className="font-medium">{g.firstName} {g.lastName}</span>
            <span className="text-xs text-muted-foreground">
              {g.linkedMemberIds.length} enfant(s){g.emails.length ? ` · ${g.emails[0]}` : ''}{g.phones.length ? ` · ${g.phones[0]}` : ''}
            </span>
          </label>
        ))}
      </div>
    </div>
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
