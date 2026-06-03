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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Upload, Download, CheckCircle, XCircle, Trash2, FileText, Clock, AlertTriangle, Minus } from 'lucide-react'

function statusBadge(status: string, isExpired: boolean) {
  if (isExpired) return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Expiré</Badge>
  switch (status) {
    case 'Approved': return <Badge className="gap-1 bg-green-600"><CheckCircle className="h-3 w-3" />Approuvé</Badge>
    case 'Rejected': return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Refusé</Badge>
    default: return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />En attente</Badge>
  }
}

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

  const canUpload = isOwnProfile || hasPermission(PERMISSIONS.DOCUMENTS_CREATE)

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />Documents requis</CardTitle>
        </CardHeader>
        <CardContent>
          {!docTypes || docTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun type de document actif.</p>
          ) : (
            <div className="space-y-2">
              {docTypes.map(dt => {
                const doc = getDocForType(dt.id)
                return (
                  <div key={dt.id} className="flex items-center gap-3 rounded-md border p-3">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-sm">{dt.name}</span>
                      {doc && (
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span>{doc.fileName}</span>
                          {doc.expiryDate && <span>Expire : {new Date(doc.expiryDate).toLocaleDateString('fr-FR')}</span>}
                          {doc.reviewNotes && <span className="text-orange-600">Note : {doc.reviewNotes}</span>}
                        </div>
                      )}
                    </div>

                    {/* Status */}
                    <div className="shrink-0">
                      {doc ? statusBadge(doc.status, doc.isExpired) : (
                        <Badge variant="outline" className="gap-1 text-muted-foreground"><Minus className="h-3 w-3" />Manquant</Badge>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-1">
                      {doc && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(doc)} title="Télécharger">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {doc && doc.status !== 'Approved' && hasPermission(PERMISSIONS.DOCUMENTS_APPROVE) && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleQuickReview(doc.id, 'Approved')} title="Approuver">
                          <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                        </Button>
                      )}
                      {doc && doc.status !== 'Rejected' && hasPermission(PERMISSIONS.DOCUMENTS_APPROVE) && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setReviewOpen(doc); setReviewNotes('') }} title="Refuser">
                          <XCircle className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      )}
                      {doc && hasPermission(PERMISSIONS.DOCUMENTS_DELETE) && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(doc)} title="Supprimer">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                      {canUpload && (!doc || doc.status === 'Rejected') && (
                        <Button
                          variant={doc ? 'outline' : 'default'}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            if (dt.requiresExpiry) {
                              setUploadingDocTypeId(dt.id)
                              setExpiryDate('')
                            } else {
                              // Trigger file input directly
                              setUploadingDocTypeId(dt.id)
                              setTimeout(() => fileInputRef.current?.click(), 50)
                            }
                          }}
                          disabled={uploadMutation.isPending}
                        >
                          <Upload className="mr-1 h-3 w-3" />
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
              <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span>{uploadProgress}%</span>
            </div>
          )}
        </CardContent>
      </Card>

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
