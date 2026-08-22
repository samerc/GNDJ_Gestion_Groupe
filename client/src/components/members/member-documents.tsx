import { parseApiError, parseBlobError } from '@/lib/error-utils'
import { saveBlob } from '@/lib/download'
import { toast } from 'sonner'
import { useState, useRef } from 'react'
import { useMemberDocuments, useUploadDocument, useReviewDocument, useDeleteDocument, useAddDocumentPages, useDeleteDocumentPage, downloadDocument, downloadDocumentPage, type MemberDocumentDto, type DocumentPageDto } from '@/services/document-service'
import { useDocumentTypeList, type DocumentTypeListDto } from '@/services/document-type-service'
import { useSettingValue, useSettingArray } from '@/services/settings-service'
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
import { Tip } from '@/components/ui/tooltip'
import { Upload, Download, CheckCircle, XCircle, Trash2, FileText, Clock, AlertTriangle, Minus, Files, Plus, Camera } from 'lucide-react'

// Status badge for a doc. Expiry overrides the workflow status (an expired doc reads "Expiré"
// regardless of approval). Workflow: upload → "En attente" → "Accepté" / "Refusé".
function statusBadge(status: string, isExpired: boolean) {
  if (isExpired) return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Expiré</Badge>
  switch (status) {
    case 'Approved': return <Badge className="gap-1 bg-green-600"><CheckCircle className="h-3 w-3" />Accepté</Badge>
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
  const addPagesMutation = useAddDocumentPages(memberId)
  const deletePageMutation = useDeleteDocumentPage(memberId)

  // Upload limits come from settings (documents.max_file_size_mb / documents.allowed_file_types) — shown to
  // the user AND enforced client-side — so the on-screen text always matches what the server actually accepts.
  const maxSizeMb = Number(useSettingValue('documents.max_file_size_mb')) || 5
  const allowedTypesRaw = useSettingArray('documents.allowed_file_types')
  const allowedTypes = allowedTypesRaw.length > 0 ? allowedTypesRaw : ['pdf', 'jpg', 'jpeg', 'png']
  const acceptAttr = allowedTypes.map((t) => '.' + t).join(',')
  const formatsLabel = [...new Set(allowedTypes.map((t) => t.toUpperCase()))].join(', ')

  const [reviewOpen, setReviewOpen] = useState<MemberDocumentDto | null>(null)
  const [deleting, setDeleting] = useState<MemberDocumentDto | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')

  // For inline upload per doc type
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadingDocTypeId, setUploadingDocTypeId] = useState<string | null>(null)
  const [expiryDate, setExpiryDate] = useState('')
  const [pagesDoc, setPagesDoc] = useState<MemberDocumentDto | null>(null) // "pages" viewer for a multi-file doc
  const [dragOverId, setDragOverId] = useState<string | null>(null) // doc-type row currently under a file drag
  const [pendingFiles, setPendingFiles] = useState<File[]>([]) // files dropped on a requires-expiry row, awaiting the date
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null) // mobile: capture="environment" opens the camera
  const addPageRef = useRef<HTMLInputElement>(null)

  // Client-side guard (matches the server) so a bad file gets an instant, readable message. Returns an error or null.
  const validateFiles = (files: File[]): string | null => {
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (!allowedTypes.includes(ext)) return `Type de fichier non autorisé (${file.name}). Formats acceptés : ${formatsLabel}.`
      if (file.size > maxSizeMb * 1024 * 1024) return `Le fichier « ${file.name} » est trop volumineux (max ${maxSizeMb} Mo).`
    }
    return null
  }

  // Upload one or several files as a document. Several files → one document with multiple pages (e.g. an ID's
  // front + back). The server appends to an existing pending document of the same type, so this also acts as
  // "send the rest of the pages" without creating a duplicate.
  const handleUploadForType = async (docType: DocumentTypeListDto, files: File[]) => {
    const err = validateFiles(files)
    if (err) { toast.error(err); return }
    const today = new Date().toISOString().split('T')[0]
    const formData = new FormData()
    formData.append('memberId', memberId)
    formData.append('documentTypeId', docType.id)
    formData.append('title', docType.name)
    for (const file of files) formData.append('files', file)
    formData.append('issuedDate', today)
    if (expiryDate) formData.append('expiryDate', expiryDate)

    try {
      await uploadMutation.mutateAsync({ formData, onUploadProgress: setUploadProgress })
      toast.success(files.length > 1 ? `${files.length} fichiers envoyés` : 'Document envoyé')
      setUploadProgress(null)
      setUploadingDocTypeId(null)
      setExpiryDate('')
      setPendingFiles([])
    } catch (err) {
      setUploadProgress(null)
      toast.error(parseApiError(err))
    }
  }

  // Drag-and-drop files onto a doc-type row. A type that requires an expiry stashes the files and opens the
  // date dialog first (then "Envoyer" uploads them); otherwise it uploads immediately.
  const handleRowDrop = (dt: DocumentTypeListDto, e: React.DragEvent) => {
    e.preventDefault()
    setDragOverId(null)
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    if (dt.requiresExpiry && !expiryDate) {
      setUploadingDocTypeId(dt.id)
      setExpiryDate('')
      setPendingFiles(files)
    } else {
      handleUploadForType(dt, files)
    }
  }

  // Add extra page(s) to an existing document (the "Ajouter une page" action in the pages viewer).
  const handleAddPages = async (documentId: string, files: File[]) => {
    const err = validateFiles(files)
    if (err) { toast.error(err); return }
    const formData = new FormData()
    for (const file of files) formData.append('files', file)
    try {
      await addPagesMutation.mutateAsync({ documentId, formData, onUploadProgress: setUploadProgress })
      toast.success(files.length > 1 ? `${files.length} pages ajoutées` : 'Page ajoutée')
      setUploadProgress(null) // dialog stays open; the pager refreshes from the invalidated query
    } catch (err) {
      setUploadProgress(null)
      toast.error(parseApiError(err))
    }
  }

  const handleDeletePage = async (pageId: string) => {
    try {
      await deletePageMutation.mutateAsync(pageId)
      toast.success('Page supprimée')
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const handleDownloadPage = async (doc: MemberDocumentDto, page: DocumentPageDto) => {
    try {
      const response = page.isPrimary ? await downloadDocument(doc.id) : await downloadDocumentPage(page.pageId!)
      saveBlob(response.data, page.fileName, page.mimeType)
    } catch (err) {
      toast.error(await parseBlobError(err))
    }
  }

  const handleQuickReview = async (docId: string, status: string) => {
    try {
      await reviewMutation.mutateAsync({ id: docId, status })
      toast.success('Statut modifié')
    } catch (err) {
      toast.error(parseApiError(err))
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
      toast.error(parseApiError(err))
    }
  }

  const handleDownload = async (doc: MemberDocumentDto) => {
    try {
      const response = await downloadDocument(doc.id)
      saveBlob(response.data, doc.fileName, doc.mimeType)
    } catch (err) {
      // Blob download (a missing/locked file returns a JSON 404 body as a Blob) — read the real message.
      toast.error(await parseBlobError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteMutation.mutateAsync(deleting.id)
      setDeleting(null)
    } catch (err) {
      toast.error(parseApiError(err))
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
            {docStats.approved > 0 && <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-500" />{docStats.approved} accepté{docStats.approved > 1 ? 's' : ''}</span>}
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
            // A row accepts dropped files when the user may upload AND the doc isn't a still-valid approved one.
            const uploadable = canUpload && (!doc || doc.status !== 'Approved' || doc.isExpired)
            return (
              <div key={dt.id}
                onDragOver={uploadable ? (e) => { e.preventDefault(); setDragOverId(dt.id) } : undefined}
                onDragLeave={uploadable ? () => setDragOverId(prev => prev === dt.id ? null : prev) : undefined}
                onDrop={uploadable ? (e) => handleRowDrop(dt, e) : undefined}
                className={`flex items-center gap-4 rounded-lg border border-l-4 ${statusColor(doc)} ${statusBg(doc)} p-4 ${dragOverId === dt.id ? 'ring-2 ring-primary ring-offset-1' : ''}`}>
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
                      {doc.pages.length > 1 && (
                        <button className="flex items-center gap-1 text-primary hover:underline" onClick={() => setPagesDoc(doc)}>
                          <Files className="h-3 w-3" />{doc.pages.length} pages
                        </button>
                      )}
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
                    <Tip content="Télécharger le document"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(doc)}>
                      <Download className="h-4 w-4" />
                    </Button></Tip>
                  )}
                  {doc && doc.status !== 'Approved' && hasPermission(PERMISSIONS.DOCUMENTS_APPROVE) && (
                    <Tip content="Accepter"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleQuickReview(doc.id, 'Approved')}>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </Button></Tip>
                  )}
                  {/* Show for any status so an already-refused doc can be reopened to add/edit the reason;
                      pre-fill the existing note so editing keeps it. */}
                  {doc && hasPermission(PERMISSIONS.DOCUMENTS_APPROVE) && (
                    <Tip content={doc.status === 'Rejected' ? 'Modifier le motif du refus' : 'Refuser'}><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setReviewOpen(doc); setReviewNotes(doc.reviewNotes ?? '') }}>
                      <XCircle className="h-4 w-4 text-red-500" />
                    </Button></Tip>
                  )}
                  {doc && hasPermission(PERMISSIONS.DOCUMENTS_DELETE) && (
                    <Tip content="Supprimer"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleting(doc)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button></Tip>
                  )}
                  {/* Upload offered unless a valid (approved, non-expired) doc is already on file. So a member
                      can (re)send a missing / pending / rejected / expired doc themselves ("Renvoyer") — an
                      APPROVED and still-valid doc is locked (only a leader can change it). Fixes members being
                      stuck on a mistaken pending upload they can't delete. */}
                  {uploadable && (
                    <>
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
                        {doc ? 'Renvoyer' : 'Envoyer'}
                      </Button>
                      {/* Mobile: opens the camera to photograph the document (capture="environment"). On desktop
                          it just opens an image picker — harmless. Requires-expiry types go via the date dialog. */}
                      <Tip content="Prendre une photo">
                        <Button variant="ghost" size="icon" className="h-8 w-8"
                          onClick={() => {
                            if (dt.requiresExpiry) { setUploadingDocTypeId(dt.id); setExpiryDate('') }
                            else { setUploadingDocTypeId(dt.id); setTimeout(() => cameraInputRef.current?.click(), 50) }
                          }}
                          disabled={uploadMutation.isPending}>
                          <Camera className="h-4 w-4" />
                        </Button>
                      </Tip>
                    </>
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

      <p className="text-xs text-muted-foreground">Formats : {formatsLabel} — Max {maxSizeMb} Mo. Astuce : glissez-déposez un fichier sur la ligne, ou sélectionnez plusieurs fichiers pour un document à plusieurs pages (recto/verso). Sur mobile, l'icône appareil photo prend une photo du document.</p>

      {/* Hidden file input for direct upload (multiple = one document with several pages, e.g. ID front + back) */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptAttr}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : []
          if (files.length > 0 && uploadingDocTypeId) {
            const dt = docTypes?.find(d => d.id === uploadingDocTypeId)
            if (dt) handleUploadForType(dt, files)
          }
          e.target.value = ''
        }}
      />
      {/* Hidden camera input — capture="environment" opens the rear camera on mobile to photograph the document */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : []
          if (files.length > 0 && uploadingDocTypeId) {
            const dt = docTypes?.find(d => d.id === uploadingDocTypeId)
            if (dt) handleUploadForType(dt, files)
          }
          e.target.value = ''
        }}
      />
      {/* Hidden file input for adding pages to an existing document (from the pages viewer) */}
      <input
        ref={addPageRef}
        type="file"
        accept={acceptAttr}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : []
          if (files.length > 0 && pagesDoc) handleAddPages(pagesDoc.id, files)
          e.target.value = ''
        }}
      />

      {/* Expiry date dialog (for doc types that require it) */}
      <Dialog open={!!uploadingDocTypeId && !!docTypes?.find(d => d.id === uploadingDocTypeId)?.requiresExpiry}
        onOpenChange={() => { setUploadingDocTypeId(null); setPendingFiles([]) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Date d'expiration requise</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {pendingFiles.length > 0
                ? `Ce document nécessite une date d'expiration. Saisissez-la puis envoyez (${pendingFiles.length} fichier${pendingFiles.length > 1 ? 's' : ''}).`
                : "Ce document nécessite une date d'expiration. Veuillez la saisir avant d'envoyer le fichier."}
            </p>
            <div className="space-y-2">
              <RequiredLabel required>Date d'expiration</RequiredLabel>
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setUploadingDocTypeId(null); setPendingFiles([]) }}>Annuler</Button>
              {pendingFiles.length > 0 ? (
                // Files were drag-dropped onto the row — upload them once the date is set.
                <Button disabled={!expiryDate || uploadMutation.isPending} onClick={() => {
                  const dt = docTypes?.find(d => d.id === uploadingDocTypeId)
                  if (dt) handleUploadForType(dt, pendingFiles)
                }}>
                  <Upload className="mr-1 h-4 w-4" />Envoyer
                </Button>
              ) : (
                <>
                  <Button variant="outline" disabled={!expiryDate || uploadMutation.isPending} onClick={() => cameraInputRef.current?.click()}>
                    <Camera className="mr-1 h-4 w-4" />Photo
                  </Button>
                  <Button disabled={!expiryDate || uploadMutation.isPending} onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-1 h-4 w-4" />Choisir le fichier
                  </Button>
                </>
              )}
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
            <p className="text-sm text-muted-foreground">Statut actuel : {reviewOpen?.status === 'Approved' ? 'Accepté' : reviewOpen?.status === 'Rejected' ? 'Refusé' : 'En attente'}</p>
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
              {/* Always available: on an already-refused doc this re-saves the (edited) reason, keeping it refused. */}
              <Button variant="destructive" onClick={() => handleReview('Rejected')} disabled={reviewMutation.isPending}>
                <XCircle className="mr-1 h-4 w-4" />{reviewOpen?.status === 'Rejected' ? 'Enregistrer le motif' : 'Refuser'}
              </Button>
              {reviewOpen?.status !== 'Approved' && (
                <Button onClick={() => handleReview('Approved')} disabled={reviewMutation.isPending}>
                  <CheckCircle className="mr-1 h-4 w-4" />Accepter
                </Button>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pages viewer — all files of a multi-page document (download each; a leader can delete extra pages;
          the member/leader can add pages). Rendered from the LIVE document so it refreshes after add/delete. */}
      {(() => {
        const openDoc = pagesDoc ? (documents?.find(d => d.id === pagesDoc.id) ?? null) : null
        return (
          <Dialog open={!!pagesDoc} onOpenChange={() => setPagesDoc(null)}>
            <DialogContent>
              <DialogHeader><DialogTitle>Pages — {openDoc?.title ?? pagesDoc?.title}</DialogTitle></DialogHeader>
              <div className="space-y-2">
                {openDoc?.pages.map((p) => (
                  <div key={p.pageId ?? 'primary'} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="mr-1 text-muted-foreground">Page {p.order}</span>{p.fileName}
                    </span>
                    <Tip content="Télécharger"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDoc && handleDownloadPage(openDoc, p)}>
                      <Download className="h-4 w-4" />
                    </Button></Tip>
                    {p.isPrimary ? (
                      <span className="px-1 text-[10px] text-muted-foreground">page principale</span>
                    ) : hasPermission(PERMISSIONS.DOCUMENTS_DELETE) && (
                      <Tip content="Supprimer la page"><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={deletePageMutation.isPending} onClick={() => p.pageId && handleDeletePage(p.pageId)}>
                        <Trash2 className="h-4 w-4" />
                      </Button></Tip>
                    )}
                  </div>
                ))}
              </div>
              <DialogFooter>
                {canUpload && (
                  <Button variant="outline" onClick={() => addPageRef.current?.click()} disabled={addPagesMutation.isPending}>
                    <Plus className="mr-1 h-4 w-4" />Ajouter une page
                  </Button>
                )}
                <Button onClick={() => setPagesDoc(null)}>Fermer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      })()}

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
