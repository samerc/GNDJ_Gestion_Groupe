import { useState } from 'react'
import { toast } from 'sonner'
import { useRejectionReasons, useUpdateRejectionReasons, type RejectionReason } from '@/services/demande-admin-service'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Tip } from '@/components/ui/tooltip'
import { parseApiError } from '@/lib/error-utils'
import { Ban, Plus, Trash2, Star, Save, Info, Pencil, X } from 'lucide-react'

// CG page — manage the demande REJECTION REASONS (code + libellé + texte, one default). Master-detail: a table
// lists the reasons; clicking "Modifier" (or "Ajouter") loads one into an edit form (text fields). Each save
// persists the WHOLE list (backend PUT replace). The code is what the Maîtrise types in the Excel "Décision"
// column (or picks in the web decline dialog) to refuse; the reason's TEXT is emailed as {{reason}} in the
// single demande_declined template. The literal "--" in Excel always maps to the default reason.
const EMPTY: RejectionReason = { code: '', label: '', text: '', isDefault: false }

export default function RejectionReasonsPage() {
  const { data: reasons = [], isLoading } = useRejectionReasons()
  const update = useUpdateRejectionReasons()

  // Master-detail edit state: draftIndex = -1 for a new reason, >=0 for editing an existing row, null = closed.
  const [draftIndex, setDraftIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState<RejectionReason>(EMPTY)
  // Index of the reason pending delete-confirmation (null = no confirm open). Deletion is destructive
  // (persists the whole list minus that reason), so it goes through a confirm like every other admin list.
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const startAdd = () => { setDraftIndex(-1); setDraft({ ...EMPTY, isDefault: reasons.length === 0 }) }
  const startEdit = (i: number) => { setDraftIndex(i); setDraft({ ...reasons[i] }) }
  const cancel = () => { setDraftIndex(null) }

  // Persist the whole list after applying `next` (built by the caller). Enforces exactly one default here.
  const persist = async (next: RejectionReason[], msg: string) => {
    // If more than one row is marked default, keep only the last-set one.
    const defaults = next.filter((r) => r.isDefault)
    const normalized = defaults.length > 1
      ? next.map((r) => ({ ...r, isDefault: r === defaults[defaults.length - 1] }))
      : next
    try {
      await update.mutateAsync(normalized)
      toast.success(msg)
      setDraftIndex(null)
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  const saveDraft = async () => {
    const cleaned: RejectionReason = { code: draft.code.trim(), label: draft.label.trim(), text: draft.text.trim(), isDefault: draft.isDefault }
    if (!cleaned.code) { toast.error('Le code est requis.'); return }
    if (!cleaned.label) { toast.error('Le libellé est requis.'); return }
    if (cleaned.code === '--' || cleaned.code === '-') { toast.error('Le code « -- » est réservé (motif par défaut).'); return }
    // Unique code (accent/case-insensitive) against the OTHER rows.
    const others = reasons.filter((_, i) => i !== draftIndex)
    if (others.some((r) => r.code.trim().toLowerCase() === cleaned.code.toLowerCase())) { toast.error('Ce code existe déjà.'); return }
    // If this one becomes the default, clear the others.
    const applyDefault = (list: RejectionReason[]) => cleaned.isDefault ? list.map((r) => ({ ...r, isDefault: false })) : list
    const next = draftIndex === -1
      ? [...applyDefault(reasons), cleaned]
      : applyDefault(reasons).map((r, i) => (i === draftIndex ? cleaned : r))
    await persist(next, 'Motif enregistré.')
  }

  const removeRow = async (i: number) => {
    await persist(reasons.filter((_, idx) => idx !== i), 'Motif supprimé.')
    setConfirmDelete(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Ban className="h-6 w-6" />Motifs de refus</h1>
          <p className="text-sm text-muted-foreground">Motifs réutilisables pour refuser une demande (email + fichier Excel).</p>
        </div>
        {draftIndex === null && (
          <Button onClick={startAdd} disabled={isLoading}><Plus className="mr-1 h-4 w-4" />Ajouter un motif</Button>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Le <strong>code</strong> est ce que la Maîtrise saisit dans la colonne <strong>Décision</strong> du fichier Excel
          (ou choisit dans la revue web) pour refuser. Le <strong>texte</strong> est inclus dans l'email de refus.
          Dans Excel, saisir <strong>« -- »</strong> applique le motif <strong>par défaut</strong> (★).
        </div>
      </div>

      {/* Edit form (master-detail): the selected/new reason moves into these text fields. */}
      {draftIndex !== null && (
        <div className="space-y-4 rounded-lg border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{draftIndex === -1 ? 'Nouveau motif' : 'Modifier le motif'}</h2>
            <Button variant="ghost" size="icon" onClick={cancel}><X className="h-4 w-4" /></Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="w-32">
              <label className="text-xs text-muted-foreground">Code</label>
              <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="ex. 6" />
            </div>
            <div className="min-w-56 flex-1">
              <label className="text-xs text-muted-foreground">Libellé</label>
              <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="ex. Manque de place" />
            </div>
            <div className="flex items-end pt-4">
              <Button type="button" variant={draft.isDefault ? 'default' : 'outline'} onClick={() => setDraft({ ...draft, isDefault: !draft.isDefault })}>
                <Star className={`mr-1 h-4 w-4 ${draft.isDefault ? 'fill-current' : ''}`} />Par défaut
              </Button>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Texte du motif (inclus dans l'email de refus)</label>
            <textarea
              className="mt-1 flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              placeholder="Nous sommes au regret de vous informer que…"
            />
            <p className="mt-1 text-xs text-muted-foreground">Si vide, le libellé est utilisé dans l'email.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={cancel} disabled={update.isPending}>Annuler</Button>
            <Button onClick={saveDraft} disabled={update.isPending}><Save className="mr-1 h-4 w-4" />Enregistrer</Button>
          </div>
        </div>
      )}

      {/* Reasons table (master list). */}
      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : reasons.length === 0 ? (
        <EmptyState icon={Ban} title="Aucun motif" description="Ajoutez un motif type pour pouvoir refuser une demande avec un message prêt à l'emploi." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Code</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead className="hidden md:table-cell">Texte</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reasons.map((r, i) => (
                <TableRow key={i} className={`even:bg-muted/30 ${draftIndex === i ? 'bg-primary/5' : ''}`}>
                  <TableCell className="font-mono font-medium">
                    {r.code}
                    {r.isDefault && <Badge className="ml-2 align-middle"><Star className="mr-1 h-3 w-3 fill-current" />Défaut</Badge>}
                  </TableCell>
                  <TableCell>{r.label}</TableCell>
                  <TableCell className="hidden max-w-md truncate text-muted-foreground md:table-cell">{r.text || <span className="italic">(libellé utilisé)</span>}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Tip content="Modifier"><Button variant="outline" size="icon" className="h-8 w-8" onClick={() => startEdit(i)} disabled={update.isPending}><Pencil className="h-4 w-4" /></Button></Tip>
                      <Tip content="Supprimer"><Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setConfirmDelete(i)} disabled={update.isPending}><Trash2 className="h-4 w-4" /></Button></Tip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null) }}
        title="Supprimer ce motif"
        variant="destructive"
        description={
          confirmDelete !== null && reasons[confirmDelete]?.isDefault
            ? `Supprimer « ${reasons[confirmDelete]?.label} » ? C'est le motif par défaut (★) — il ne sera plus appliqué pour « -- » dans le fichier Excel.`
            : `Supprimer le motif « ${confirmDelete !== null ? reasons[confirmDelete]?.label : ''} » ?`
        }
        confirmLabel="Supprimer"
        loading={update.isPending}
        onConfirm={() => { if (confirmDelete !== null) removeRow(confirmDelete) }}
      />
    </div>
  )
}
