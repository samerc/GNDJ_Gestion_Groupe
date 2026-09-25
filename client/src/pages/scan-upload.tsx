import { useRef, useState } from 'react'
import { useParams } from 'react-router'
import { Camera, ImageUp, CheckCircle2, AlertTriangle, Loader2, Compass, RotateCcw } from 'lucide-react'
import { parseApiError } from '@/lib/error-utils'
import { useScanUploadInfo, scanUploadFiles } from '@/services/scan-upload-service'

// PHONE side of "Scanner un document avec le téléphone". Reached by scanning the desktop QR — a PUBLIC route
// (no login): the token in the URL is the authorization. The parent picks the document type and photographs the
// paper; each photo uploads straight into the member's dossier. Two photos of the SAME type build one document
// (recto/verso) because the server appends to a pending document of that type. Self-contained (no app chrome).
export default function ScanUploadPage() {
  const { token = '' } = useParams<{ token: string }>()
  const { data: info, isLoading, error } = useScanUploadInfo(token)

  // The desktop may pre-target a document type (?type=…) when scanning a specific row — pre-select it so the
  // parent just photographs (the picker stays visible/changeable in case they scanned the wrong row).
  const preselectType = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('type') || '') : ''
  const [docTypeId, setDocTypeId] = useState('')
  const [preselectApplied, setPreselectApplied] = useState(false)
  // Apply the pre-selection ONCE, when the doc-type list has loaded (render-phase adjust, not an effect).
  if (!preselectApplied && info && preselectType) {
    setPreselectApplied(true)
    if (info.docTypes.some((d) => d.id === preselectType)) setDocTypeId(preselectType)
  }
  const [expiry, setExpiry] = useState('')
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [sentCount, setSentCount] = useState(0)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  // The captured/chosen file awaiting confirmation — shown as a preview so the parent can check it's readable
  // and confirm (or retake) BEFORE it uploads (the camera otherwise sent the instant the photo was taken).
  const [pending, setPending] = useState<{ file: File; url: string } | null>(null)

  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const selectedType = info?.docTypes.find((d) => d.id === docTypeId)
  const needsExpiry = !!selectedType?.requiresExpiry
  const canShoot = !!docTypeId && (!needsExpiry || !!expiry) && !sending

  // Camera/file selection → show a preview instead of uploading immediately.
  const pickFile = (file: File | undefined) => {
    if (!file || !docTypeId) return
    if (needsExpiry && !expiry) {
      setMsg({ type: 'error', text: "Ce document nécessite une date d'expiration." })
      return
    }
    setMsg(null)
    setPending({ file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : '' })
  }

  const cancelPending = () => setPending((p) => { if (p?.url) URL.revokeObjectURL(p.url); return null })

  // Confirm → actually upload the previewed file.
  const confirmUpload = async () => {
    if (!pending || !docTypeId) return
    const fd = new FormData()
    fd.append('documentTypeId', docTypeId)
    if (expiry) fd.append('expiryDate', expiry)
    fd.append('files', pending.file)

    setSending(true)
    setProgress(0)
    setMsg(null)
    try {
      await scanUploadFiles(token, fd, setProgress)
      setSentCount((c) => c + 1)
      setMsg({ type: 'success', text: 'Document envoyé ! Vous pouvez en photographier un autre.' })
      cancelPending()
    } catch (err) {
      setMsg({ type: 'error', text: parseApiError(err) })
    } finally {
      setSending(false)
      setProgress(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-muted/40 px-4 py-8">
      <div className="w-full max-w-md space-y-5">
        {/* Brand mark */}
        <div className="flex items-center justify-center gap-2 text-primary">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
            <Compass className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold">GNDJ Scout</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : error || !info ? (
          <div className="rounded-xl border bg-card p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/50">
              <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-sm text-muted-foreground">
              {parseApiError(error) || "Ce lien a expiré ou n'est plus valide."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Demandez un nouveau code sur l'ordinateur.</p>
          </div>
        ) : (
          <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
            <div>
              <h1 className="text-base font-semibold">Envoyer un document</h1>
              <p className="text-sm text-muted-foreground">Pour <span className="font-medium text-foreground">{info.memberLabel}</span></p>
            </div>

            {/* Document type */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type de document</label>
              <select
                value={docTypeId}
                onChange={(e) => { setDocTypeId(e.target.value); setExpiry(''); setMsg(null) }}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Choisir un type…</option>
                {info.docTypes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            {/* Expiry (only for types that require it) */}
            {needsExpiry && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Date d'expiration</label>
                <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" />
              </div>
            )}

            {/* Status message */}
            {msg && (
              <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${msg.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300'
                : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'}`}>
                {msg.type === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{msg.text}</span>
              </div>
            )}

            {/* Upload progress */}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress ?? 0}%` }} />
                </div>
                <span>Envoi… {progress ?? 0}%</span>
              </div>
            )}

            {/* Camera + file inputs (hidden) */}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />

            {pending ? (
              /* PREVIEW — check the document is readable before sending it. */
              <div className="space-y-3">
                <div className="rounded-lg border bg-muted/30 p-2">
                  {pending.url ? (
                    <img src={pending.url} alt={pending.file.name} className="mx-auto max-h-80 w-auto rounded-md object-contain" />
                  ) : (
                    <div className="flex items-center gap-2 p-2 text-sm">
                      <ImageUp className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 truncate">{pending.file.name}</span>
                    </div>
                  )}
                </div>
                <p className="text-center text-xs text-muted-foreground">Vérifiez que le document est bien lisible.</p>
                <button type="button" disabled={sending} onClick={confirmUpload}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-primary text-base font-semibold text-primary-foreground shadow-sm transition-colors disabled:opacity-50">
                  <CheckCircle2 className="h-6 w-6" />{sending ? 'Envoi…' : 'Envoyer ce document'}
                </button>
                <button type="button" disabled={sending} onClick={cancelPending}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-input bg-background text-sm font-medium transition-colors disabled:opacity-50">
                  <RotateCcw className="h-4 w-4" />Reprendre
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button type="button" disabled={!canShoot} onClick={() => cameraRef.current?.click()}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-primary text-base font-semibold text-primary-foreground shadow-sm transition-colors disabled:opacity-50">
                  <Camera className="h-6 w-6" />Prendre une photo
                </button>
                <button type="button" disabled={!canShoot} onClick={() => fileRef.current?.click()}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-input bg-background text-sm font-medium transition-colors disabled:opacity-50">
                  <ImageUp className="h-4 w-4" />Choisir un fichier
                </button>
              </div>
            )}

            {!docTypeId && !pending && <p className="text-center text-xs text-muted-foreground">Choisissez d'abord le type de document.</p>}
            {sentCount > 0 && (
              <p className="text-center text-xs text-muted-foreground">
                {sentCount} envoi{sentCount > 1 ? 's' : ''} — deux photos du même type (recto/verso) forment un seul document.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
