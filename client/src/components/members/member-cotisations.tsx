import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { useState } from 'react'
import { useMemberCotisations, useCreateCotisation, useUpdateCotisation, useDeleteCotisation, useSetCotisationExempt, downloadReceipt, type MemberCotisationDto, type PaymentLineInput } from '@/services/cotisation-service'
import { useSettingValue } from '@/services/settings-service'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Tip } from '@/components/ui/tooltip'
import { Plus, Download, Pencil, Trash2, Receipt, Ban } from 'lucide-react'

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD ($)' },
  { value: 'LBP', label: 'LBP (ل.ل)' },
  { value: 'EUR', label: 'EUR (€)' },
]

const PAYMENT_METHOD_OPTIONS = [
  { value: 'Cash', label: 'Espèces' },
  { value: 'Virement', label: 'Virement bancaire' },
  { value: 'Autre', label: 'Autre' },
]

function formatAmount(amount: number, currency: string): string {
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : 'ل.ل'
  return `${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${symbol}`
}

// "Cotisations" tab of the member detail page (CG/leader view). Lists paid cotisations per scout
// year — each cotisation is one receipt with multiple multi-currency payment lines — with receipt
// PDF download, edit, delete. Also exposes the shared "ne paiera pas" (exempt) flag for the current
// year: a per-(member, year) fact CU and CG both see. An exemption is stored as a marker cotisation
// row with NO payment lines, so the list filters to payments.length > 0 to hide markers, and the
// toggle here upserts/removes that marker via a dedicated endpoint.
interface Props {
  memberId: string
  memberName?: string
}

export function MemberCotisations({ memberId, memberName }: Props) {
  const { hasPermission } = useAuthStore()
  const { data: cotisations, isLoading } = useMemberCotisations(memberId)
  const defaultAmount = useSettingValue('cotisation.default_amount')
  const currentScoutYear = useSettingValue('cotisation.current_scout_year')
  const createMutation = useCreateCotisation(memberId)
  const updateMutation = useUpdateCotisation(memberId)
  const deleteMutation = useDeleteCotisation(memberId)
  const exemptMutation = useSetCotisationExempt()

  // Exemption is per current scout year; detected from the marker row's willNotPay flag.
  const year = currentScoutYear ?? '2025-2026'
  const isExempt = !!cotisations?.some(c => c.scoutYear === year && c.willNotPay)
  const toggleExempt = async () => {
    try {
      await exemptMutation.mutateAsync({ memberId, scoutYear: year, willNotPay: !isExempt })
      toast.success(!isExempt ? 'Membre marqué « ne paiera pas »' : 'Exemption retirée')
    } catch (err) { setError(parseApiError(err)) }
  }

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<MemberCotisationDto | null>(null)
  const [deleting, setDeleting] = useState<MemberCotisationDto | null>(null)
  const [error, setError] = useState('')

  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [payments, setPayments] = useState<PaymentLineInput[]>([
    { amount: parseFloat(defaultAmount ?? '100'), currency: 'USD', paymentMethod: 'Cash' }
  ])

  const openCreate = () => {
    setEditing(null)
    setPaymentDate(new Date().toISOString().split('T')[0])
    setNotes('')
    setPayments([{ amount: parseFloat(defaultAmount ?? '100'), currency: 'USD', paymentMethod: 'Cash' }])
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
    setPayments(prev => [...prev, { amount: 0, currency: 'USD', paymentMethod: 'Cash' }])
  }

  const removePaymentLine = (idx: number) => {
    setPayments(prev => prev.filter((_, i) => i !== idx))
  }

  const updatePaymentLine = (idx: number, field: keyof PaymentLineInput, value: string | number) => {
    setPayments(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
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
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // Filename embeds member name (spaces → _), year and receipt number for easy filing.
      const namePart = memberName ? `${memberName.replace(/\s+/g, '_')}_` : ''
      a.download = `Recu_${namePart}${cotisation.scoutYear}_${cotisation.receiptNumber}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Receipt className="h-4 w-4" />Cotisations</CardTitle>
            {hasPermission(PERMISSIONS.COTISATIONS_CREATE) && (
              <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-3 w-3" />Nouvelle cotisation</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {hasPermission(PERMISSIONS.COTISATIONS_EDIT) && (
            <div className="mb-3 flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <span className="flex items-center gap-2 text-sm">
                <Ban className={`h-4 w-4 ${isExempt ? 'text-slate-600' : 'text-muted-foreground'}`} />
                {isExempt ? <span className="text-slate-700">Ne paiera pas pour {year}</span> : <span className="text-muted-foreground">Cotisation attendue pour {year}</span>}
              </span>
              <Button variant="outline" size="sm" disabled={exemptMutation.isPending} onClick={toggleExempt}>
                {isExempt ? "Retirer l'exemption" : 'Marquer « ne paiera pas »'}
              </Button>
            </div>
          )}
          {(() => {
            // Drop exemption marker rows (no payments) — only show actual paid cotisations.
            const realCotisations = (cotisations ?? []).filter(c => c.payments.length > 0)
            return realCotisations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune cotisation enregistrée.</p>
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
                          <span className="font-semibold text-green-700">{formatAmount(p.amount, p.currency)}</span>
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
        </CardContent>
      </Card>

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
              <div className="space-y-2">
                {payments.map((p, idx) => (
                  <div key={idx} className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1">
                      <span className="text-xs text-muted-foreground">Montant</span>
                      <Input type="number" step="0.01" min="0" value={p.amount} onChange={(e) => updatePaymentLine(idx, 'amount', parseFloat(e.target.value) || 0)} required />
                    </div>
                    <div className="w-28 space-y-1">
                      <span className="text-xs text-muted-foreground">Devise</span>
                      <Select value={p.currency} onValueChange={(v) => updatePaymentLine(idx, 'currency', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CURRENCY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
