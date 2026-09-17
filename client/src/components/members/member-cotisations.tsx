import { parseApiError, parseBlobError } from '@/lib/error-utils'
import { saveBlob } from '@/lib/download'
import { toast } from 'sonner'
import { useState } from 'react'
import { useMemberCotisations, useCreateCotisation, useUpdateCotisation, useDeleteCotisation, useSetCotisationExempt, downloadReceipt, type MemberCotisationDto, type PaymentLineInput } from '@/services/cotisation-service'
import { useSettingValue } from '@/services/settings-service'
import { useCurrentScoutYear } from '@/hooks/use-scout-year'
import { PAYMENT_METHOD_OPTIONS } from '@/lib/options'
import { formatMoney } from '@/lib/utils'
import { defaultPaymentLine, amountOnCurrencyChange, currencyLabel, fullAmountFor } from '@/lib/cotisation'
import { useCurrencies } from '@/hooks/use-currencies'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AmountInput } from '@/components/ui/amount-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Tip } from '@/components/ui/tooltip'
import { Plus, Download, Pencil, Trash2, Receipt, Ban, CheckCircle2, AlertTriangle } from 'lucide-react'

// "Cotisations" tab of the member detail page (CG/leader view). Lists paid cotisations per scout
// year — each cotisation is one receipt with multiple multi-currency payment lines — with receipt
// PDF download, edit, delete. Also exposes the shared "ne paiera pas" (exempt) flag for the current
// year: a per-(member, year) fact CU and CG both see. An exemption is stored as a marker cotisation
// row with NO payment lines, so the list filters to payments.length > 0 to hide markers, and the
// toggle here upserts/removes that marker via a dedicated endpoint.
interface Props {
  memberId: string
  memberName?: string
  // When true, render the list/controls WITHOUT the self-contained Card + "Cotisations" title, so a
  // parent page can provide its own section header (e.g. the member "Mes documents" page). Default: card.
  bare?: boolean
  // True only on the member's OWN Ma fiche (not a leader viewing a member). When set, a maîtrise member's
  // "cotisation attendue" banner is hidden if the CG turned the maîtrise cotisation off for the year.
  selfView?: boolean
}

export function MemberCotisations({ memberId, memberName, bare, selfView }: Props) {
  const { hasPermission, user } = useAuthStore()
  // "La maîtrise ne paie pas cette année" — hide the expected-cotisation banner on a maîtrise member's own
  // fiche (they aren't nagged). Only affects the self view; a receipt they DID pay still shows.
  const maitrisePays = useSettingValue('cotisation.maitrise_pays')
  const hideMaitriseExpected = !!selfView && !!user?.isMaitrise && maitrisePays === 'false'
  const { data: cotisations, isLoading } = useMemberCotisations(memberId)
  const defaultAmount = useSettingValue('cotisation.default_amount')
  const currentScoutYear = useCurrentScoutYear()
  // Configured full price per currency (e.g. $30 · 2 500 000 LBP) — the single place the fee is set; shown as a
  // hint when entering a payment AND used to pre-fill the first payment line (falls back to the legacy default_amount).
  const fullAmountsRaw = useSettingValue('cotisation.full_amounts')
  const defaultCurrency = useSettingValue('cotisation.default_currency')
  // Defined currencies (default first) for the payment-line dropdowns — the CG-defined list, not hardcoded.
  const { currencies, defaultCurrency: refCurrency } = useCurrencies()
  const fullPriceHint = (() => {
    try {
      const obj = fullAmountsRaw ? JSON.parse(fullAmountsRaw) as Record<string, number> : {}
      const parts = Object.entries(obj).filter(([, v]) => v > 0).map(([c, v]) => formatMoney(v, c))
      return parts.length > 0 ? parts.join(' · ') : null
    } catch { return null }
  })()
  const createMutation = useCreateCotisation(memberId)
  const updateMutation = useUpdateCotisation(memberId)
  const deleteMutation = useDeleteCotisation(memberId)
  const exemptMutation = useSetCotisationExempt()

  // Exemption is per current scout year; detected from the marker row's willNotPay flag. The marker's
  // notes hold the optional reason ("pourquoi il ne paiera pas").
  const year = currentScoutYear ?? '2025-2026'
  const exemptMarker = cotisations?.find(c => c.scoutYear === year && c.willNotPay)
  const isExempt = !!exemptMarker
  const exemptReason = exemptMarker?.notes ?? null

  // Current-year cotisation status. The backend computes "payé en entier / partiel" (proportion-per-currency
  // against the configured full price per currency), so we just read it off the row instead of re-deriving.
  const currentYearCotisation = (cotisations ?? []).find(c => c.scoutYear === year && c.payments.length > 0)
  const isPaidThisYear = currentYearCotisation?.status === 'Paid'
  const isPartialThisYear = currentYearCotisation?.status === 'Partial'
  const partialPercent = currentYearCotisation?.percentPaid ?? 0
  const partialRemaining = currentYearCotisation?.remainingReference ?? 0
  const partialRefCurrency = currentYearCotisation?.referenceCurrency ?? 'USD'
  // Overpayment (fully paid AND over 100%) → the excess in the reference currency, shown on the "payée" banner.
  const overpaidExcess = (() => {
    if (!currentYearCotisation || currentYearCotisation.status !== 'Paid' || (currentYearCotisation.percentPaid ?? 0) <= 100) return 0
    const refFull = fullAmountFor(fullAmountsRaw, currentYearCotisation.referenceCurrency)
    return refFull ? currentYearCotisation.equivalentReference - refFull : 0
  })()
  // Marking exempt opens a small dialog to capture an optional reason; removing an exemption is direct.
  const [exemptOpen, setExemptOpen] = useState(false)
  const [exemptReasonInput, setExemptReasonInput] = useState('')
  const openExemptDialog = () => { setExemptReasonInput(exemptReason ?? ''); setExemptOpen(true) }
  const submitExempt = async () => {
    try {
      await exemptMutation.mutateAsync({ memberId, scoutYear: year, willNotPay: true, reason: exemptReasonInput || null })
      toast.success('Membre marqué « ne paiera pas »')
      setExemptOpen(false)
    } catch (err) { setError(parseApiError(err)); setExemptOpen(false) }
  }
  const clearExempt = async () => {
    try {
      await exemptMutation.mutateAsync({ memberId, scoutYear: year, willNotPay: false })
      toast.success('Exemption retirée')
    } catch (err) { setError(parseApiError(err)) }
  }

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<MemberCotisationDto | null>(null)
  const [deleting, setDeleting] = useState<MemberCotisationDto | null>(null)
  const [error, setError] = useState('')

  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [payments, setPayments] = useState<PaymentLineInput[]>([
    { ...defaultPaymentLine(fullAmountsRaw, defaultCurrency, defaultAmount), paymentMethod: 'Cash' }
  ])

  const openCreate = () => {
    setEditing(null)
    setPaymentDate(new Date().toISOString().split('T')[0])
    setNotes('')
    setPayments([{ ...defaultPaymentLine(fullAmountsRaw, defaultCurrency, defaultAmount), paymentMethod: 'Cash' }])
    setError('')
    setFormOpen(true)
  }

  const openEdit = (item: MemberCotisationDto) => {
    setEditing(item)
    setPaymentDate(item.paymentDate)
    setNotes(item.notes ?? '')
    setPayments(item.payments.map(p => ({ amount: p.amount, currency: p.currency, paymentMethod: p.paymentMethod })))
    setError('')
    setFormOpen(true)
  }

  const addPaymentLine = () => {
    setPayments(prev => [...prev, { amount: 0, currency: refCurrency, paymentMethod: 'Cash' }])
  }

  const removePaymentLine = (idx: number) => {
    setPayments(prev => prev.filter((_, i) => i !== idx))
  }

  const updatePaymentLine = (idx: number, field: keyof PaymentLineInput, value: string | number) => {
    setPayments(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }

  // Switching a line's currency re-fills the amount with the new currency's full price when it wasn't manually
  // typed (0 or still the old currency's full price) — avoids recording e.g. "30 LBP" after a USD prefill.
  const changeCurrency = (idx: number, newCur: string) => {
    setPayments(prev => prev.map((p, i) =>
      i === idx ? { ...p, currency: newCur, amount: amountOnCurrencyChange(fullAmountsRaw, p.currency, newCur, p.amount) } : p))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (payments.length === 0 || payments.some(p => p.amount <= 0)) {
      setError('Au moins un paiement avec un montant valide est requis.')
      return
    }
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          paymentDate,
          notes: notes || null,
          payments,
        })
        toast.success('Cotisation modifiée')
      } else {
        await createMutation.mutateAsync({
          memberId,
          scoutYear: currentScoutYear ?? '2025-2026',
          paymentDate,
          notes: notes || null,
          payments,
        })
        toast.success('Cotisation enregistrée')
      }
      setFormOpen(false)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteMutation.mutateAsync(deleting.id)
      toast.success('Cotisation supprimée')
      setDeleting(null)
    } catch (err) {
      setError(parseApiError(err))
      setDeleting(null)
    }
  }

  const handleDownloadReceipt = async (cotisation: MemberCotisationDto) => {
    try {
      const response = await downloadReceipt(cotisation.id)
      // Filename embeds member name (spaces → _), year and receipt number for easy filing.
      const namePart = memberName ? `${memberName.replace(/\s+/g, '_')}_` : ''
      saveBlob(response.data, `Recu_${namePart}${cotisation.scoutYear}_${cotisation.receiptNumber}.pdf`, 'application/pdf')
    } catch (err) {
      // Blob download: the JSON error body is a Blob, so read it back for the real message.
      setError(await parseBlobError(err))
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  if (isLoading) return <LoadingSpinner />

  const createButton = hasPermission(PERMISSIONS.COTISATIONS_CREATE)
    ? <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-3 w-3" />Nouvelle cotisation</Button>
    : null

  // Inner content shared by both the card and bare layouts: the exempt toggle + the cotisation list.
  const content = (
    <>
          {hasPermission(PERMISSIONS.COTISATIONS_EDIT) && (
            // Current-year status: paid-in-full → partial → exempt (ne paiera pas) → expected.
            // A payment supersedes the exempt/expected states, so when paid we hide the exempt toggle.
            isPartialThisYear ? (
              <div className="mb-3 flex items-center justify-between rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 px-3 py-2">
                <span className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                  Cotisation partielle pour {year} — {partialPercent}% payé
                  {partialRemaining > 0 && <> · reste ≈ {formatMoney(partialRemaining, partialRefCurrency)}</>}
                </span>
              </div>
            ) : isPaidThisYear ? (
              <div className="mb-3 flex items-center justify-between rounded-md border border-green-200 dark:border-green-900 bg-green-50/60 dark:bg-green-950/30 px-3 py-2">
                <span className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
                  <CheckCircle2 className="h-4 w-4" />Cotisation payée pour {year}
                  {overpaidExcess > 0 && <span className="text-amber-600 dark:text-amber-400">· trop-perçu ≈ {formatMoney(overpaidExcess, partialRefCurrency)}</span>}
                </span>
              </div>
            ) : hideMaitriseExpected ? null : (
              <div className="mb-3 rounded-md border bg-muted/30 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm">
                    <Ban className={`h-4 w-4 ${isExempt ? 'text-foreground' : 'text-muted-foreground'}`} />
                    {isExempt ? <span className="font-medium text-foreground">Ne paiera pas pour {year}</span> : <span className="text-muted-foreground">Cotisation attendue pour {year}</span>}
                  </span>
                  <Button variant="outline" size="sm" disabled={exemptMutation.isPending} onClick={isExempt ? clearExempt : openExemptDialog}>
                    {isExempt ? "Retirer l'exemption" : 'Marquer « ne paiera pas »'}
                  </Button>
                </div>
                {/* Reason for the exemption (if noted) + a quick way to edit it. */}
                {isExempt && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 pl-6 text-xs text-muted-foreground">
                    {exemptReason ? <span>Raison : {exemptReason}</span> : <span className="italic">Aucune raison indiquée</span>}
                    <button type="button" className="text-primary hover:underline" onClick={openExemptDialog}>Modifier</button>
                  </div>
                )}
              </div>
            )
          )}
          {(() => {
            // Drop exemption marker rows (no payments) — only show actual paid cotisations.
            const realCotisations = (cotisations ?? []).filter(c => c.payments.length > 0)
            return realCotisations.length === 0 ? (
            // When the member is exempt ("ne paiera pas") — or a maîtrise member the year the maîtrise doesn't
            // pay — don't show the "no cotisation recorded" line (it reads as a contradiction / a nag).
            (isExempt || hideMaitriseExpected) ? null : <p className="text-sm text-muted-foreground">Aucune cotisation enregistrée.</p>
          ) : (
            <div className="space-y-3">
              {realCotisations.map(c => (
                <div key={c.id} className="flex items-start gap-3 rounded-md border p-3">
                  <Receipt className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.scoutYear}</span>
                      <Badge variant="outline">{c.receiptNumber}</Badge>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {c.payments.map((p, i) => (
                        <div key={i} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          <span className="font-semibold text-green-700 dark:text-green-300">{formatMoney(p.amount, p.currency)}</span>
                          <span className="text-muted-foreground">{PAYMENT_METHOD_OPTIONS.find(o => o.value === p.paymentMethod)?.label ?? p.paymentMethod}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(c.paymentDate).toLocaleDateString('fr-FR')}
                    </div>
                    {c.notes && <p className="mt-1 text-xs text-muted-foreground">{c.notes}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Tip content="Télécharger le reçu"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownloadReceipt(c)}>
                      <Download className="h-3.5 w-3.5" />
                    </Button></Tip>
                    {hasPermission(PERMISSIONS.COTISATIONS_EDIT) && (
                      <Tip content="Modifier"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button></Tip>
                    )}
                    {hasPermission(PERMISSIONS.COTISATIONS_DELETE) && (
                      <Tip content="Supprimer"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(c)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button></Tip>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
          })()}
    </>
  )

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {bare ? (
        // Bare: no self-card/title — the parent page supplies the section header.
        <div className="space-y-3">
          {createButton && <div className="flex justify-end">{createButton}</div>}
          {content}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Receipt className="h-4 w-4" />Cotisations</CardTitle>
              {createButton}
            </div>
          </CardHeader>
          <CardContent>{content}</CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier la cotisation' : 'Nouvelle cotisation'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel>Année scoute</RequiredLabel>
                <Input value={editing?.scoutYear ?? currentScoutYear ?? '2025-2026'} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <RequiredLabel required>Date de paiement</RequiredLabel>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required />
              </div>
            </div>

            {/* Payment lines */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <RequiredLabel required>Paiements</RequiredLabel>
                <Button type="button" variant="outline" size="sm" onClick={addPaymentLine}>
                  <Plus className="mr-1 h-3 w-3" />Ajouter une ligne
                </Button>
              </div>
              {fullPriceHint && <p className="text-xs text-muted-foreground">Cotisation pleine : {fullPriceHint}</p>}
              <div className="space-y-2">
                {payments.map((p, idx) => (
                  <div key={idx} className="flex flex-wrap gap-2 items-end">
                    <div className="flex-1 min-w-[7rem] space-y-1">
                      <span className="text-xs text-muted-foreground">Montant</span>
                      <AmountInput value={p.amount} onValueChange={(n) => updatePaymentLine(idx, 'amount', n)} required />
                    </div>
                    <div className="w-28 space-y-1">
                      <span className="text-xs text-muted-foreground">Devise</span>
                      <Select value={p.currency} onValueChange={(v) => changeCurrency(idx, v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {currencies.map(c => <SelectItem key={c.code} value={c.code}>{currencyLabel(c.code)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-36 space-y-1">
                      <span className="text-xs text-muted-foreground">Mode</span>
                      <Select value={p.paymentMethod} onValueChange={(v) => updatePaymentLine(idx, 'paymentMethod', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {payments.length > 1 && (
                      <Tip content="Supprimer la ligne"><Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removePaymentLine(idx)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button></Tip>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <RequiredLabel>Notes</RequiredLabel>
              <textarea
                className="flex min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Mark exempt ("ne paiera pas") — optional reason stored on the exemption */}
      <Dialog open={exemptOpen} onOpenChange={setExemptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ne paiera pas — {year}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ce membre sera marqué « ne paiera pas » pour {year} et retiré des impayés.
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Raison <span className="font-normal text-muted-foreground">(optionnel)</span></label>
              <textarea
                className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={exemptReasonInput}
                onChange={e => setExemptReasonInput(e.target.value)}
                placeholder="Ex. : difficultés financières, bourse, cas particulier…"
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExemptOpen(false)}>Annuler</Button>
            <Button onClick={submitExempt} disabled={exemptMutation.isPending}>
              {exemptMutation.isPending ? 'Enregistrement...' : 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Supprimer la cotisation"
        description={`Êtes-vous sûr de vouloir supprimer la cotisation ${deleting?.receiptNumber} ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
