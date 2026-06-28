import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useSettingValue } from '@/services/settings-service'
import {
  useUnitDocumentsMatrix, useReviewDocumentMatrix, downloadDocument, downloadUnitDocumentsZip,
  type MemberDocRowDto, type MemberDocCellDto, type DocTypeColumnDto
} from '@/services/document-service'
import { useCreateCotisation, useUpdateCotisation, useSetCotisationExempt } from '@/services/cotisation-service'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Download, CheckCircle, XCircle, Clock, AlertTriangle, Minus, FileArchive, DollarSign, Receipt, Plus, Trash2, Ban } from 'lucide-react'

// ─── Cell rendering helpers ────────────────────────────────
function docStatusColor(cell: MemberDocCellDto): string {
  if (!cell.documentId) return 'bg-gray-100 text-gray-400'
  if (cell.isExpired) return 'bg-red-50 text-red-500'
  switch (cell.status) {
    case 'Approved': return 'bg-green-50 text-green-600'
    case 'Rejected': return 'bg-red-50 text-red-500'
    default: return 'bg-amber-50 text-amber-600'
  }
}

function docStatusIcon(cell: MemberDocCellDto) {
  if (!cell.documentId) return <Minus className="h-5 w-5" />
  if (cell.isExpired) return <AlertTriangle className="h-5 w-5" />
  switch (cell.status) {
    case 'Approved': return <CheckCircle className="h-5 w-5" />
    case 'Rejected': return <XCircle className="h-5 w-5" />
    default: return <Clock className="h-5 w-5" />
  }
}

function docStatusLabel(cell: MemberDocCellDto): string {
  if (!cell.documentId) return 'Manquant'
  if (cell.isExpired) return 'Expiré'
  switch (cell.status) {
    case 'Approved': return 'Approuvé'
    case 'Rejected': return 'Refusé'
    default: return 'En attente'
  }
}

const CURRENCY_OPTIONS = [
  { value: 'USD', label: '$' },
  { value: 'LBP', label: 'ل.ل' },
  { value: 'EUR', label: '€' },
]

const PAYMENT_METHOD_OPTIONS = [
  { value: 'Cash', label: 'Espèces' },
  { value: 'Virement', label: 'Virement' },
  { value: 'Autre', label: 'Autre' },
]

// "Documents & Cotisations" — chef d'unité (CU) screen. A members × document-types matrix for the CU's
// unit(s): each cell shows a member's upload status per doc type (with hover quick approve/reject + a
// click-to-preview dialog), plus a trailing cotisation cell (payée / non payée / exempté) that opens a
// payment dialog. Unit-scoped to the CU's authorized units; the unit picker only shows when they lead >1.
export default function UnitDocumentsPage() {
  const user = useAuthStore((s) => s.user)
  const currentScoutYear = useSettingValue('cotisation.current_scout_year') ?? '2025-2026'
  const defaultAmount = useSettingValue('cotisation.default_amount')
  const [selectedUnit, setSelectedUnit] = useState<string>(user?.unitAccess[0]?.unitId ?? '')

  // Effective unit = explicit pick, else the CU's first authorized unit.
  const unitId = selectedUnit || user?.unitAccess[0]?.unitId || ''
  const { data: matrix, isLoading } = useUnitDocumentsMatrix(unitId, currentScoutYear)
  const reviewMutation = useReviewDocumentMatrix(unitId)

  // Preview state
  const [previewCell, setPreviewCell] = useState<{ cell: MemberDocCellDto; member: MemberDocRowDto; docType: DocTypeColumnDto } | null>(null)
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState(false)
  const [reviewNotes, setReviewNotes] = useState('')

  // Cotisation dialog state
  const [cotisationMember, setCotisationMember] = useState<MemberDocRowDto | null>(null)
  const [cotPayments, setCotPayments] = useState<{ amount: number; currency: string; paymentMethod: string }[]>([])
  const [cotPaymentDate, setCotPaymentDate] = useState('')
  const [cotNotes, setCotNotes] = useState('')
  const createCotisation = useCreateCotisation('')
  const updateCotisation = useUpdateCotisation('')
  const setExempt = useSetCotisationExempt()

  // Mark/unmark a member as "ne paiera pas" for the year — a shared CU↔CG fact (no payment line).
  const toggleExempt = async (member: MemberDocRowDto, willNotPay: boolean) => {
    try {
      await setExempt.mutateAsync({ memberId: member.memberId, scoutYear: currentScoutYear, willNotPay })
      toast.success(willNotPay ? 'Membre marqué « ne paiera pas »' : 'Exemption retirée')
      setCotisationMember(null)
    } catch (err) { setError(parseApiError(err)) }
  }

  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)

  if (!user) return <LoadingSpinner />

  // ─── Preview logic ─────────────────────────────────
  const openPreview = async (member: MemberDocRowDto, cell: MemberDocCellDto, docType: DocTypeColumnDto) => {
    if (!cell.documentId) return
    setPreviewCell({ cell, member, docType })
    setReviewNotes('')
    setError('')
    setPreviewError(false)
    // Fetch the file as a blob and hold an object URL for inline <img>/<iframe> preview (revoked on close).
    try {
      const response = await downloadDocument(cell.documentId)
      const blob = new Blob([response.data], { type: cell.mimeType ?? 'application/octet-stream' })
      setPreviewBlobUrl(URL.createObjectURL(blob))
    } catch {
      setPreviewBlobUrl(null)
      setPreviewError(true)
    }
  }

  const closePreview = () => {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl)
    setPreviewBlobUrl(null)
    setPreviewCell(null)
  }

  const handleReview = async (status: string) => {
    if (!previewCell?.cell.documentId) return
    try {
      await reviewMutation.mutateAsync({ id: previewCell.cell.documentId, status, reviewNotes: reviewNotes || undefined })
      toast.success('Statut modifié')
      closePreview()
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleQuickApprove = async (e: React.MouseEvent, cell: MemberDocCellDto) => {
    e.stopPropagation()
    if (!cell.documentId || cell.status === 'Approved') return
    try {
      await reviewMutation.mutateAsync({ id: cell.documentId, status: 'Approved' })
      toast.success('Statut modifié')
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleQuickReject = async (e: React.MouseEvent, cell: MemberDocCellDto) => {
    e.stopPropagation()
    if (!cell.documentId || cell.status === 'Rejected') return
    try {
      await reviewMutation.mutateAsync({ id: cell.documentId, status: 'Rejected' })
      toast.success('Statut modifié')
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleDownloadDoc = async () => {
    if (!previewCell?.cell.documentId || !previewCell.cell.fileName) return
    if (previewBlobUrl) {
      const a = document.createElement('a')
      a.href = previewBlobUrl
      a.download = previewCell.cell.fileName
      a.click()
    }
  }

  const handleDownloadZip = async (docTypeId?: string) => {
    setDownloading(true)
    try {
      const response = await downloadUnitDocumentsZip(unitId, docTypeId)
      const blob = new Blob([response.data], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'Documents_Unite.zip'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(parseApiError(err))
    } finally {
      setDownloading(false)
    }
  }

  // ─── Cotisation logic ──────────────────────────────
  // Open the payment dialog: prefill from the existing cotisation if one has payment lines, else seed a
  // single line at the default amount + today's date.
  const openCotisation = (member: MemberDocRowDto) => {
    setCotisationMember(member)
    setError('')
    if (member.cotisation.cotisationId && member.cotisation.payments.length > 0) {
      setCotPayments(member.cotisation.payments.map(p => ({ amount: p.amount, currency: p.currency, paymentMethod: p.paymentMethod })))
      setCotPaymentDate(member.cotisation.paymentDate ?? '')
      setCotNotes('')
    } else {
      setCotPayments([{ amount: parseFloat(defaultAmount ?? '100'), currency: 'USD', paymentMethod: 'Cash' }])
      setCotPaymentDate(new Date().toISOString().split('T')[0])
      setCotNotes('')
    }
  }

  const handleCotisationSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cotisationMember) return
    setError('')
    if (cotPayments.length === 0 || cotPayments.some(p => !(p.amount > 0))) {
      setError('Chaque ligne de paiement doit avoir un montant supérieur à 0.')
      return
    }
    try {
      // Update the year's existing cotisation, or create one — single record per (member, year).
      if (cotisationMember.cotisation.cotisationId) {
        await updateCotisation.mutateAsync({
          id: cotisationMember.cotisation.cotisationId,
          paymentDate: cotPaymentDate,
          notes: cotNotes || null,
          payments: cotPayments,
        })
      } else {
        await createCotisation.mutateAsync({
          memberId: cotisationMember.memberId,
          scoutYear: currentScoutYear,
          paymentDate: cotPaymentDate,
          notes: cotNotes || null,
          payments: cotPayments,
        })
      }
      toast.success('Cotisation enregistrée')
      setCotisationMember(null)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const isImage = previewCell?.cell.mimeType?.startsWith('image/')
  const isPdf = previewCell?.cell.mimeType === 'application/pdf'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documents & Cotisations</h1>
          <p className="text-sm text-muted-foreground">Année scoute {currentScoutYear}</p>
        </div>
        <div className="flex items-center gap-2">
          {user.unitAccess.length > 1 && (
            <Select value={unitId} onValueChange={setSelectedUnit}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {user.unitAccess.map(u => <SelectItem key={u.unitId} value={u.unitId}>{u.unitName}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => handleDownloadZip()} disabled={downloading}>
            <FileArchive className="mr-1 h-4 w-4" />{downloading ? '...' : 'ZIP'}
          </Button>
        </div>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {isLoading ? <LoadingSpinner variant="table" /> : !matrix || matrix.members.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">Aucun membre actif dans cette unité.</p>
      ) : (
        <>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground px-1">
            <span className="flex items-center gap-1.5"><span className="flex h-6 w-6 items-center justify-center rounded bg-green-50 text-green-600"><CheckCircle className="h-4 w-4" /></span> Approuvé</span>
            <span className="flex items-center gap-1.5"><span className="flex h-6 w-6 items-center justify-center rounded bg-amber-50 text-amber-600"><Clock className="h-4 w-4" /></span> En attente</span>
            <span className="flex items-center gap-1.5"><span className="flex h-6 w-6 items-center justify-center rounded bg-red-50 text-red-500"><XCircle className="h-4 w-4" /></span> Refusé</span>
            <span className="flex items-center gap-1.5"><span className="flex h-6 w-6 items-center justify-center rounded bg-red-50 text-red-500"><AlertTriangle className="h-4 w-4" /></span> Expiré</span>
            <span className="flex items-center gap-1.5"><span className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-gray-400"><Minus className="h-4 w-4" /></span> Manquant</span>
            <span className="mx-1 h-5 w-px self-center bg-border" />
            <span className="flex items-center gap-1.5"><span className="flex h-6 w-6 items-center justify-center rounded bg-green-50 text-green-700"><DollarSign className="h-4 w-4" /></span> Cotisation payée</span>
            <span className="flex items-center gap-1.5"><span className="flex h-6 w-6 items-center justify-center rounded bg-red-50 text-red-500"><Receipt className="h-4 w-4" /></span> Non payée</span>
            <span className="flex items-center gap-1.5"><span className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-slate-500"><Ban className="h-4 w-4" /></span> Ne paiera pas</span>
          </div>

          <div className="rounded-lg border shadow-sm overflow-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="sticky left-0 z-10 bg-muted/40 px-4 py-3 text-left font-semibold min-w-52">Membre</th>
                  {matrix.docTypes.map(dt => (
                    <th key={dt.id} className="px-2 py-3 text-center font-medium min-w-24">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-sm leading-tight">{dt.name}</span>
                        <button
                          className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                          onClick={() => handleDownloadZip(dt.id)}
                          title={`ZIP — ${dt.name}`}
                        >
                          <Download className="h-3 w-3" />
                        </button>
                      </div>
                    </th>
                  ))}
                  <th className="px-2 py-3 text-center font-medium min-w-28">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-xs leading-tight">Cotisation</span>
                      <span className="text-[10px] text-muted-foreground">{currentScoutYear}</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {matrix.members.map((member, idx) => {
                  // Members arrive pre-grouped by team; emit a team-name separator row at each boundary.
                  const prevMember = idx > 0 ? matrix.members[idx - 1] : null
                  const showTeamHeader = member.teamName && member.teamName !== prevMember?.teamName

                  return (
                    <>{showTeamHeader && (
                      <tr key={`team-${member.teamName}`}>
                        <td colSpan={matrix.docTypes.length + 2} className="bg-muted/30 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {member.teamName}
                        </td>
                      </tr>
                    )}
                    <tr key={member.memberId} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                      <td className="sticky left-0 z-10 bg-background px-4 py-2.5 text-[15px] font-medium">
                        {member.firstName} {member.lastName}
                      </td>
                      {member.documents.map((cell) => {
                        const docType = matrix.docTypes.find(dt => dt.id === cell.docTypeId)
                        if (!docType) return null
                        return (
                        <td
                          key={cell.docTypeId}
                          className="px-1 py-1.5 text-center"
                        >
                          <div
                            className={`group relative mx-auto flex h-11 w-11 items-center justify-center rounded-md cursor-pointer transition-all hover:scale-110 ${docStatusColor(cell)}`}
                            title={docStatusLabel(cell)}
                            tabIndex={0}
                            onClick={() => openPreview(member, cell, docType)}
                          >
                            {docStatusIcon(cell)}
                            {/* Quick approve/reject on hover/focus — show for any uploaded doc */}
                            {cell.documentId && (
                              <div className="absolute -top-1 -right-1 hidden group-hover:flex group-focus-within:flex gap-0.5">
                                {cell.status !== 'Approved' && (
                                  <button
                                    className="flex h-4 w-4 items-center justify-center rounded-full bg-green-600 text-white shadow hover:bg-green-700"
                                    onClick={(e) => handleQuickApprove(e, cell)}
                                    title="Approuver"
                                  >
                                    <CheckCircle className="h-2.5 w-2.5" />
                                  </button>
                                )}
                                {cell.status !== 'Rejected' && (
                                  <button
                                    className="flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-white shadow hover:bg-red-700"
                                    onClick={(e) => handleQuickReject(e, cell)}
                                    title="Refuser"
                                  >
                                    <XCircle className="h-2.5 w-2.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        )
                      })}
                      {/* Cotisation cell — green = payée, red = non payée, slate = ne paiera pas */}
                      <td className="px-1 py-1.5 text-center">
                        {(() => {
                          const cot = member.cotisation
                          const paid = !!cot.cotisationId && cot.payments.length > 0
                          const exempt = cot.willNotPay && !paid
                          const cls = paid ? 'bg-green-50 text-green-700' : exempt ? 'bg-slate-100 text-slate-500' : 'bg-red-50 text-red-500'
                          const title = paid
                            ? `${cot.payments.map(p => `${p.amount} ${p.currency}`).join(' + ')} — ${cot.receiptNumber}`
                            : exempt ? 'Ne paiera pas (exempté) — Cliquer pour modifier'
                            : 'Cotisation non payée — Cliquer pour enregistrer'
                          return (
                            <div
                              className={`mx-auto flex h-11 items-center justify-center gap-1 rounded-md px-2.5 cursor-pointer transition-all hover:scale-105 ${cls}`}
                              onClick={() => openCotisation(member)}
                              title={title}
                            >
                              {paid ? (
                                <><DollarSign className="h-5 w-5" /><span className="text-sm font-semibold">{cot.payments.length}</span></>
                              ) : exempt ? (
                                <Ban className="h-5 w-5" />
                              ) : (
                                <Receipt className="h-5 w-5" />
                              )}
                            </div>
                          )
                        })()}
                      </td>
                    </tr></>
                  )
                })}
              </tbody>
            </table>
          </div>

        </>
      )}

      {/* ─── Document Preview Dialog ─── */}
      <Dialog open={!!previewCell} onOpenChange={closePreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {previewCell?.member.firstName} {previewCell?.member.lastName} — {previewCell?.docType.name}
            </DialogTitle>
          </DialogHeader>

          {previewCell?.cell.documentId ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">{previewCell.cell.fileName}</span>
                {previewCell.cell.status && (
                  <Badge variant={previewCell.cell.status === 'Approved' ? 'default' : previewCell.cell.status === 'Rejected' ? 'destructive' : 'secondary'}
                    className={previewCell.cell.status === 'Approved' ? 'bg-green-600' : ''}>
                    {docStatusLabel(previewCell.cell)}
                  </Badge>
                )}
              </div>

              {/* Inline preview */}
              <div className="rounded-md border bg-muted/20 overflow-hidden flex items-center justify-center" style={{ minHeight: 200, maxHeight: 480 }}>
                {previewBlobUrl && isImage && (
                  <img src={previewBlobUrl} alt={previewCell.cell.fileName ?? ''} className="max-w-full max-h-[480px] object-contain" />
                )}
                {previewBlobUrl && isPdf && (
                  <iframe src={previewBlobUrl} className="w-full" style={{ height: 440 }} title="PDF" />
                )}
                {!previewBlobUrl && !previewError && (
                  <div className="py-12 text-sm text-muted-foreground">Chargement...</div>
                )}
                {previewError && (
                  <div className="py-12 text-sm text-destructive">Impossible de charger l'aperçu du fichier.</div>
                )}
                {previewBlobUrl && !isImage && !isPdf && (
                  <div className="py-12 text-sm text-muted-foreground">Aperçu non disponible pour ce format.</div>
                )}
              </div>

              {previewCell.cell.reviewNotes && (
                <div className="rounded-md bg-orange-50 p-2 text-sm text-orange-700">Note : {previewCell.cell.reviewNotes}</div>
              )}

              <div className="space-y-2">
                <RequiredLabel>Notes (optionnel)</RequiredLabel>
                <textarea
                  className="flex min-h-14 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Raison du refus ou remarques..."
                />
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={handleDownloadDoc}>
                  <Download className="mr-1 h-4 w-4" />Télécharger
                </Button>
                {previewCell.cell.status !== 'Rejected' && (
                  <Button variant="destructive" size="sm" onClick={() => handleReview('Rejected')} disabled={reviewMutation.isPending}>
                    <XCircle className="mr-1 h-4 w-4" />Refuser
                  </Button>
                )}
                {previewCell.cell.status !== 'Approved' && (
                  <Button size="sm" onClick={() => handleReview('Approved')} disabled={reviewMutation.isPending}>
                    <CheckCircle className="mr-1 h-4 w-4" />Approuver
                  </Button>
                )}
              </DialogFooter>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              Ce membre n'a pas encore envoyé ce document.
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Cotisation Dialog ─── */}
      <Dialog open={!!cotisationMember} onOpenChange={() => setCotisationMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Cotisation — {cotisationMember?.firstName} {cotisationMember?.lastName}
            </DialogTitle>
          </DialogHeader>

          {cotisationMember?.cotisation.cotisationId && cotisationMember.cotisation.payments.length > 0 ? (
            <div className="space-y-4">
              <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
                Cotisation enregistrée :
                {cotisationMember.cotisation.payments.map((p, i) => (
                  <div key={i}><strong>{p.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} {p.currency}</strong> ({PAYMENT_METHOD_OPTIONS.find(o => o.value === p.paymentMethod)?.label ?? p.paymentMethod})</div>
                ))}
                <br />Reçu : {cotisationMember.cotisation.receiptNumber}
                {cotisationMember.cotisation.paymentDate && <><br />Date : {new Date(cotisationMember.cotisation.paymentDate).toLocaleDateString('fr-FR')}</>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCotisationMember(null)}>Fermer</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleCotisationSubmit} className="space-y-4">
              {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
              <p className="text-sm text-muted-foreground">Année scoute : {currentScoutYear}</p>

              {cotisationMember?.cotisation.willNotPay ? (
                <div className="flex items-center justify-between rounded-md bg-slate-100 p-3 text-sm">
                  <span className="flex items-center gap-2 text-slate-600"><Ban className="h-4 w-4" />Marqué « ne paiera pas » pour cette année.</span>
                  <Button type="button" variant="outline" size="sm" disabled={setExempt.isPending}
                    onClick={() => cotisationMember && toggleExempt(cotisationMember, false)}>Retirer l'exemption</Button>
                </div>
              ) : (
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" size="sm" className="text-slate-600 hover:text-slate-800" disabled={setExempt.isPending}
                    onClick={() => cotisationMember && toggleExempt(cotisationMember, true)}>
                    <Ban className="mr-1 h-3.5 w-3.5" />Ce membre ne paiera pas
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <RequiredLabel required>Date de paiement</RequiredLabel>
                <Input type="date" value={cotPaymentDate} onChange={(e) => setCotPaymentDate(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <RequiredLabel required>Paiements</RequiredLabel>
                  <Button type="button" variant="outline" size="sm" onClick={() => setCotPayments(p => [...p, { amount: 0, currency: 'USD', paymentMethod: 'Cash' }])}>
                    <Plus className="mr-1 h-3 w-3" />Ligne
                  </Button>
                </div>
                {cotPayments.map((p, idx) => (
                  <div key={idx} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Input type="number" step="0.01" min="0" placeholder="Montant" value={p.amount} onChange={(e) => setCotPayments(prev => prev.map((pp, i) => i === idx ? { ...pp, amount: parseFloat(e.target.value) || 0 } : pp))} required />
                    </div>
                    <Select value={p.currency} onValueChange={(v) => setCotPayments(prev => prev.map((pp, i) => i === idx ? { ...pp, currency: v } : pp))}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.value}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={p.paymentMethod} onValueChange={(v) => setCotPayments(prev => prev.map((pp, i) => i === idx ? { ...pp, paymentMethod: v } : pp))}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {cotPayments.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setCotPayments(prev => prev.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setCotisationMember(null)}>Annuler</Button>
                <Button type="submit" disabled={createCotisation.isPending}>
                  {createCotisation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
