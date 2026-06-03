import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useSettingValue } from '@/services/settings-service'
import {
  useUnitDocumentsMatrix, useReviewDocumentMatrix, downloadDocument, downloadUnitDocumentsZip,
  type MemberDocRowDto, type MemberDocCellDto, type DocTypeColumnDto
} from '@/services/document-service'
import { useCreateCotisation, useUpdateCotisation } from '@/services/cotisation-service'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Download, CheckCircle, XCircle, Clock, AlertTriangle, Minus, FileArchive, DollarSign, Receipt } from 'lucide-react'

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
  if (!cell.documentId) return <Minus className="h-4 w-4" />
  if (cell.isExpired) return <AlertTriangle className="h-4 w-4" />
  switch (cell.status) {
    case 'Approved': return <CheckCircle className="h-4 w-4" />
    case 'Rejected': return <XCircle className="h-4 w-4" />
    default: return <Clock className="h-4 w-4" />
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

export default function UnitDocumentsPage() {
  const user = useAuthStore((s) => s.user)
  const currentSchoolYear = useSettingValue('cotisation.current_school_year') ?? '2025-2026'
  const defaultAmount = useSettingValue('cotisation.default_amount')
  const [selectedUnit, setSelectedUnit] = useState<string>(user?.unitAccess[0]?.unitId ?? '')

  const unitId = selectedUnit || user?.unitAccess[0]?.unitId || ''
  const { data: matrix, isLoading } = useUnitDocumentsMatrix(unitId, currentSchoolYear)
  const reviewMutation = useReviewDocumentMatrix(unitId)

  // Preview state
  const [previewCell, setPreviewCell] = useState<{ cell: MemberDocCellDto; member: MemberDocRowDto; docType: DocTypeColumnDto } | null>(null)
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState(false)
  const [reviewNotes, setReviewNotes] = useState('')

  // Cotisation dialog state
  const [cotisationMember, setCotisationMember] = useState<MemberDocRowDto | null>(null)
  const [cotForm, setCotForm] = useState({ amountPaid: 0, currency: 'USD', paymentDate: '', paymentMethod: 'Cash', notes: '' })
  const createCotisation = useCreateCotisation('')
  const updateCotisation = useUpdateCotisation('')

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
    // Fetch blob for preview
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
  const openCotisation = (member: MemberDocRowDto) => {
    setCotisationMember(member)
    setError('')
    if (member.cotisation.cotisationId) {
      setCotForm({
        amountPaid: member.cotisation.amountPaid ?? 0,
        currency: member.cotisation.currency ?? 'USD',
        paymentDate: member.cotisation.paymentDate ?? '',
        paymentMethod: member.cotisation.paymentMethod ?? 'Cash',
        notes: '',
      })
    } else {
      setCotForm({
        amountPaid: parseFloat(defaultAmount ?? '100'),
        currency: 'USD',
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'Cash',
        notes: '',
      })
    }
  }

  const handleCotisationSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cotisationMember) return
    setError('')
    try {
      if (cotisationMember.cotisation.cotisationId) {
        await updateCotisation.mutateAsync({
          id: cotisationMember.cotisation.cotisationId,
          amountPaid: cotForm.amountPaid,
          currency: cotForm.currency,
          paymentDate: cotForm.paymentDate,
          paymentMethod: cotForm.paymentMethod,
          notes: cotForm.notes || null,
        })
      } else {
        await createCotisation.mutateAsync({
          memberId: cotisationMember.memberId,
          schoolYear: currentSchoolYear,
          amountPaid: cotForm.amountPaid,
          currency: cotForm.currency,
          paymentDate: cotForm.paymentDate,
          paymentMethod: cotForm.paymentMethod,
          notes: cotForm.notes || null,
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
          <p className="text-sm text-muted-foreground">Année scoute {currentSchoolYear}</p>
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

      {isLoading ? <LoadingSpinner /> : !matrix || matrix.members.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">Aucun membre actif dans cette unité.</p>
      ) : (
        <>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground px-1">
            <span className="flex items-center gap-1.5"><span className="flex h-5 w-5 items-center justify-center rounded bg-green-50 text-green-600"><CheckCircle className="h-3 w-3" /></span> Approuvé</span>
            <span className="flex items-center gap-1.5"><span className="flex h-5 w-5 items-center justify-center rounded bg-amber-50 text-amber-600"><Clock className="h-3 w-3" /></span> En attente</span>
            <span className="flex items-center gap-1.5"><span className="flex h-5 w-5 items-center justify-center rounded bg-red-50 text-red-500"><XCircle className="h-3 w-3" /></span> Refusé</span>
            <span className="flex items-center gap-1.5"><span className="flex h-5 w-5 items-center justify-center rounded bg-red-50 text-red-500"><AlertTriangle className="h-3 w-3" /></span> Expiré</span>
            <span className="flex items-center gap-1.5"><span className="flex h-5 w-5 items-center justify-center rounded bg-gray-100 text-gray-400"><Minus className="h-3 w-3" /></span> Manquant</span>
          </div>

          <div className="rounded-lg border shadow-sm overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="sticky left-0 z-10 bg-muted/40 px-4 py-3 text-left font-semibold min-w-52">Membre</th>
                  {matrix.docTypes.map(dt => (
                    <th key={dt.id} className="px-2 py-3 text-center font-medium min-w-24">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-xs leading-tight">{dt.name}</span>
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
                      <span className="text-[10px] text-muted-foreground">{currentSchoolYear}</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {matrix.members.map((member, idx) => {
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
                      <td className="sticky left-0 z-10 bg-background px-4 py-2.5 font-medium">
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
                            className={`group relative mx-auto flex h-9 w-9 items-center justify-center rounded-md cursor-pointer transition-all hover:scale-110 ${docStatusColor(cell)}`}
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
                      {/* Cotisation cell */}
                      <td className="px-1 py-1.5 text-center">
                        <div
                          className={`mx-auto flex h-9 items-center justify-center gap-1 rounded-md px-2 cursor-pointer transition-all hover:scale-105 ${
                            member.cotisation.cotisationId
                              ? 'bg-green-50 text-green-700'
                              : 'bg-gray-50 text-gray-400'
                          }`}
                          onClick={() => openCotisation(member)}
                          title={member.cotisation.cotisationId
                            ? `${member.cotisation.amountPaid} ${member.cotisation.currency} — ${member.cotisation.receiptNumber}`
                            : 'Cotisation non payée — Cliquer pour enregistrer'
                          }
                        >
                          {member.cotisation.cotisationId ? (
                            <>
                              <DollarSign className="h-3.5 w-3.5" />
                              <span className="text-xs font-medium">{member.cotisation.amountPaid}</span>
                            </>
                          ) : (
                            <Receipt className="h-3.5 w-3.5" />
                          )}
                        </div>
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

          {cotisationMember?.cotisation.cotisationId ? (
            <div className="space-y-4">
              <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
                Cotisation déjà enregistrée : <strong>{cotisationMember.cotisation.amountPaid} {cotisationMember.cotisation.currency}</strong>
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
              <p className="text-sm text-muted-foreground">Année scoute : {currentSchoolYear}</p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <RequiredLabel required>Montant</RequiredLabel>
                  <Input type="number" step="0.01" min="0" value={cotForm.amountPaid} onChange={(e) => setCotForm(f => ({ ...f, amountPaid: parseFloat(e.target.value) || 0 }))} required />
                </div>
                <div className="space-y-2">
                  <RequiredLabel required>Devise</RequiredLabel>
                  <Select value={cotForm.currency} onValueChange={(v) => setCotForm(f => ({ ...f, currency: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.value} ({o.label})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <RequiredLabel required>Date de paiement</RequiredLabel>
                  <Input type="date" value={cotForm.paymentDate} onChange={(e) => setCotForm(f => ({ ...f, paymentDate: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <RequiredLabel required>Mode de paiement</RequiredLabel>
                  <Select value={cotForm.paymentMethod} onValueChange={(v) => setCotForm(f => ({ ...f, paymentMethod: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
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
