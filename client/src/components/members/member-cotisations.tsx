import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { useState } from 'react'
import { useMemberCotisations, useCreateCotisation, useUpdateCotisation, useDeleteCotisation, downloadReceipt, type MemberCotisationDto, type CotisationFormData } from '@/services/cotisation-service'
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
import { Plus, Download, Pencil, Trash2, Receipt } from 'lucide-react'

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

interface Props {
  memberId: string
  memberName?: string
}

export function MemberCotisations({ memberId, memberName }: Props) {
  const { hasPermission } = useAuthStore()
  const { data: cotisations, isLoading } = useMemberCotisations(memberId)
  const defaultAmount = useSettingValue('cotisation.default_amount')
  const currentSchoolYear = useSettingValue('cotisation.current_school_year')
  const createMutation = useCreateCotisation(memberId)
  const updateMutation = useUpdateCotisation(memberId)
  const deleteMutation = useDeleteCotisation(memberId)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<MemberCotisationDto | null>(null)
  const [deleting, setDeleting] = useState<MemberCotisationDto | null>(null)
  const [error, setError] = useState('')

  const defaultForm: CotisationFormData = {
    memberId,
    schoolYear: currentSchoolYear ?? '2025-2026',
    amountPaid: parseFloat(defaultAmount ?? '100'),
    currency: 'USD',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'Cash',
    notes: '',
  }

  const [form, setForm] = useState<CotisationFormData>(defaultForm)

  const openCreate = () => {
    setEditing(null)
    setForm(defaultForm)
    setError('')
    setFormOpen(true)
  }

  const openEdit = (item: MemberCotisationDto) => {
    setEditing(item)
    setForm({
      memberId,
      schoolYear: item.schoolYear,
      amountPaid: item.amountPaid,
      currency: item.currency,
      paymentDate: item.paymentDate,
      paymentMethod: item.paymentMethod,
      notes: item.notes ?? '',
    })
    setError('')
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          amountPaid: form.amountPaid,
          currency: form.currency,
          paymentDate: form.paymentDate,
          paymentMethod: form.paymentMethod,
          notes: form.notes || null,
        })
        toast.success('Cotisation modifiée')
      } else {
        await createMutation.mutateAsync({ ...form, notes: form.notes || null })
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
      const namePart = memberName ? `${memberName.replace(/\s+/g, '_')}_` : ''
      a.download = `Recu_${namePart}${cotisation.schoolYear}_${cotisation.receiptNumber}.pdf`
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
          {!cotisations || cotisations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune cotisation enregistrée.</p>
          ) : (
            <div className="space-y-3">
              {cotisations.map(c => (
                <div key={c.id} className="flex items-start gap-3 rounded-md border p-3">
                  <Receipt className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.schoolYear}</span>
                      <Badge variant="outline">{c.receiptNumber}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <span className="font-semibold text-green-700">{formatAmount(c.amountPaid, c.currency)}</span>
                      <span className="text-muted-foreground">{PAYMENT_METHOD_OPTIONS.find(o => o.value === c.paymentMethod)?.label ?? c.paymentMethod}</span>
                      <span className="text-muted-foreground">{new Date(c.paymentDate).toLocaleDateString('fr-FR')}</span>
                    </div>
                    {c.notes && <p className="mt-1 text-xs text-muted-foreground">{c.notes}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownloadReceipt(c)} title="Télécharger le reçu">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    {hasPermission(PERMISSIONS.COTISATIONS_EDIT) && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)} title="Modifier">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {hasPermission(PERMISSIONS.COTISATIONS_DELETE) && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(c)} title="Supprimer">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier la cotisation' : 'Nouvelle cotisation'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

            {!editing && (
              <div className="space-y-2">
                <RequiredLabel required>Année scoute</RequiredLabel>
                <Input value={form.schoolYear} onChange={(e) => setForm(f => ({ ...f, schoolYear: e.target.value }))} placeholder="2025-2026" required />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel required>Montant</RequiredLabel>
                <Input type="number" step="0.01" min="0" value={form.amountPaid} onChange={(e) => setForm(f => ({ ...f, amountPaid: parseFloat(e.target.value) || 0 }))} required />
              </div>
              <div className="space-y-2">
                <RequiredLabel required>Devise</RequiredLabel>
                <Select value={form.currency} onValueChange={(v) => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel required>Date de paiement</RequiredLabel>
                <Input type="date" value={form.paymentDate} onChange={(e) => setForm(f => ({ ...f, paymentDate: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <RequiredLabel required>Mode de paiement</RequiredLabel>
                <Select value={form.paymentMethod} onValueChange={(v) => setForm(f => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <RequiredLabel>Notes</RequiredLabel>
              <textarea
                className="flex min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.notes ?? ''}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
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
