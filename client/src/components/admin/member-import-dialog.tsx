import { useRef, useState } from 'react'
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react'
import apiClient from '@/lib/api-client'
import { saveBlob } from '@/lib/download'
import { parseApiError } from '@/lib/error-utils'
import {
  usePreviewMemberImport, useCommitMemberImport, type MemberImportPreview, type MemberImportResult,
} from '@/services/member-service'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'

// Bulk member import: download the template, choose a filled .xlsx/.csv, PREVIEW (dry-run — per-row validation),
// then IMPORT the valid rows. Two-step so the user sees exactly what will be created + what's wrong before writing.
export function MemberImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<MemberImportPreview | null>(null)
  const [result, setResult] = useState<MemberImportResult | null>(null)
  const previewMut = usePreviewMemberImport()
  const commitMut = useCommitMemberImport()

  const reset = () => { setFile(null); setPreview(null); setResult(null); if (fileRef.current) fileRef.current.value = '' }

  const downloadTemplate = () => {
    apiClient.get('/members/import/template', { responseType: 'blob' })
      .then(r => saveBlob(r.data, 'modele-import-membres.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
      .catch(e => toast.error(parseApiError(e)))
  }

  const onPick = (f: File | null) => {
    setFile(f); setPreview(null); setResult(null)
    if (f) previewMut.mutate(f, { onSuccess: setPreview, onError: e => toast.error(parseApiError(e)) })
  }

  const doImport = () => {
    if (!file) return
    commitMut.mutate(file, {
      onSuccess: (res) => {
        setResult(res)
        if (res.created > 0) toast.success(`${res.created} membre(s) importé(s)`)
        if (res.created === 0 && res.failed > 0) toast.error('Aucun membre importé — voir les erreurs')
      },
      onError: e => toast.error(parseApiError(e)),
    })
  }

  const close = () => { reset(); onOpenChange(false) }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Importer des membres</DialogTitle></DialogHeader>

        {!result ? (
          <div className="space-y-4">
            {/* Step 1: template */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" />
              <span className="flex-1 min-w-0">Téléchargez le modèle, remplissez une ligne par membre, puis importez le fichier (.xlsx ou .csv).</span>
              <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="mr-1.5 h-4 w-4" />Modèle</Button>
            </div>

            {/* Step 2: choose file */}
            <div>
              <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-1.5 h-4 w-4" />{file ? file.name : 'Choisir un fichier…'}
              </Button>
              {previewMut.isPending && <span className="ml-3 text-sm text-muted-foreground">Analyse…</span>}
            </div>

            {/* File-level errors */}
            {preview?.fileErrors && preview.fileErrors.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {preview.fileErrors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}

            {/* Preview table */}
            {preview && preview.rows.length > 0 && (
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" />{preview.validCount} valide(s)</span>
                  {preview.errorCount > 0 && <span className="inline-flex items-center gap-1 font-medium text-amber-600"><AlertTriangle className="h-4 w-4" />{preview.errorCount} en erreur</span>}
                </div>
                <div className="max-h-72 overflow-y-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted text-xs uppercase text-muted-foreground">
                      <tr><th className="px-2 py-1.5 text-left">Ligne</th><th className="px-2 py-1.5 text-left">Prénom</th><th className="px-2 py-1.5 text-left">Nom</th><th className="px-2 py-1.5 text-left">Naissance</th><th className="px-2 py-1.5 text-left">Genre</th><th className="px-2 py-1.5 text-left">Unité</th><th className="px-2 py-1.5 text-left">État</th></tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r) => (
                        <tr key={r.row} className={`border-t ${r.valid ? '' : 'bg-destructive/5'}`}>
                          <td className="px-2 py-1.5 text-muted-foreground">{r.row}</td>
                          <td className="px-2 py-1.5">{r.firstName}</td>
                          <td className="px-2 py-1.5">{r.lastName}</td>
                          <td className="px-2 py-1.5">{r.dateOfBirth}</td>
                          <td className="px-2 py-1.5">{r.gender}</td>
                          <td className="px-2 py-1.5">{r.unitName}</td>
                          <td className="px-2 py-1.5">
                            {r.valid ? <span className="text-emerald-600">OK</span>
                              : <span className="text-destructive">{r.errors.join(' · ')}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.errorCount > 0 && <p className="mt-2 text-xs text-muted-foreground">Seules les lignes valides seront importées. Corrigez le fichier et ré-importez pour les autres.</p>}
              </div>
            )}
          </div>
        ) : (
          /* Result */
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span><span className="font-semibold">{result.created}</span> membre(s) importé(s){result.failed > 0 && <>, <span className="font-semibold text-amber-600">{result.failed}</span> en échec</>}.</span>
            </div>
            {result.errors.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800">
                {result.errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={close}>Annuler</Button>
              <Button onClick={doImport} disabled={commitMut.isPending || !preview || preview.validCount === 0}>
                {commitMut.isPending ? 'Import…' : `Importer ${preview?.validCount ?? 0} membre(s)`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={reset}>Importer un autre fichier</Button>
              <Button onClick={close}>Fermer</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
