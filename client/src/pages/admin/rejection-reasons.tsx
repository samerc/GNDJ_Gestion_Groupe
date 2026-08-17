import { useState } from 'react'
import { toast } from 'sonner'
import { useRejectionReasons, useUpdateRejectionReasons, type RejectionReason } from '@/services/demande-admin-service'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Tip } from '@/components/ui/tooltip'
import { parseApiError } from '@/lib/error-utils'
import { Ban, Plus, Trash2, Star, Save, Info } from 'lucide-react'

// CG page — manage the demande REJECTION REASONS (code + libellé + texte, one default). The code is what the
// Maîtrise types in the Excel "Décision" column (or picks in the web decline dialog) to refuse an applicant;
// the reason's TEXT is emailed as {{reason}} in the single demande_declined template. The literal "--" in Excel
// always maps to the default reason. Whole list is saved at once (PUT replace).
export default function RejectionReasonsPage() {
  const { data, isLoading, dataUpdatedAt } = useRejectionReasons()
  const update = useUpdateRejectionReasons()

  // Local editable copy; re-sync only when a NEW server fetch lands (dataUpdatedAt changes), so in-progress
  // edits aren't clobbered between fetches. (Render-phase reset — the codebase's set-state-in-effect-free pattern.)
  const [rows, setRows] = useState<RejectionReason[]>([])
  const [syncedAt, setSyncedAt] = useState(0)
  if (data && dataUpdatedAt !== syncedAt) {
    setRows(data.map((r) => ({ ...r })))
    setSyncedAt(dataUpdatedAt)
  }

  const dirty = JSON.stringify(rows) !== JSON.stringify(data ?? [])

  const setRow = (i: number, patch: Partial<RejectionReason>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i))
  const addRow = () => setRows((rs) => [...rs, { code: '', label: '', text: '', isDefault: rs.length === 0 }])
  // Exactly one default — clicking the star sets this row and clears the others (clicking the current default clears it).
  const toggleDefault = (i: number) =>
    setRows((rs) => rs.map((r, idx) => ({ ...r, isDefault: idx === i ? !r.isDefault : false })))

  const save = async () => {
    // Client-side guards mirroring the server validator (clearer than a round-trip 400).
    const cleaned = rows.map((r) => ({ ...r, code: r.code.trim(), label: r.label.trim(), text: r.text.trim() }))
    if (cleaned.some((r) => !r.code)) { toast.error('Chaque motif doit avoir un code.'); return }
    if (cleaned.some((r) => !r.label)) { toast.error('Chaque motif doit avoir un libellé.'); return }
    if (cleaned.some((r) => r.code === '--' || r.code === '-')) { toast.error('Le code « -- » est réservé (motif par défaut).'); return }
    const codes = cleaned.map((r) => r.code.toLowerCase())
    if (new Set(codes).size !== codes.length) { toast.error('Les codes doivent être uniques.'); return }
    try {
      await update.mutateAsync(cleaned)
      toast.success('Motifs de refus enregistrés.')
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Ban className="h-6 w-6" />Motifs de refus</h1>
          <p className="text-sm text-muted-foreground">Motifs réutilisables pour refuser une demande (email + fichier Excel).</p>
        </div>
        <Button onClick={save} disabled={!dirty || update.isPending}>
          <Save className="mr-1 h-4 w-4" />Enregistrer
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Le <strong>code</strong> est ce que la Maîtrise saisit dans la colonne <strong>Décision</strong> du fichier Excel
          (ou choisit dans la revue web) pour refuser. Le <strong>texte</strong> est inclus dans l'email de refus.
          Dans Excel, saisir <strong>« -- »</strong> applique le motif <strong>par défaut</strong> (★).
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : (
        <div className="space-y-3">
          {rows.length === 0 && (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Aucun motif. Ajoutez-en un pour pouvoir refuser une demande avec un message type.
            </p>
          )}
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-28">
                  <label className="text-xs text-muted-foreground">Code</label>
                  <Input value={r.code} onChange={(e) => setRow(i, { code: e.target.value })} placeholder="ex. 6" />
                </div>
                <div className="min-w-48 flex-1">
                  <label className="text-xs text-muted-foreground">Libellé</label>
                  <Input value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} placeholder="ex. Manque de place" />
                </div>
                <div className="flex items-end gap-1 self-stretch pt-4">
                  <Tip content={r.isDefault ? 'Motif par défaut (« -- » dans Excel)' : 'Définir comme motif par défaut'}>
                    <Button type="button" variant={r.isDefault ? 'default' : 'outline'} size="icon" onClick={() => toggleDefault(i)}>
                      <Star className={`h-4 w-4 ${r.isDefault ? 'fill-current' : ''}`} />
                    </Button>
                  </Tip>
                  <Tip content="Supprimer ce motif">
                    <Button type="button" variant="outline" size="icon" onClick={() => removeRow(i)}><Trash2 className="h-4 w-4" /></Button>
                  </Tip>
                </div>
                {r.isDefault && <Badge className="ml-auto">Par défaut</Badge>}
              </div>
              <div className="mt-2">
                <label className="text-xs text-muted-foreground">Texte du motif (inclus dans l'email de refus)</label>
                <textarea
                  className="mt-1 flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={r.text}
                  onChange={(e) => setRow(i, { text: e.target.value })}
                  placeholder="Nous sommes au regret de vous informer que…"
                />
                <p className="mt-1 text-xs text-muted-foreground">Si vide, le libellé est utilisé dans l'email.</p>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addRow}><Plus className="mr-1 h-4 w-4" />Ajouter un motif</Button>
        </div>
      )}
    </div>
  )
}
