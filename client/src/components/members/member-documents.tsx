import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { useState, useRef } from 'react'
import { useMemberDocuments, useUploadDocument, useReviewDocument, useDeleteDocument, downloadDocument, type MemberDocumentDto } from '@/services/document-service'
import { useDocumentTypeList, type DocumentTypeListDto } from '@/services/document-type-service'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Upload, Download, CheckCircle, XCircle, Trash2, FileText, Clock, AlertTriangle, Minus } from 'lucide-react'

// Status badge for a doc. Expiry overrides the workflow status (an expired doc reads "Expiré"
// regardless of approval). Workflow: upload → "En attente" → "Approuvé" / "Refusé".
function statusBadge(status: string, isExpired: boolean) {
  if (isExpired) return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Expiré</Badge>
  switch (status) {
    case 'Approved': return <Badge className="gap-1 bg-green-600"><CheckCircle className="h-3 w-3" />Approuvé</Badge>
    case 'Rejected': return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Refusé</Badge>
    default: return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />En attente</Badge>
  }
}

// "Documents" tab of the member detail page / Ma fiche. Renders ONE row per active document
// TYPE (not per uploaded file) showing the latest file's status, so the dossier reads as a
// checklist of required docs. Upload→pending→approve/reject workflow: the member (own profile)
// or a leader uploads; reviewers with DOCUMENTS_APPROVE quick-approve or open the reject dialog
// (with notes). isOwnProfile lets a member upload their own docs even without DOCUMENTS_CREATE.
interface Props {
  memberId: string
  isOwnProfile?: boolean
}

export function MemberDocuments({ memberId, isOwnProfile }: Props) {
  const { hasPermission } = useAuthStore()
  const { data: documents, isLoading } = useMemberDocuments(memberId)
  const { data: docTypes } = useDocumentTypeList()
  const uploadMutation = useUploadDocument(memberId)
  const reviewMutation = useReviewDocument(memberId)
  const deleteMutation = useDeleteDocument(memberId)

  const [reviewOpen, setReviewOpen] = useState<MemberDocumentDto | null>(null)
  const [deleting, setDeleting] = useState<MemberDocumentDto | null>(null)
  const [error, setError] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')

  // For inline upload per doc type
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadingDocTypeId, setUploadingDocTypeId] = useState<string | null>(null)
  const [expiryDate, setExpiryDate] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUploadForType = async (docType: DocumentTypeListDto, file: File) => {
    setError('')
    const today = new Date().toISOString().split('T')[0]
    const formData = new FormData()
    formData.append('memberId', memberId)
    formData.append('documentTypeId', docType.id)
    formData.append('title', docType.name)
    formData.append('file', file)
    formData.append('issuedDate', today)
    if (expiryDate) formData.append('expiryDate', expiryDate)

    try {
      await uploadMutation.mutateAsync({ formData, onUploadProgress: setUploadProgress })
      toast.success('Document envoyé')
      setUploadProgress(null)
      setUploadingDocTypeId(null)
      setExpiryDate('')
    } catch (err) {
      setUploadProgress(null)
      setError(parseApiError(err))
    }
  }

  const handleQuickReview = async (docId: string, status: string) => {
    try {
      await reviewMutation.mutateAsync({ id: docId, status })
      toast.success('Statut modifié')
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleReview = async (status: string) => {
    if (!reviewOpen) return
    try {
      await reviewMutation.mutateAsync({ id: reviewOpen.id, status, reviewNotes: reviewNotes || undefined })
      toast.success('Statut modifié')
      setReviewOpen(null)
      setReviewNotes('')
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleDownload = async (doc: MemberDocumentDto) => {
    try {
      const response = await downloadDocument(doc.id)
      const blob = new Blob([response.data], { type: doc.mimeType })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.fileName
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteMutation.mutateAsync(deleting.id)
      setDeleting(null)
    } catch (err) {
      setError(parseApiError(err))
      setDeleting(null)
    }
  }

  if (isLoading) return <LoadingSpinner />

  // For each active doc type, find the latest uploaded document
  const getDocForType = (docTypeId: string) =>
    documents?.filter(d => d.documentTypeId === docTypeId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null

  // A member may always upload to their own dossier; otherwise it requires the create permission.
  const canUpload = isOwnProfile || hasPermission(PERMISSIONS.DOCUMENTS_CREATE)

  // Compute progress stats
  const docStats = docTypes ? {
    total: docTypes.length,
    approved: docTypes.filter(dt => getDocForType(dt.id)?.status === 'Approved').length,
    pending: docTypes.filter(dt => { const d = getDocForType(dt.id); return d && d.status !== 'Approved' && d.status !== 'Rejected'; }).length,
    rejected: docTypes.filter(dt => getDocForType(dt.id)?.status === 'Rejected').length,
    missing: docTypes.filter(dt => !getDocForType(dt.id)).length,
  } : null

  const statusColor = (doc: MemberDocumentDto | null) => {
    if (!doc) return 'border-l-gray-300'
    if (doc.isExpired) return 'border-l-red-500'
    switch (doc.status) {
      case 'Approved': return 'border-l-green-500'
      case 'Rejected': return 'border-l-red-500'
      default: return 'border-l-amber-400'
    }
  }

  const statusBg = (doc: MemberDocumentDto | null) => {
    if (!doc) return 'bg-gray-50'
    if (doc.isExpired) return 'bg-red-50/50'
    switch (doc.status) {
      case 'Approved': return 'bg-green-50/50'
      case 'Rejected': return 'bg-red-50/50'
      default: return 'bg-amber-50/50'
    }
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {/* Progress summary */}
      {docStats && docStats.total > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium">Dossier {docStats.approved === docStats.total ? 'complet' : 'en cours'}</span>
              <span className="text-sm font-semibold">{docStats.approved}/{docStats.total}</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${Math.round((docStats.approved / docStats.total) * 100)}%` }} />
            </div>
          </div>
          <div className="flex gap-3 text-xs">
            {docStats.approved > 0 && <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-500" />{docStats.approved} approuvé{docStats.approved > 1 ? 's' : ''}</span>}
            {docStats.pending > 0 && <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />{docStats.pending} en attente</span>}
            {docStats.rejected > 0 && <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />{docStats.rejected} refusé{docStats.rejected > 1 ? 's' : ''}</span>}
            {docStats.missing > 0 && <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-gray-300" />{docStats.missing} manquant{docStats.missing > 1 ? 's' : ''}</span>}
          </div>
        </div>
      )}

      {!docTypes || docTypes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Aucun type de document actif.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {docTypes.map(dt => {
            const doc = getDocForType(dt.id)
            return (
              <div key={dt.id} className={`flex items-center gap-4 rounded-lg border border-l-4 ${statusColor(doc)} ${statusBg(doc)} p-4`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{dt.name}</span>
                    {doc ? statusBadge(doc.status, doc.isExpired) : (
                      <Badge variant="outline" className="gap-1 text-muted-foreground text-xs"><Minus className="h-3 w-3" />Manquant</Badge>
                    )}
                  </div>
                  {doc && (
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{doc.fileName}</span>
                      {doc.expiryDate && <span>Expire : {new Date(doc.expiryDate).toLocaleDateString('fr-FR')}</span>}
                      <span>Envoyé : {new Date(doc.createdAt!).toLocaleDateString('fr-FR')}</span>
                    </div>
                  )}
                  {doc?.reviewNotes && (
                    <p className="mt-1 text-xs text-orange-600 font-medium">Note : {doc.reviewNotes}</p>
                  )}
                  {!doc && (
                    <p className="mt-1 text-xs text-muted-foreground">Aucun document envoyé</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {doc && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(doc)} title="Télécharger">
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  {doc && doc.status !== 'Approved' && hasPermission(PERMISSIONS.DOCUMENTS_APPROVE) && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleQuickReview(doc.id, 'Approved')} title="Approuver">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </Button>
                  )}
                  {doc && doc.status !== 'Rejected' && hasPermission(PERMISSIONS.DOCUMENTS_APPROVE) && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setReviewOpen(doc); setReviewNotes('') }} title="Refuser">
                      <XCircle className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                  {doc && hasPermission(PERMISSIONS.DOCUMENTS_DELETE) && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleting(doc)} title="Supprimer">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                  {/* Upload only offered when nothing is on file or the last one was rejected ("Renvoyer"). */}
                  {canUpload && (!doc || doc.status === 'Rejected') && (
                    <Button
                      variant={doc ? 'outline' : 'default'}
                      size="sm"
                      onClick={() => {
                        // Doc types that require an expiry first open a dialog to capture the date;
                        // the rest jump straight to the file picker (timeout lets state settle first).
                        if (dt.requiresExpiry) {
                          setUploadingDocTypeId(dt.id)
                          setExpiryDate('')
                        } else {
                          setUploadingDocTypeId(dt.id)
                          setTimeout(() => fileInputRef.current?.click(), 50)
                        }
                      }}
                      disabled={uploadMutation.isPending}
                    >
                      <Upload className="mr-1.5 h-4 w-4" />
                      {doc?.status === 'Rejected' ? 'Renvoyer' : 'Envoyer'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {uploadProgress !== null && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-2 w-32 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
          <span>{uploadProgress}%</span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">Formats : PDF, JPG, PNG — Max 10 Mo</p>

      {/* Hidden file input for direct upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file && uploadingDocTypeId) {
            const dt = docTypes?.find(d => d.id === uploadingDocTypeId)
            if (dt) handleUploadForType(dt, file)
          }
          e.target.value = ''
        }}
      />

      {/* Expiry date dialog (for doc types that require it) */}
      <Dialog open={!!uploadingDocTypeId && !!docTypes?.find(d => d.id === uploadingDocTypeId)?.requiresExpiry} onOpenChange={() => setUploadingDocTypeId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Date d'expiration requise</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ce document nécessite une date d'expiration. Veuillez la saisir avant d'envoyer le fichier.
            </p>
            <div className="space-y-2">
              <RequiredLabel required>Date d'expiration</RequiredLabel>
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadingDocTypeId(null)}>Annuler</Button>
              <Button disabled={!expiryDate} onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-1 h-4 w-4" />Choisir le fichier
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={!!reviewOpen} onOpenChange={() => setReviewOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Changer le statut du document</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">Document : <span className="font-medium">{reviewOpen?.title}</span></p>
            <p className="text-sm text-muted-foreground">Statut actuel : {reviewOpen?.status === 'Approved' ? 'Approuvé' : reviewOpen?.status === 'Rejected' ? 'Refusé' : 'En attente'}</p>
            <div className="space-y-2">
              <RequiredLabel>Notes (optionnel)</RequiredLabel>
              <textarea
                className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Raison du refus ou remarques..."
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReviewOpen(null)}>Annuler</Button>
              {reviewOpen?.status !== 'Rejected' && (
                <Button variant="destructive" onClick={() => handleReview('Rejected')} disabled={reviewMutation.isPending}>
                  <XCircle className="mr-1 h-4 w-4" />Refuser
                </Button>
              )}
              {reviewOpen?.status !== 'Approved' && (
                <Button onClick={() => handleReview('Approved')} disabled={reviewMutation.isPending}>
                  <CheckCircle className="mr-1 h-4 w-4" />Approuver
                </Button>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Supprimer le document"
        description={`Êtes-vous sûr de vouloir supprimer « ${deleting?.title} » ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
