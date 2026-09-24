import { useMemo, useState } from 'react'
import { useFormValidation } from '@/hooks/use-form-validation'
import { parseApiError } from '@/lib/error-utils'
import {
  useFunctionalRoles, useCreateFunctionalRole, useUpdateFunctionalRole, useDeleteFunctionalRole,
  useUnarchiveFunctionalRole, useReorderFunctionalRoles, useSetDefaultFunctionalRole, useSecurityProfiles,
  useFunctionalRoleMembers,
  type FunctionalRoleDto, type FunctionalRoleFormData,
} from '@/services/role-service'
import { useUnitTypes } from '@/services/unit-type-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, Shield, ArchiveRestore, Star, GripVertical, Search, ArrowUpDown, ArrowUp, ArrowDown, X } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface FunctionalRolesListProps {
  unitTypeId?: string
  unitTypeName?: string
  showUnitTypeColumn?: boolean
  showUnitTypeField?: boolean
  sortable?: boolean // drag-to-rank mode (unit-type page); the order sets the rank
}

// Column-sort keys for the all-types table view (null = keep the incoming order: archived last, rank order).
type RoleSortKey = 'name' | 'code' | 'unitType' | 'profile' | 'members'

// Accent/case-insensitive normaliser for the search box.
const normText = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Clickable table header that toggles sort on its column (module scope → stable component).
function SortTh({ label, k, sortKey, sortDir, onSort, className }: {
  label: string; k: RoleSortKey; sortKey: RoleSortKey | null; sortDir: 'asc' | 'desc'
  onSort: (k: RoleSortKey) => void; className?: string
}) {
  const active = sortKey === k
  return (
    <th className={cn('px-3 py-2 font-medium', className)}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {active ? (sortDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)
          : <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/40" />}
      </button>
    </th>
  )
}

// Manages functional roles (fonctions) — create/edit/delete + bulk delete, with two layouts:
//  - sortable (unit-type detail page): a dnd-kit ladder where top = most senior (drag sets the rank),
//    a star toggle picks the "default for new members" role, plus archived/global sections;
//  - table (all-types admin page): a flat sortable-by-API table with row checkboxes.
// Delete is archive-if-used: a role held by members is archived (kept on them, hidden from pickers)
// rather than hard-deleted; the confirm dialog lists the affected members.

export function FunctionalRolesList({ unitTypeId, unitTypeName, showUnitTypeColumn = false, showUnitTypeField = false, sortable = false }: FunctionalRolesListProps) {
  const { data: rolesRaw } = useFunctionalRoles(unitTypeId)
  const { data: profiles } = useSecurityProfiles()
  const { data: unitTypes } = useUnitTypes({ pageSize: 100 })
  const createMutation = useCreateFunctionalRole()
  const updateMutation = useUpdateFunctionalRole()
  const deleteMutation = useDeleteFunctionalRole()
  const unarchiveMutation = useUnarchiveFunctionalRole()
  const reorderMutation = useReorderFunctionalRoles()
  const setDefaultMutation = useSetDefaultFunctionalRole()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Table mode shows everything (active first, archived last); the order from the API is already
  // most-senior first (rank desc).
  const roles = rolesRaw ? [...rolesRaw].sort((a, b) => Number(a.isArchived) - Number(b.isArchived)) : rolesRaw
  // Sortable mode splits the list: draggable active type-specific roles, then archived, then globals.
  const typeActive = (rolesRaw ?? []).filter(r => r.unitTypeId === unitTypeId && !r.isArchived)
  const typeArchived = (rolesRaw ?? []).filter(r => r.unitTypeId === unitTypeId && r.isArchived)
  const globalRoles = (rolesRaw ?? []).filter(r => !r.unitTypeId)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FunctionalRoleDto | null>(null)
  const [deleting, setDeleting] = useState<FunctionalRoleDto | null>(null)
  const { data: deletingMembers } = useFunctionalRoleMembers(deleting?.id, !!deleting?.usedByMembers)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [unitTypeFilter, setUnitTypeFilter] = useState('') // all-types view only: '' = all, 'global' = no type, else a unit-type id
  // Table-view search / filters / column sort (ignored in drag-to-rank mode).
  const [search, setSearch] = useState('')
  const [profileFilter, setProfileFilter] = useState('all')     // 'all' or a security-profile name
  const [statusFilter, setStatusFilter] = useState('all')       // all | active | archived (default keeps archived visible, greyed)
  const [maitriseFilter, setMaitriseFilter] = useState('all')   // all | maitrise | youth
  const [sortKey, setSortKey] = useState<RoleSortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [form, setForm] = useState<FunctionalRoleFormData>({ name: '', code: '', securityProfileId: '' })
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()

  const toggleSort = (k: RoleSortKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }

  // Distinct security-profile names for the profile filter dropdown (from the full set).
  const profileOptions = useMemo(
    () => [...new Set((roles ?? []).map(r => r.securityProfileName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    [roles])

  // All-types table view: unit-type + profile + status + maîtrise filters, then a text search, then an optional
  // column sort. Other (drag) views ignore all of this and use `roles`/`typeActive` directly.
  const visibleRoles = useMemo(() => {
    if (!roles) return []
    let list = roles
    // Unit-type filter (Tous / Global / a specific type).
    if (showUnitTypeColumn && unitTypeFilter !== '')
      list = unitTypeFilter === 'global' ? list.filter(r => !r.unitTypeId) : list.filter(r => r.unitTypeId === unitTypeFilter)
    // Status (active / archived / all).
    if (statusFilter === 'active') list = list.filter(r => !r.isArchived)
    else if (statusFilter === 'archived') list = list.filter(r => r.isArchived)
    // Profile.
    if (profileFilter !== 'all') list = list.filter(r => r.securityProfileName === profileFilter)
    // Maîtrise vs youth.
    if (maitriseFilter === 'maitrise') list = list.filter(r => r.isMaitrise)
    else if (maitriseFilter === 'youth') list = list.filter(r => !r.isMaitrise)
    // Text search across name / code / unit type / profile / description.
    const q = normText(search.trim())
    if (q) list = list.filter(r => normText([r.name, r.code, r.unitTypeName ?? '', r.securityProfileName, r.description ?? ''].join(' ')).includes(q))
    // Column sort (when a header was clicked).
    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1
      list = [...list].sort((a, b) => {
        switch (sortKey) {
          case 'code': return a.code.localeCompare(b.code, 'fr') * dir
          case 'unitType': return (a.unitTypeName ?? '').localeCompare(b.unitTypeName ?? '', 'fr') * dir
          case 'profile': return a.securityProfileName.localeCompare(b.securityProfileName, 'fr') * dir
          case 'members': return (a.assignmentCount - b.assignmentCount) * dir
          case 'name':
          default: return a.name.localeCompare(b.name, 'fr') * dir
        }
      })
    }
    return list
  }, [roles, showUnitTypeColumn, unitTypeFilter, statusFilter, profileFilter, maitriseFilter, search, sortKey, sortDir])

  const activeFilterCount =
    (unitTypeFilter !== '' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) +
    (profileFilter !== 'all' ? 1 : 0) + (maitriseFilter !== 'all' ? 1 : 0) + (search.trim() ? 1 : 0)
  const resetFilters = () => { setUnitTypeFilter(''); setStatusFilter('all'); setProfileFilter('all'); setMaitriseFilter('all'); setSearch('') }

  const toggleOne = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  // Select-all operates on the currently-VISIBLE (filtered) rows only.
  const allVisibleSelected = visibleRoles.length > 0 && visibleRoles.every(r => selected.has(r.id))
  const someVisibleSelected = visibleRoles.some(r => selected.has(r.id))
  const toggleAll = () => setSelected(s => {
    const n = new Set(s)
    if (visibleRoles.length > 0 && visibleRoles.every(r => n.has(r.id))) visibleRoles.forEach(r => n.delete(r.id))
    else visibleRoles.forEach(r => n.add(r.id))
    return n
  })
  const selectedCount = selected.size

  const handleUnarchive = async (role: FunctionalRoleDto) => {
    try { await unarchiveMutation.mutateAsync(role.id); toast.success(`« ${role.name} » réactivée`) }
    catch (err) { toast.error(parseApiError(err)) }
  }

  const handleSetDefault = async (role: FunctionalRoleDto) => {
    try { await setDefaultMutation.mutateAsync(role.id); toast.success(`« ${role.name} » est la fonction par défaut des nouveaux membres`) }
    catch (err) { toast.error(parseApiError(err)) }
  }

  const handleDragEnd = async (e: DragEndEvent) => {
    if (reorderMutation.isPending) return // ignore a second drag while a reorder is in flight
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = typeActive.findIndex(r => r.id === active.id)
    const newIndex = typeActive.findIndex(r => r.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    // The list is derived from the (non-optimistic) query, so on error nothing is invalidated and the
    // order visually reverts on its own; we just surface the failure.
    try { await reorderMutation.mutateAsync(arrayMove(typeActive, oldIndex, newIndex).map(r => r.id)) }
    catch (err) { toast.error(parseApiError(err)) }
  }

  const handleBulkDelete = async () => {
    setBulkBusy(true)
    let deleted = 0, archived = 0, failed = 0
    const results = await Promise.allSettled([...selected].map(id => deleteMutation.mutateAsync(id)))
    for (const r of results) {
      if (r.status === 'rejected') failed++
      else if (r.value?.archived) archived++
      else deleted++
    }
    setBulkBusy(false); setBulkConfirm(false); setSelected(new Set())
    const parts = []
    if (deleted) parts.push(`${deleted} supprimée(s)`)
    if (archived) parts.push(`${archived} archivée(s) (utilisée(s) par des membres)`)
    if (failed) parts.push(`${failed} échec(s)`)
    if (failed && !deleted && !archived) toast.error(parts.join(' · '))
    else toast.success(parts.join(' · ') || 'Terminé')
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', code: '', description: '', securityProfileId: '', unitTypeId: unitTypeId ?? '', isMaitrise: false, isTeamLeader: false })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const openEdit = (item: FunctionalRoleDto) => {
    setEditing(item)
    setForm({ name: item.name, code: item.code, description: item.description ?? '', securityProfileId: item.securityProfileId, unitTypeId: item.unitTypeId ?? '', isMaitrise: item.isMaitrise, isTeamLeader: item.isTeamLeader })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ name: !form.name, code: !form.code, securityProfileId: !form.securityProfileId })) return
    try {
      const payload = { ...form, unitTypeId: form.unitTypeId || null, description: form.description || null }
      if (editing) await updateMutation.mutateAsync({ id: editing.id, ...payload })
      else await createMutation.mutateAsync(payload)
      setFormOpen(false)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    const name = deleting.name
    try {
      const res = await deleteMutation.mutateAsync(deleting.id)
      setDeleting(null)
      toast.success(res?.archived ? `« ${name} » archivée (utilisée par des membres)` : `« ${name} » supprimée`)
    }
    catch (err) { toast.error(parseApiError(err)); setDeleting(null) }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  // Small action cluster shared by both views.
  const RowActions = ({ role }: { role: FunctionalRoleDto }) => (
    <div className="flex gap-1">
      {role.isArchived ? (
        <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-7 sm:w-7" title="Réactiver" onClick={() => handleUnarchive(role)} disabled={unarchiveMutation.isPending}>
          <ArchiveRestore className="h-3.5 w-3.5 text-primary" />
        </Button>
      ) : sortable && (
        <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-7 sm:w-7" title={role.isDefaultForNewMembers ? 'Fonction par défaut des nouveaux membres' : 'Définir comme fonction par défaut des nouveaux membres'}
          onClick={() => handleSetDefault(role)} disabled={setDefaultMutation.isPending}>
          <Star className={cn('h-3.5 w-3.5', role.isDefaultForNewMembers ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
        </Button>
      )}
      <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-7 sm:w-7" onClick={() => openEdit(role)}><Pencil className="h-3.5 w-3.5" /></Button>
      <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-7 sm:w-7" title={role.usedByMembers ? 'Archiver' : 'Supprimer'} onClick={() => setDeleting(role)}>
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  )

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Fonctions {unitTypeName ? `— ${unitTypeName}` : ''}
            </CardTitle>
            {selectedCount > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{selectedCount} sélectionnée(s)</span>
                <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>Annuler</Button>
                <Button size="sm" variant="destructive" onClick={() => setBulkConfirm(true)}><Trash2 className="mr-1 h-3 w-3" />Supprimer la sélection</Button>
              </div>
            ) : (
              <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-3 w-3" />Nouvelle fonction</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

          {sortable ? (
            // ── Drag-to-rank view (unit-type page) ──
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Glissez pour classer (haut = fonction la plus élevée). L'étoile <Star className="inline h-3 w-3 fill-amber-400 text-amber-400" /> marque la fonction attribuée automatiquement aux nouveaux membres admis.
              </p>
              {typeActive.length > 0 && !typeActive.some(r => r.isDefaultForNewMembers) && (
                <p className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  Aucune fonction par défaut — les nouveaux membres n'auront pas de fonction attribuée. Cliquez sur l'étoile <Star className="inline h-3 w-3" /> d'une fonction pour la définir.
                </p>
              )}
              {typeActive.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune fonction pour ce type d'unité.</p>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={typeActive.map(r => r.id)} strategy={verticalListSortingStrategy}>
                    <ol className="space-y-2">
                      {typeActive.map(role => (
                        <SortableRoleCard key={role.id} role={role}
                          checked={selected.has(role.id)} onCheck={() => toggleOne(role.id)} actions={<RowActions role={role} />} />
                      ))}
                    </ol>
                  </SortableContext>
                </DndContext>
              )}

              {typeArchived.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Archivées</p>
                  {typeArchived.map(role => (
                    <div key={role.id} className="flex items-center gap-3 rounded-lg border bg-card p-2.5 opacity-60">
                      <span className="flex-1 text-sm">{role.name} <Badge variant="outline" className="ml-1 text-[10px]">Archivée</Badge></span>
                      <RowActions role={role} />
                    </div>
                  ))}
                </div>
              )}

              {globalRoles.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Fonctions globales (tous les types d'unité)</p>
                  {globalRoles.map(role => (
                    <div key={role.id} className="flex items-center gap-3 rounded-lg border bg-muted/20 p-2.5">
                      <span className="flex-1 text-sm">{role.name}{role.isArchived && <Badge variant="outline" className="ml-1 text-[10px]">Archivée</Badge>}</span>
                      <span className="text-xs text-muted-foreground">{role.securityProfileName}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : !roles || roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune fonction définie.</p>
          ) : (
            // ── Table view (all-types admin page) ──
            <div className="space-y-3">
              {/* Search + filters (all-types view). Controls stack full-width on mobile. */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="h-9 w-full pl-8 pr-7" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une fonction..." />
                  {search && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch('')} aria-label="Effacer"><X className="h-3.5 w-3.5" /></button>}
                </div>
                {showUnitTypeColumn && (
                  <Select value={unitTypeFilter || 'all'} onValueChange={(v) => { setUnitTypeFilter(v === 'all' ? '' : v); setSelected(new Set()) }}>
                    <SelectTrigger className="h-9 w-full sm:w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les types d'unité</SelectItem>
                      <SelectItem value="global">Global (tous les types)</SelectItem>
                      {unitTypes?.items.map(ut => <SelectItem key={ut.id} value={ut.id}>{ut.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <Select value={profileFilter} onValueChange={(v) => { setProfileFilter(v); setSelected(new Set()) }}>
                  <SelectTrigger className="h-9 w-full sm:w-48"><SelectValue placeholder="Profil" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les profils</SelectItem>
                    {profileOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={maitriseFilter} onValueChange={(v) => { setMaitriseFilter(v); setSelected(new Set()) }}>
                  <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes (maîtrise + jeunes)</SelectItem>
                    <SelectItem value="maitrise">Maîtrise</SelectItem>
                    <SelectItem value="youth">Jeunes</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setSelected(new Set()) }}>
                  <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    <SelectItem value="active">Actives</SelectItem>
                    <SelectItem value="archived">Archivées</SelectItem>
                  </SelectContent>
                </Select>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => { resetFilters(); setSelected(new Set()) }}><X className="mr-1 h-3.5 w-3.5" />Réinitialiser</Button>
                )}
                <span className="text-xs text-muted-foreground sm:ml-auto">{visibleRoles.length} fonction{visibleRoles.length > 1 ? 's' : ''}</span>
              </div>

              {/* Star legend — shown only when a default fonction is present in the current view. */}
              {visibleRoles.some(r => r.isDefaultForNewMembers) && (
                <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                  = fonction attribuée par défaut aux nouveaux membres de ce type d'unité
                </p>
              )}

              {visibleRoles.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune fonction pour ce filtre.</p>
              ) : (
                <>
                  {/* Desktop: table */}
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-left">
                          <th className="w-10 px-3 py-2">
                            <input type="checkbox" className="h-4 w-4 align-middle accent-primary" aria-label="Tout sélectionner"
                              checked={allVisibleSelected}
                              ref={el => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected }}
                              onChange={toggleAll} />
                          </th>
                          <SortTh label="Nom" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortTh label="Code" k="code" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          {showUnitTypeColumn && <SortTh label="Type d'unité" k="unitType" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
                          <SortTh label="Profil" k="profile" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortTh label="Membres" k="members" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-center" />
                          <th className="w-20" />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRoles.map((role, idx) => (
                          <tr key={role.id} className={`border-b border-l-4 hover:bg-muted/30 transition-colors ${idx % 2 === 1 ? 'bg-muted/10' : ''} ${role.isArchived ? 'opacity-60' : ''}`} style={{ borderLeftColor: role.unitTypeColor ?? '#d1d5db' }}>
                            <td className="px-3 py-2.5">
                              <input type="checkbox" className="h-4 w-4 align-middle accent-primary" aria-label={`Sélectionner ${role.name}`} checked={selected.has(role.id)} onChange={() => toggleOne(role.id)} />
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="font-medium">{role.name}</span>
                              {role.isDefaultForNewMembers && <Star className="ml-1.5 inline h-3.5 w-3.5 fill-amber-400 align-text-bottom text-amber-400" />}
                              {role.isArchived && <Badge variant="outline" className="ml-2 text-[10px]">Archivée</Badge>}
                              {role.description && <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>}
                            </td>
                            {/* Code / Type / Profil rendered as plain text (same font as the Nom column) — no
                                mono/italic/pill — so every column reads consistently. */}
                            <td className="px-3 py-2.5">{role.code}</td>
                            {showUnitTypeColumn && (
                              <td className="px-3 py-2.5">{role.unitTypeName ?? 'Global'}</td>
                            )}
                            <td className="px-3 py-2.5">{role.securityProfileName}</td>
                            <td className="px-3 py-2.5 text-center">
                              {role.assignmentCount > 0 ? <span className="font-medium">{role.assignmentCount}</span> : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-2.5"><RowActions role={role} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile: card list (the table squeezes the columns into unreadable wrapping). */}
                  <div className="space-y-2 md:hidden">
                    {visibleRoles.map(role => (
                      <div key={role.id} className={cn('rounded-lg border border-l-4 p-3', role.isArchived && 'opacity-60')} style={{ borderLeftColor: role.unitTypeColor ?? '#d1d5db' }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2">
                            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" aria-label={`Sélectionner ${role.name}`} checked={selected.has(role.id)} onChange={() => toggleOne(role.id)} />
                            <div className="min-w-0">
                              <div className="text-sm font-medium leading-snug">
                                {role.name}
                                {role.isDefaultForNewMembers && <Star className="ml-1.5 inline h-3.5 w-3.5 fill-amber-400 align-text-bottom text-amber-400" />}
                                {role.isArchived && <Badge variant="outline" className="ml-2 text-[10px]">Archivée</Badge>}
                              </div>
                              {role.description && <p className="mt-0.5 text-xs text-muted-foreground">{role.description}</p>}
                            </div>
                          </div>
                          <div className="shrink-0"><RowActions role={role} /></div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="font-mono text-xs">{role.code}</Badge>
                          <span className="text-xs text-muted-foreground">{role.unitTypeName ?? 'Global'}</span>
                          <Badge variant="secondary" className="text-xs">{role.securityProfileName}</Badge>
                          {role.assignmentCount > 0 && <span className="text-xs text-muted-foreground">· {role.assignmentCount} membre{role.assignmentCount > 1 ? 's' : ''}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier la fonction' : 'Nouvelle fonction'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <FormFieldErrors show={hasErrors} />
            <div className="space-y-2">
              <RequiredLabel required>Nom</RequiredLabel>
              <Input className={fieldClass('name')} value={form.name} onChange={(e) => { setForm(f => ({ ...f, name: e.target.value })); clearField('name') }} required />
            </div>
            <div className="space-y-2">
              <RequiredLabel required>Code</RequiredLabel>
              <Input className={fieldClass('code')} value={form.code} onChange={(e) => { setForm(f => ({ ...f, code: e.target.value })); clearField('code') }} required />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Description</RequiredLabel>
              <Input value={form.description ?? ''} onChange={(e) => setForm(f => ({ ...f, description: e.target.value || null }))} />
            </div>
            <div className="space-y-2">
              <RequiredLabel required>Profil de sécurité</RequiredLabel>
              <Select value={form.securityProfileId} onValueChange={(v) => { setForm(f => ({ ...f, securityProfileId: v })); clearField('securityProfileId') }}>
                <SelectTrigger className={fieldClass('securityProfileId')}><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent>
                  {profiles?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Fonction de maîtrise</p>
                <p className="text-xs text-muted-foreground">Apparaît sur la page Maîtrises (chef/assistant/aumônier…)</p>
              </div>
              <Switch checked={!!form.isMaitrise} onCheckedChange={(v) => setForm(f => ({ ...f, isMaitrise: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Chef d'équipe</p>
                <p className="text-xs text-muted-foreground">Le membre peut voir son équipe et remplir les présences de ses réunions</p>
              </div>
              <Switch checked={!!form.isTeamLeader} onCheckedChange={(v) => setForm(f => ({ ...f, isTeamLeader: v }))} />
            </div>
            {showUnitTypeField && (
              <div className="space-y-2">
                <RequiredLabel>Type d'unité</RequiredLabel>
                <Select value={form.unitTypeId ?? ''} onValueChange={(v) => setForm(f => ({ ...f, unitTypeId: v === 'global' ? null : v }))}>
                  <SelectTrigger><SelectValue placeholder="Global (tous les types)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global (tous les types)</SelectItem>
                    {unitTypes?.items.map(ut => <SelectItem key={ut.id} value={ut.id}>{ut.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Le classement (rang) se règle en glissant les fonctions sur la page du type d'unité.</p>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title={deleting?.usedByMembers ? 'Archiver la fonction' : 'Supprimer la fonction'}
        description={deleting?.usedByMembers
          ? `« ${deleting?.name} » est utilisée par des membres : elle sera archivée (masquée des listes mais conservée sur les membres qui la portent) plutôt que supprimée.`
          : `Êtes-vous sûr de vouloir supprimer « ${deleting?.name} » ?`}
        confirmLabel={deleting?.usedByMembers ? 'Archiver' : 'Supprimer'}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      >
        {deleting?.usedByMembers && deletingMembers && deletingMembers.length > 0 && (
          <div className="rounded-md border">
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              {deletingMembers.length} membre{deletingMembers.length > 1 ? 's' : ''} concerné{deletingMembers.length > 1 ? 's' : ''}
            </div>
            <div className="max-h-48 divide-y overflow-y-auto">
              {deletingMembers.map(m => (
                <div key={m.memberId} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="flex-1 truncate">{m.lastName} {m.firstName}</span>
                  {m.unitCode && <Badge variant="outline" className="shrink-0 text-[10px]">{m.unitCode}</Badge>}
                  {!m.active && <span className="shrink-0 text-[10px] text-muted-foreground">(terminé)</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={bulkConfirm}
        onOpenChange={() => setBulkConfirm(false)}
        title="Supprimer la sélection"
        description={`${selectedCount} fonction(s) sélectionnée(s). Celles utilisées par des membres seront archivées (conservées sur les membres), les autres supprimées définitivement.`}
        confirmLabel="Confirmer"
        variant="destructive"
        loading={bulkBusy}
        onConfirm={handleBulkDelete}
      />
    </>
  )
}

function SortableRoleCard({ role, checked, onCheck, actions }: { role: FunctionalRoleDto; checked: boolean; onCheck: () => void; actions: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: role.id })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-3 rounded-lg border bg-card p-3', isDragging && 'shadow-lg')}>
      <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" aria-label={`Sélectionner ${role.name}`} checked={checked} onChange={onCheck} />
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"><GripVertical className="h-4 w-4" /></button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{role.name}</span>
          {role.isDefaultForNewMembers && <Badge variant="outline" className="gap-1 text-[10px]"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />Défaut</Badge>}
          <span className="text-xs text-muted-foreground">{role.securityProfileName}</span>
        </div>
        {role.description && <p className="truncate text-xs text-muted-foreground">{role.description}</p>}
      </div>
      {role.assignmentCount > 0 && <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">{role.assignmentCount} membre{role.assignmentCount > 1 ? 's' : ''}</span>}
      {actions}
    </li>
  )
}
