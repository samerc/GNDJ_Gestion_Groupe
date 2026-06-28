// Admin screen (CG/super-admin): define reusable report templates that CUs then
// generate per-unit. A template = report type (roster PDF or Excel/CSV export) +
// format + a selected set of columns (stored as a JSON string). isActive controls
// whether it's offered to unit leaders.
import { useState } from 'react'
import { useReportTemplates, useCreateReportTemplate, useUpdateReportTemplate, useDeleteReportTemplate, type ReportTemplateDto, type ReportTemplateFormData } from '@/services/report-template-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Plus, Pencil, Trash2, FileText, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'

const REPORT_TYPE_OPTIONS = [
  { value: 'roster', label: 'Liste (PDF)' },
  { value: 'export', label: 'Export (Excel/CSV)' },
]

// Allowed formats per report type; switching the type resets format to the first entry.
const FORMAT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  roster: [{ value: 'pdf', label: 'PDF' }],
  export: [
    { value: 'xlsx', label: 'Excel (.xlsx)' },
    { value: 'csv', label: 'CSV' },
  ],
}

// Column catalog grouped for the checkbox picker; keys must match the backend export/roster column ids.
const ALL_COLUMNS = [
  { group: 'Identité', columns: [
    { key: 'name', label: 'Nom' },
    { key: 'cardNumber', label: 'N° carte' },
    { key: 'gender', label: 'Genre' },
    { key: 'dateOfBirth', label: 'Date naissance' },
    { key: 'age', label: 'Âge' },
  ]},
  { group: 'Scolarité', columns: [
    { key: 'school', label: 'École' },
    { key: 'classe', label: 'Classe' },
    { key: 'section', label: 'Section' },
  ]},
  { group: 'Contact', columns: [
    { key: 'phone', label: 'Téléphone' },
    { key: 'email', label: 'Email' },
    { key: 'address', label: 'Adresse' },
  ]},
  { group: 'Scout', columns: [
    { key: 'unit', label: 'Unité' },
    { key: 'team', label: 'Équipe' },
    { key: 'role', label: 'Fonction' },
    { key: 'nationality', label: 'Nationalité' },
    { key: 'bloodType', label: 'Groupe sanguin' },
  ]},
]

export default function ReportTemplatesPage() {
  const { data: templates, isLoading } = useReportTemplates()
  const createMutation = useCreateReportTemplate()
  const updateMutation = useUpdateReportTemplate()
  const deleteMutation = useDeleteReportTemplate()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ReportTemplateDto | null>(null)
  const [deleting, setDeleting] = useState<ReportTemplateDto | null>(null)
  const [error, setError] = useState('')

  const defaultForm: ReportTemplateFormData = {
    name: '', description: '', reportType: 'roster', format: 'pdf',
    columnsJson: JSON.stringify(['name', 'cardNumber', 'age']),
    isActive: true, displayOrder: 0,
  }
  const [form, setForm] = useState<ReportTemplateFormData>(defaultForm)
  // Column selection kept as a Set for cheap toggles; serialized to form.columnsJson on submit.
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set(['name', 'cardNumber', 'age']))

  const openCreate = () => {
    setEditing(null)
    setForm({ ...defaultForm, displayOrder: (templates?.length ?? 0) + 1 })
    setSelectedColumns(new Set(['name', 'cardNumber', 'age']))
    setError('')
    setFormOpen(true)
  }

  const openEdit = (item: ReportTemplateDto) => {
    setEditing(item)
    const cols: string[] = JSON.parse(item.columnsJson) // hydrate the column Set from the saved JSON
    setForm({
      name: item.name, description: item.description, reportType: item.reportType,
      format: item.format, columnsJson: item.columnsJson, isActive: item.isActive,
      displayOrder: item.displayOrder,
    })
    setSelectedColumns(new Set(cols))
    setError('')
    setFormOpen(true)
  }

  const toggleColumn = (key: string) => {
    setSelectedColumns(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const columnsJson = JSON.stringify(Array.from(selectedColumns))
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...form, columnsJson })
        toast.success('Modèle modifié')
      } else {
        await createMutation.mutateAsync({ ...form, columnsJson })
        toast.success('Modèle créé')
      }
      setFormOpen(false)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { await deleteMutation.mutateAsync(deleting.id); toast.success('Modèle supprimé'); setDeleting(null) }
    catch (err) { setError(parseApiError(err)); setDeleting(null) }
  }

  if (isLoading) return <LoadingSpinner variant="table" />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rapports personnalisés</h1>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nouveau rapport</Button>
      </div>

      {!templates || templates.length === 0 ? (
        <EmptyState icon={FileText} title="Aucun rapport" description="Créez votre premier modèle de rapport." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(t => {
            const cols: string[] = JSON.parse(t.columnsJson)
            return (
              <Card key={t.id} className={!t.isActive ? 'opacity-60' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      {t.reportType === 'roster' ? <FileText className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}
                      {t.name}
                    </CardTitle>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(t)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {t.description && <p className="text-sm text-muted-foreground mb-2">{t.description}</p>}
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{REPORT_TYPE_OPTIONS.find(o => o.value === t.reportType)?.label ?? t.reportType}</Badge>
                    <Badge variant="outline">{t.format.toUpperCase()}</Badge>
                    {!t.isActive && <Badge variant="secondary">Inactif</Badge>}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{cols.length} colonne(s)</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le rapport' : 'Nouveau rapport'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

            <div className="space-y-2">
              <RequiredLabel required>Nom</RequiredLabel>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Description</RequiredLabel>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel required>Type</RequiredLabel>
                <Select value={form.reportType} onValueChange={v => {
                  const formats = FORMAT_OPTIONS[v]
                  setForm(f => ({ ...f, reportType: v, format: formats[0].value }))
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REPORT_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <RequiredLabel required>Format</RequiredLabel>
                <Select value={form.format} onValueChange={v => setForm(f => ({ ...f, format: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(FORMAT_OPTIONS[form.reportType] ?? []).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <RequiredLabel required>Colonnes</RequiredLabel>
              <div className="rounded-md border p-3 max-h-48 overflow-y-auto space-y-3">
                {ALL_COLUMNS.map(group => (
                  <div key={group.group}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">{group.group}</p>
                    <div className="grid grid-cols-2 gap-1">
                      {group.columns.map(col => (
                        <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={selectedColumns.has(col.key)} onChange={() => toggleColumn(col.key)} className="h-3.5 w-3.5" />
                          {col.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4" />
              Actif (visible pour les chefs d'unité)
            </label>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Supprimer le rapport"
        description={`Êtes-vous sûr de vouloir supprimer « ${deleting?.name} » ?`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
