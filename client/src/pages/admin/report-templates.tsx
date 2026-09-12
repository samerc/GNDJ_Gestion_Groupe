// Admin screen (CG/super-admin): a VISUAL report builder. A template = report type (roster PDF or Excel/CSV
// export) + format + an ORDERED set of columns (drag/reorder) + a TARGET scope (one unit / several units /
// a branch / the whole group) + a member filter (all / youth / maîtrise) + an optional custom title. Templates
// are then generated straight from this page ("Générer") or by a CU from their unit dashboard (unit scope).
import { useMemo, useState } from 'react'
import {
  useReportTemplates, useCreateReportTemplate, useUpdateReportTemplate, useDeleteReportTemplate,
  generateReportFromTemplate, type ReportTemplateDto, type ReportTemplateFormData,
} from '@/services/report-template-service'
import { useUnits } from '@/services/unit-service'
import { useUnitTypes } from '@/services/unit-type-service'
import { useCustomFields } from '@/services/custom-field-service'
import { useCurrentScoutYear } from '@/hooks/use-scout-year'
import { useLeaderUnits } from '@/hooks/use-leader-units'
import { useIsManager } from '@/lib/use-is-manager'
import { parseApiError, parseBlobError } from '@/lib/error-utils'
import { safeJsonArray } from '@/lib/utils'
import { saveBlob, filenameFromDisposition } from '@/lib/download'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { BackToSettings } from '@/components/shared/back-to-settings'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Plus, Pencil, Trash2, FileText, FileSpreadsheet, ArrowUp, ArrowDown, X, Download, Users, Building2, Layers, Globe } from 'lucide-react'
import { Tip } from '@/components/ui/tooltip'
import { toast } from 'sonner'

const REPORT_TYPE_OPTIONS = [
  { value: 'roster', label: 'Liste (PDF)' },
  { value: 'export', label: 'Export (Excel / CSV)' },
]

// Allowed formats per report type; switching the type resets format to the first entry. Export uses "excel"/"csv"
// (the backend values) so the generated file matches the picked format.
const FORMAT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  roster: [{ value: 'pdf', label: 'PDF' }],
  export: [
    { value: 'excel', label: 'Excel (.xlsx)' },
    { value: 'csv', label: 'CSV' },
  ],
}

const SCOPE_OPTIONS = [
  { value: 'unit', label: 'Une unité', icon: Users, hint: "Le chef choisit l'unité à la génération." },
  { value: 'units', label: 'Plusieurs unités', icon: Building2, hint: 'Un ensemble d’unités choisi ci-dessous.' },
  { value: 'branch', label: 'Une branche', icon: Layers, hint: "Toutes les unités d'un type (Meute, Troupe…)." },
  { value: 'group', label: 'Tout le groupe', icon: Globe, hint: 'Toutes les unités actives du groupe.' },
]

const MEMBER_FILTER_OPTIONS = [
  { value: 'all', label: 'Tous les membres' },
  { value: 'youth', label: 'Jeunes (hors maîtrise)' },
  { value: 'maitrise', label: 'Maîtrise seulement' },
]

// Built-in column catalog grouped for the palette; keys MUST match the backend roster/export column ids.
const COLUMN_GROUPS = [
  { group: 'Identité', columns: [
    { key: 'name', label: 'Nom complet' },
    { key: 'firstName', label: 'Prénom' },
    { key: 'lastName', label: 'Nom de famille' },
    { key: 'cardNumber', label: 'Matricule' },
    { key: 'externalCardNumber', label: 'N° carte' },
    { key: 'gender', label: 'Genre' },
    { key: 'dateOfBirth', label: 'Date de naissance' },
    { key: 'age', label: 'Âge' },
    { key: 'nationality', label: 'Nationalité' },
    { key: 'bloodType', label: 'Groupe sanguin' },
  ]},
  { group: 'Scolarité / activité', columns: [
    { key: 'school', label: 'École' },
    { key: 'classe', label: 'Classe' },
    { key: 'section', label: 'Section' },
    { key: 'profession', label: 'Profession' },
    { key: 'professionDomain', label: 'Domaine professionnel' },
  ]},
  { group: 'Coordonnées', columns: [
    { key: 'phone', label: 'Téléphone' },
    { key: 'email', label: 'Email' },
    { key: 'address', label: 'Adresse' },
    { key: 'primaryContactEmail', label: 'Email de contact' },
  ]},
  { group: 'Famille', columns: [
    { key: 'fatherName', label: 'Père' },
    { key: 'fatherPhone', label: 'Tél. père' },
    { key: 'motherName', label: 'Mère' },
    { key: 'motherPhone', label: 'Tél. mère' },
    { key: 'guardianEmails', label: 'Emails parents' },
  ]},
  { group: 'Scout', columns: [
    { key: 'unit', label: 'Unité' },
    { key: 'team', label: 'Équipe' },
    { key: 'role', label: 'Fonction' },
    { key: 'startDate', label: "Date d'arrivée" },
  ]},
]

const emptyForm = (order: number): ReportTemplateFormData => ({
  name: '', description: '', reportType: 'roster', format: 'pdf',
  columnsJson: JSON.stringify(['name', 'cardNumber', 'age', 'role']),
  isActive: true, displayOrder: order,
  scopeType: 'unit', scopeUnitTypeId: null, scopeUnitIdsJson: '[]', titleOverride: null, memberFilter: 'all',
})

export default function ReportTemplatesPage() {
  const { data: templates, isLoading } = useReportTemplates()
  const createMutation = useCreateReportTemplate()
  const updateMutation = useUpdateReportTemplate()
  const deleteMutation = useDeleteReportTemplate()
  const isManager = useIsManager()
  const scoutYear = useCurrentScoutYear()

  // Units + unit types for the scope pickers + generation. Managers see all active units; a CU sees the units they lead.
  const { data: unitsPage } = useUnits({ isActive: true, pageSize: 200 }, isManager)
  const { data: unitTypesPage } = useUnitTypes({ pageSize: 100 }, isManager)
  const { data: customFields } = useCustomFields(isManager)
  const leaderUnits = useLeaderUnits()
  const allUnits = useMemo(() => unitsPage?.items ?? [], [unitsPage])
  const unitTypes = useMemo(() => unitTypesPage?.items ?? [], [unitTypesPage])
  // Active custom fields become extra columns (key = field name, matched server-side by name).
  const customColumnGroup = useMemo(() => {
    const cols = (customFields ?? []).filter(f => f.isActive).map(f => ({ key: f.name, label: f.name }))
    return cols.length ? { group: 'Champs personnalisés', columns: cols } : null
  }, [customFields])
  const allGroups = useMemo(() => customColumnGroup ? [...COLUMN_GROUPS, customColumnGroup] : COLUMN_GROUPS, [customColumnGroup])
  const labelOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of allGroups) for (const c of g.columns) m.set(c.key, c.label)
    return m
  }, [allGroups])

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ReportTemplateDto | null>(null)
  const [deleting, setDeleting] = useState<ReportTemplateDto | null>(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState<ReportTemplateFormData>(emptyForm(0))
  // The report's ORDERED column keys (array = report column order). Scope-unit ids for the "units" scope.
  const [columns, setColumns] = useState<string[]>(['name', 'cardNumber', 'age', 'role'])
  const [scopeUnitIds, setScopeUnitIds] = useState<string[]>([])

  // Per-template generation state.
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [unitPickFor, setUnitPickFor] = useState<ReportTemplateDto | null>(null) // unit-scoped → ask which unit
  const [pickedUnit, setPickedUnit] = useState<string>('')

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm((templates?.length ?? 0) + 1))
    setColumns(['name', 'cardNumber', 'age', 'role'])
    setScopeUnitIds([])
    setError('')
    setFormOpen(true)
  }

  const openEdit = (t: ReportTemplateDto) => {
    setEditing(t)
    setForm({
      name: t.name, description: t.description, reportType: t.reportType,
      // Legacy "xlsx" rows map to "excel" for the form.
      format: t.format === 'xlsx' ? 'excel' : t.format,
      columnsJson: t.columnsJson, isActive: t.isActive, displayOrder: t.displayOrder,
      scopeType: t.scopeType, scopeUnitTypeId: t.scopeUnitTypeId, scopeUnitIdsJson: t.scopeUnitIdsJson,
      titleOverride: t.titleOverride, memberFilter: t.memberFilter,
    })
    setColumns(safeJsonArray(t.columnsJson))
    setScopeUnitIds(safeJsonArray(t.scopeUnitIdsJson))
    setError('')
    setFormOpen(true)
  }

  const addColumn = (key: string) => setColumns(prev => prev.includes(key) ? prev : [...prev, key])
  const removeColumn = (key: string) => setColumns(prev => prev.filter(k => k !== key))
  const moveColumn = (i: number, dir: -1 | 1) => setColumns(prev => {
    const next = [...prev]
    const j = i + dir
    if (j < 0 || j >= next.length) return prev
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (columns.length === 0) { setError('Ajoutez au moins une colonne.'); return }
    if (form.scopeType === 'branch' && !form.scopeUnitTypeId) { setError('Choisissez une branche.'); return }
    if (form.scopeType === 'units' && scopeUnitIds.length === 0) { setError('Choisissez au moins une unité.'); return }
    const payload: ReportTemplateFormData = {
      ...form,
      columnsJson: JSON.stringify(columns),
      scopeUnitIdsJson: JSON.stringify(form.scopeType === 'units' ? scopeUnitIds : []),
      scopeUnitTypeId: form.scopeType === 'branch' ? form.scopeUnitTypeId : null,
      titleOverride: form.titleOverride?.trim() ? form.titleOverride.trim() : null,
    }
    try {
      if (editing) { await updateMutation.mutateAsync({ id: editing.id, ...payload }); toast.success('Modèle modifié') }
      else { await createMutation.mutateAsync(payload); toast.success('Modèle créé') }
      setFormOpen(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { await deleteMutation.mutateAsync(deleting.id); toast.success('Modèle supprimé'); setDeleting(null) }
    catch (err) { toast.error(parseApiError(err)); setDeleting(null) }
  }

  // Generate: unit-scoped asks which unit first; everything else resolves its own units server-side.
  const runGenerate = async (t: ReportTemplateDto, unitId?: string) => {
    setGeneratingId(t.id)
    try {
      const res = await generateReportFromTemplate(t.id, { scoutYear, unitId })
      const fallback = `${t.name.replace(/\s+/g, '_')}.${t.reportType === 'roster' ? 'pdf' : t.format === 'csv' ? 'csv' : 'xlsx'}`
      const name = filenameFromDisposition(res.headers['content-disposition'] as string | undefined) ?? fallback
      saveBlob(res.data, name, (res.headers['content-type'] as string) || 'application/octet-stream')
      toast.success('Rapport généré')
      setUnitPickFor(null)
    } catch (err) {
      toast.error(await parseBlobError(err))
    } finally {
      setGeneratingId(null)
    }
  }

  const handleGenerateClick = (t: ReportTemplateDto) => {
    if (t.scopeType === 'unit') {
      // Ask for the unit. Managers pick from all units; a CU from the units they lead.
      const opts = isManager ? allUnits.map(u => ({ id: u.id, name: u.name })) : leaderUnits.map(u => ({ id: u.unitId, name: u.unitName }))
      if (opts.length === 1) { runGenerate(t, opts[0].id); return }
      setPickedUnit(opts[0]?.id ?? '')
      setUnitPickFor(t)
    } else {
      runGenerate(t)
    }
  }

  const scopeBadge = (t: ReportTemplateDto) => {
    if (t.scopeType === 'group') return 'Tout le groupe'
    if (t.scopeType === 'branch') return unitTypes.find(u => u.id === t.scopeUnitTypeId)?.name ?? 'Branche'
    if (t.scopeType === 'units') return `${safeJsonArray(t.scopeUnitIdsJson).length} unité(s)`
    return 'Une unité'
  }

  if (isLoading) return <LoadingSpinner variant="table" />

  return (
    <div className="space-y-6">
      {isManager && <BackToSettings />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rapports personnalisés</h1>
          <p className="text-sm text-muted-foreground">Construisez des listes et exports sur mesure, ciblés sur une unité, plusieurs unités, une branche ou tout le groupe.</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nouveau rapport</Button>
      </div>

      {!templates || templates.length === 0 ? (
        <EmptyState icon={FileText} title="Aucun rapport" description="Créez votre premier modèle de rapport." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(t => {
            const cols = safeJsonArray(t.columnsJson)
            // Any leader can generate any scope: a CU running a branch/group report is auto-filtered to their
            // own units server-side (a CG/super-admin gets the whole scope).
            const canGenerate = isManager || leaderUnits.length > 0
            return (
              <Card key={t.id} className={!t.isActive ? 'opacity-60' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      {t.reportType === 'roster' ? <FileText className="h-4 w-4 shrink-0" /> : <FileSpreadsheet className="h-4 w-4 shrink-0" />}
                      {t.name}
                    </CardTitle>
                    <div className="flex gap-1 shrink-0">
                      <Tip content="Modifier"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button></Tip>
                      <Tip content="Supprimer"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(t)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></Tip>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{REPORT_TYPE_OPTIONS.find(o => o.value === t.reportType)?.label ?? t.reportType}</Badge>
                    <Badge variant="secondary">{scopeBadge(t)}</Badge>
                    {t.memberFilter !== 'all' && <Badge variant="outline">{MEMBER_FILTER_OPTIONS.find(o => o.value === t.memberFilter)?.label}</Badge>}
                    {!t.isActive && <Badge variant="secondary">Inactif</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{cols.length} colonne(s)</p>
                  {canGenerate && (
                    <Button size="sm" variant="outline" className="w-full" disabled={generatingId === t.id} onClick={() => handleGenerateClick(t)}>
                      <Download className="mr-2 h-4 w-4" />{generatingId === t.id ? 'Génération…' : 'Générer'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Visual builder ─────────────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Modifier le rapport' : 'Nouveau rapport'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Left: settings */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <RequiredLabel required>Nom</RequiredLabel>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Ex. Liste des chefs du groupe" />
                </div>
                <div className="space-y-2">
                  <RequiredLabel>Description</RequiredLabel>
                  <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <RequiredLabel>Titre du document (optionnel)</RequiredLabel>
                  <Input value={form.titleOverride ?? ''} onChange={e => setForm(f => ({ ...f, titleOverride: e.target.value }))} placeholder="Titre affiché en haut du rapport" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <RequiredLabel required>Type</RequiredLabel>
                    <Select value={form.reportType} onValueChange={v => setForm(f => ({ ...f, reportType: v, format: FORMAT_OPTIONS[v][0].value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{REPORT_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <RequiredLabel required>Format</RequiredLabel>
                    <Select value={form.format} onValueChange={v => setForm(f => ({ ...f, format: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{(FORMAT_OPTIONS[form.reportType] ?? []).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Cible (scope) — group/branch/multi-unit is a group-manager tool, so a CU only sees "Une unité". */}
                {isManager ? (
                <>
                <div className="space-y-2">
                  <RequiredLabel required>Cible</RequiredLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {SCOPE_OPTIONS.map(o => {
                      const Icon = o.icon
                      const active = form.scopeType === o.value
                      return (
                        <button type="button" key={o.value} onClick={() => setForm(f => ({ ...f, scopeType: o.value }))}
                          className={`flex items-start gap-2 rounded-md border p-2 text-left text-sm transition ${active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted'}`}>
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                          <span><span className="font-medium">{o.label}</span><span className="block text-xs text-muted-foreground">{o.hint}</span></span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {form.scopeType === 'branch' && (
                  <div className="space-y-2">
                    <RequiredLabel required>Branche</RequiredLabel>
                    <Select value={form.scopeUnitTypeId ?? ''} onValueChange={v => setForm(f => ({ ...f, scopeUnitTypeId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Choisir une branche…" /></SelectTrigger>
                      <SelectContent>{unitTypes.map(ut => <SelectItem key={ut.id} value={ut.id}>{ut.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}

                {form.scopeType === 'units' && (
                  <div className="space-y-2">
                    <RequiredLabel required>Unités</RequiredLabel>
                    <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
                      {allUnits.length === 0 && <p className="text-xs text-muted-foreground">Aucune unité.</p>}
                      {allUnits.map(u => (
                        <label key={u.id} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input type="checkbox" checked={scopeUnitIds.includes(u.id)}
                            onChange={() => setScopeUnitIds(prev => prev.includes(u.id) ? prev.filter(x => x !== u.id) : [...prev, u.id])} className="h-3.5 w-3.5" />
                          {u.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                </>
                ) : (
                  <p className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                    Ce rapport cible votre unité (choisie à la génération).
                  </p>
                )}

                <div className="space-y-2">
                  <RequiredLabel>Membres inclus</RequiredLabel>
                  <Select value={form.memberFilter} onValueChange={v => setForm(f => ({ ...f, memberFilter: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MEMBER_FILTER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4" />
                  Actif (visible pour les chefs d'unité)
                </label>
              </div>

              {/* Right: visual column builder */}
              <div className="space-y-3">
                <div>
                  <RequiredLabel required>Colonnes du rapport</RequiredLabel>
                  <p className="text-xs text-muted-foreground">Cliquez pour ajouter, réordonnez avec les flèches. L'ordre = l'ordre des colonnes.</p>
                </div>

                {/* Selected, ordered */}
                <div className="rounded-md border">
                  <div className="border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground">Colonnes choisies ({columns.length})</div>
                  {columns.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">Aucune colonne. Ajoutez-en depuis la liste ci-dessous.</p>
                  ) : (
                    <ol className="divide-y">
                      {columns.map((key, i) => (
                        <li key={key} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                          <span className="w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
                          <span className="flex-1 truncate">{labelOf.get(key) ?? key}</span>
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0} onClick={() => moveColumn(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={i === columns.length - 1} onClick={() => moveColumn(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeColumn(key)}><X className="h-3.5 w-3.5 text-destructive" /></Button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                {/* Palette */}
                <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border p-3">
                  {allGroups.map(g => (
                    <div key={g.group}>
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">{g.group}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {g.columns.map(c => {
                          const added = columns.includes(c.key)
                          return (
                            <button type="button" key={c.key} onClick={() => added ? removeColumn(c.key) : addColumn(c.key)}
                              className={`rounded-full border px-2.5 py-1 text-xs transition ${added ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
                              {added ? '✓ ' : '+ '}{c.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Unit picker for a unit-scoped report generation. */}
      <Dialog open={!!unitPickFor} onOpenChange={o => !o && setUnitPickFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Générer « {unitPickFor?.name} »</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <RequiredLabel required>Unité</RequiredLabel>
            <Select value={pickedUnit} onValueChange={setPickedUnit}>
              <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
              <SelectContent>
                {(isManager ? allUnits.map(u => ({ id: u.id, name: u.name })) : leaderUnits.map(u => ({ id: u.unitId, name: u.unitName }))).map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnitPickFor(null)}>Annuler</Button>
            <Button disabled={!pickedUnit || generatingId === unitPickFor?.id} onClick={() => unitPickFor && runGenerate(unitPickFor, pickedUnit)}>
              {generatingId === unitPickFor?.id ? 'Génération…' : 'Générer'}
            </Button>
          </DialogFooter>
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
