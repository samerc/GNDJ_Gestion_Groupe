import { useState } from 'react'
import { Users, Check, UserRound, MapPin, ArrowRight, Phone, Mail } from 'lucide-react'
import {
  useReconcileData, useApproveSiblingGroup,
  type SiblingReconcileData, type SiblingGuardian, type SiblingAddress, type SiblingContact,
} from '@/services/sibling-service'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'

const NONE = '__none__'

// Normalize a phone/email for value-dedup (must mirror the backend's Digits / NormEmail).
const normPhone = (s: string) => s.replace(/\D/g, '')
const normEmail = (s: string) => s.trim().toLowerCase()

// The "fullest" (most complete) address: most non-empty fields, then longest text, primary as tiebreak. Used as the
// default pre-selected address so working the "à vérifier" list is mostly a 1-click confirm (the good/most-complete
// spelling is already chosen — e.g. "Rue Girgi Zeidan" over "Girgi Zeidan", or a full address over a one-word stub).
function fullestAddress(addrs: SiblingAddress[]): SiblingAddress | undefined {
  const fields = (a: SiblingAddress) => (a.city?.trim() ? 1 : 0) + (a.details?.trim() ? 1 : 0)
  const len = (a: SiblingAddress) => ((a.city ?? '') + (a.details ?? '')).length
  return [...addrs].sort((a, b) =>
    fields(b) - fields(a) || len(b) - len(a) || (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))[0]
}

// Group a list of contacts by their normalized value, collecting every row id that shares it — so a checkbox can
// toggle ALL ids of one value at once (two duplicate parent records may hold the same email under different ids).
function groupContacts(contacts: SiblingContact[], norm: (s: string) => string) {
  const m = new Map<string, { value: string; ids: string[] }>()
  for (const c of contacts) {
    const k = norm(c.value)
    if (!k) continue
    const g = m.get(k)
    if (g) g.ids.push(c.id)
    else m.set(k, { value: c.value, ids: [c.id] })
  }
  return [...m.values()]
}

// Shared reconcile drawer used by BOTH the Fratries page (confirm a suggestion) and the member fiche
// ("Frères et sœurs" → Lier). Given the member ids that make up the family, it loads their shared "common
// information" (parents by role + addresses), lets the CG pick the canonical père/mère, CHERRY-PICK which parent
// contacts to keep on the merged parent (e.g. keep both fathers' emails), and keep one OR several home addresses,
// then calls approve — which creates/merges the SiblingGroup AND reconciles the family data. On success it
// invalidates the ['siblings'] queries (via useApproveSiblingGroup) and calls onDone/onClose.
export function SiblingReconcileSheet({
  memberIds, title = 'Confirmer la fratrie', confirmLabel = 'Confirmer la fratrie', onClose, onDone,
}: {
  memberIds: string[]
  title?: string
  confirmLabel?: string
  onClose: () => void
  onDone?: () => void
}) {
  const reconcile = useReconcileData()
  const approve = useApproveSiblingGroup()
  const [data, setData] = useState<SiblingReconcileData | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set(memberIds))
  const [father, setFather] = useState<string>(NONE)
  const [mother, setMother] = useState<string>(NONE)
  // Multi-select: the CG can keep more than one home address (e.g. two homes).
  const [addresses, setAddresses] = useState<Set<string>>(new Set())
  // Cherry-pick: the contact row ids (phones + emails) to keep on the merged parents. Default = keep them all.
  const [keptContacts, setKeptContacts] = useState<Set<string>>(new Set())

  // Load the family detail when the sheet opens; default the canonical choices to the record covering the most
  // siblings, the primary address checked, and ALL parent contacts kept.
  const load = async () => {
    if (data || reconcile.isPending) return
    setLoadFailed(false)
    try {
      const d = await reconcile.mutateAsync(memberIds)
      setData(d)
      const best = (gs: SiblingGuardian[]) => gs.length ? [...gs].sort((a, b) => b.linkedMemberIds.length - a.linkedMemberIds.length)[0].guardianId : NONE
      setFather(best(d.fathers)); setMother(best(d.mothers))
      // Default to the most COMPLETE address (not just the primary/first), so the "à vérifier" worklist is mostly
      // a 1-click confirm — the good spelling / fullest address is pre-picked; the CG only overrides genuine 2-home cases.
      const pick = fullestAddress(d.addresses)
      setAddresses(new Set(pick ? [pick.addressId] : []))
      const allContactIds = [...d.fathers, ...d.mothers].flatMap((g) => [...g.phones, ...g.emails]).map((c) => c.id)
      setKeptContacts(new Set(allContactIds))
    } catch (e) { toast.error(parseApiError(e)); setLoadFailed(true) }
  }

  const toggleMember = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleAddress = (id: string) => setAddresses((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleContacts = (ids: string[], on: boolean) => setKeptContacts((prev) => {
    const next = new Set(prev)
    for (const id of ids) { if (on) next.add(id); else next.delete(id) }
    return next
  })

  const submit = async () => {
    if (!data) return
    if (selected.size < 2) { toast.error('Sélectionnez au moins deux membres.'); return }
    // Split the kept contact ids into phones vs emails for the backend.
    const allPhoneIds = new Set([...data.fathers, ...data.mothers].flatMap((g) => g.phones).map((c) => c.id))
    const kept = [...keptContacts]
    try {
      await approve.mutateAsync({
        memberIds: [...selected],
        fatherGuardianId: father === NONE ? null : father,
        motherGuardianId: mother === NONE ? null : mother,
        addressIds: [...addresses],
        keepPhoneIds: kept.filter((id) => allPhoneIds.has(id)),
        keepEmailIds: kept.filter((id) => !allPhoneIds.has(id)),
      })
      toast.success('Fratrie confirmée et informations harmonisées')
      onDone?.()
      onClose()
    } catch (e) { toast.error(parseApiError(e)) }
  }

  const nameOf = (id: string) => { const m = data?.members.find((x) => x.memberId === id); return m ? `${m.firstName} ${m.lastName}` : '' }
  const addrLabel = (a: SiblingAddress) => [a.details, a.city].filter(Boolean).join(', ')
  const guardianName = (gs: SiblingGuardian[], id: string) => { const g = gs.find((x) => x.guardianId === id); return g ? `${g.firstName} ${g.lastName}` : null }

  const chosenFather = data && father !== NONE ? guardianName(data.fathers, father) : null
  const chosenMother = data && mother !== NONE ? guardianName(data.mothers, mother) : null

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl" onOpenAutoFocus={() => void load()}>
        <SheetHeader className="shrink-0 border-b p-5 text-left">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-5">
          {!data ? (
            loadFailed ? (
              <p className="text-sm text-destructive">
                Impossible de charger les informations de la famille.{' '}
                <button type="button" className="underline" onClick={() => void load()}>Réessayer</button>
              </p>
            ) : <div className="py-10"><LoadingSpinner /></div>
          ) : (
            <div className="space-y-5">
              {/* Result preview — the unified family after confirmation */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">Après confirmation</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" /><span className="font-semibold">{selected.size}</span> enfants regroupés</span>
                  {chosenFather && <span className="inline-flex items-center gap-1.5"><UserRound className="h-4 w-4 text-muted-foreground" />Père : <span className="font-medium">{chosenFather}</span></span>}
                  {chosenMother && <span className="inline-flex items-center gap-1.5"><UserRound className="h-4 w-4 text-muted-foreground" />Mère : <span className="font-medium">{chosenMother}</span></span>}
                  {addresses.size > 0 && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{addresses.size} adresse{addresses.size > 1 ? 's' : ''}</span></span>}
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
                        <input type="checkbox" checked={on} onChange={() => toggleMember(m.memberId)} className="h-4 w-4" />
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

              <ParentSection role="Père" options={data.fathers} value={father} onChange={setFather} kept={keptContacts} onToggle={toggleContacts} />
              <ParentSection role="Mère" options={data.mothers} value={mother} onChange={setMother} kept={keptContacts} onToggle={toggleContacts} />

              {/* Addresses — multi-select: keep one OR several (e.g. two homes). The first checked is the primary. */}
              {data.addresses.length > 0 && (
                <section>
                  <p className="mb-1 text-sm font-semibold">Adresses communes</p>
                  <p className="mb-2 text-xs text-muted-foreground">Cochez la ou les adresses à partager avec toute la fratrie (vous pouvez en garder plusieurs).</p>
                  <div className="space-y-1.5">
                    {data.addresses.map((a) => {
                      const on = addresses.has(a.addressId)
                      return (
                        <label key={a.addressId} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${on ? 'border-primary/50 bg-primary/5' : ''}`}>
                          <input type="checkbox" checked={on} onChange={() => toggleAddress(a.addressId)} className="h-4 w-4" />
                          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{addrLabel(a) || a.country}<span className="text-xs text-muted-foreground"> — {nameOf(a.memberId)}</span></span>
                        </label>
                      )
                    })}
                  </div>
                </section>
              )}

              <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Les parents et adresses choisis sont partagés par tous les enfants sélectionnés. Pour chaque parent, seules les coordonnées cochées sont conservées (vous pouvez en retirer, même celles de la fiche principale) ; les fiches en double sont ensuite supprimées.
              </p>
            </div>
          )}
        </div>
        {data && (
          <div className="flex shrink-0 justify-end gap-2 border-t p-4">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={submit} disabled={approve.isPending || selected.size < 2}>
              <Check className="mr-1 h-4 w-4" />{approve.isPending ? 'Confirmation…' : confirmLabel}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// A père/mère section: the candidate parent records as comparison cards. When there are several (duplicates),
// the header explains they'll be merged; the selected one is "Principale", the others "Sera fusionné". Below,
// the "Coordonnées à conserver" list lets the CG cherry-pick which of the OTHER records' phones/emails to add
// onto the chosen principal (default = all kept), so e.g. both fathers' emails survive the merge.
function ParentSection({ role, options, value, onChange, kept, onToggle }: {
  role: string; options: SiblingGuardian[]; value: string
  onChange: (v: string) => void
  kept: Set<string>
  onToggle: (ids: string[], on: boolean) => void
}) {
  if (options.length === 0) return null
  const many = options.length > 1

  // Full UNION of this parent's phones/emails across ALL candidate records (deduped by value). The chosen
  // principal keeps EXACTLY the checked ones — un-checking drops a contact even if it sat on the main record,
  // so a wrong/old number or email is no longer force-kept. Default = all checked (initialized in load()).
  const unionPhones = groupContacts(options.flatMap((g) => g.phones), normPhone)
  const unionEmails = groupContacts(options.flatMap((g) => g.emails), normEmail)
  // Only surface the picker when there's a real choice to make (duplicates exist, or >1 contact to keep/drop).
  const showPicker = value !== NONE && (many || unionPhones.length + unionEmails.length > 1)

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
                    {g.phones.map((p) => <span key={p.id} className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{p.value}</span>)}
                    {g.emails.map((e) => <span key={e.id} className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{e.value}</span>)}
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

      {/* Pick EXACTLY which of this parent's coordinates to keep on the merged fiche (full union of all records;
          default all checked). Un-checking drops a contact — even one on the principal's own record. */}
      {showPicker && (
        <div className="mt-2 rounded-md border border-dashed bg-muted/20 p-2.5">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Coordonnées à conserver pour ce {role.toLowerCase()}</p>
          <div className="flex flex-col gap-1">
            {unionPhones.map((g) => {
              const on = g.ids.some((id) => kept.has(id))
              return (
                <label key={g.ids[0]} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={on} onChange={() => onToggle(g.ids, !on)} className="h-4 w-4" />
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />{g.value}
                </label>
              )
            })}
            {unionEmails.map((g) => {
              const on = g.ids.some((id) => kept.has(id))
              return (
                <label key={g.ids[0]} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={on} onChange={() => onToggle(g.ids, !on)} className="h-4 w-4" />
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />{g.value}
                </label>
              )
            })}
            {unionPhones.length + unionEmails.length === 0 && <p className="text-xs text-muted-foreground">Aucune coordonnée sur les fiches.</p>}
          </div>
        </div>
      )}
    </section>
  )
}
