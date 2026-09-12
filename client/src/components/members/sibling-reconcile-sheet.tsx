import { useState } from 'react'
import { Users, Check, UserRound, MapPin, ArrowRight, Phone, Mail } from 'lucide-react'
import {
  useReconcileData, useApproveSiblingGroup,
  type SiblingReconcileData, type SiblingGuardian, type SiblingAddress,
} from '@/services/sibling-service'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'

const NONE = '__none__'

// Shared reconcile drawer used by BOTH the Fratries page (confirm a suggestion) and the member fiche
// ("Frères et sœurs" → Lier). Given the member ids that make up the family, it loads their shared "common
// information" (parents by role + addresses), lets the CG pick the canonical père/mère/adresse (the record
// covering the most siblings is pre-selected), then calls approve — which creates/merges the SiblingGroup AND
// reconciles the family data (parents shared, duplicate parents merged, address copied). On success it
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
  const [address, setAddress] = useState<string>(NONE)

  // Load the family detail when the sheet opens; default the canonical choices to the record covering the most siblings.
  const load = async () => {
    if (data || reconcile.isPending) return
    setLoadFailed(false)
    try {
      const d = await reconcile.mutateAsync(memberIds)
      setData(d)
      const best = (gs: SiblingGuardian[]) => gs.length ? [...gs].sort((a, b) => b.linkedMemberIds.length - a.linkedMemberIds.length)[0].guardianId : NONE
      setFather(best(d.fathers)); setMother(best(d.mothers))
      const primary = d.addresses.find((a) => a.isPrimary) ?? d.addresses[0]
      setAddress(primary ? primary.addressId : NONE)
    } catch (e) { toast.error(parseApiError(e)); setLoadFailed(true) }
  }

  const toggleMember = (id: string) => setSelected((prev) => {
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
      onDone?.()
      onClose()
    } catch (e) { toast.error(parseApiError(e)) }
  }

  const nameOf = (id: string) => { const m = data?.members.find((x) => x.memberId === id); return m ? `${m.firstName} ${m.lastName}` : '' }
  const addrLabel = (a: SiblingAddress) => [a.details, a.city].filter(Boolean).join(', ')
  const guardianName = (gs: SiblingGuardian[], id: string) => { const g = gs.find((x) => x.guardianId === id); return g ? `${g.firstName} ${g.lastName}` : null }

  const chosenFather = data && father !== NONE ? guardianName(data.fathers, father) : null
  const chosenMother = data && mother !== NONE ? guardianName(data.mothers, mother) : null
  const chosenAddrRec = data && address !== NONE ? data.addresses.find((a) => a.addressId === address) : null
  const chosenAddr = chosenAddrRec ? addrLabel(chosenAddrRec) : null

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
