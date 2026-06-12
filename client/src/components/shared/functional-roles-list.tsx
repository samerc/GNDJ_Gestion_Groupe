import { useState } from 'react'
import { useFormValidation } from '@/hooks/use-form-validation'
import { parseApiError } from '@/lib/error-utils'
import { useFunctionalRoles, useCreateFunctionalRole, useUpdateFunctionalRole, useDeleteFunctionalRole, useSecurityProfiles, type FunctionalRoleDto, type FunctionalRoleFormData } from '@/services/role-service'
import { useUnitTypes } from '@/services/unit-type-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Plus, Pencil, Trash2, Shield } from 'lucide-react'

interface FunctionalRolesListProps {
  unitTypeId?: string
  unitTypeName?: string
  showUnitTypeColumn?: boolean
  showUnitTypeField?: boolean
}

export function FunctionalRolesList({ unitTypeId, unitTypeName, showUnitTypeColumn = false, showUnitTypeField = false }: FunctionalRolesListProps) {
  const { data: roles } = useFunctionalRoles(unitTypeId)
  const { data: profiles } = useSecurityProfiles()
  const { data: unitTypes } = useUnitTypes({ pageSize: 100 })
  const createMutation = useCreateFunctionalRole()
  const updateMutation = useUpdateFunctionalRole()
  const deleteMutation = useDeleteFunctionalRole()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FunctionalRoleDto | null>(null)
  const [deleting, setDeleting] = useState<FunctionalRoleDto | null>(null)
  const [form, setForm] = useState<FunctionalRoleFormData>({ name: '', code: '', securityProfileId: '' })
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', code: '', description: '', securityProfileId: '', unitTypeId: unitTypeId ?? '' })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const openEdit = (item: FunctionalRoleDto) => {
    setEditing(item)
    setForm({ name: item.name, code: item.code, description: item.description ?? '', securityProfileId: item.securityProfileId, unitTypeId: item.unitTypeId ?? '' })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ name: !form.name, code: !form.code, securityProfileId: !form.securityProfileId })) return
    try {
      const payload = { ...form, unitTypeId: form.unitTypeId || null, description: form.description || null }
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload })
      } else {
        await createMutation.mutateAsync(payload)
      }
      setFormOpen(false)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { await deleteMutation.mutateAsync(deleting.id); setDeleting(null) }
    catch (err) { setError(parseApiError(err)); setDeleting(null) }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Fonctions {unitTypeName ? `— ${unitTypeName}` : ''}
            </CardTitle>
            <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-3 w-3" />Nouvelle fonction</Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          {!roles || roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune fonction définie.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-3 py-2 font-medium">Nom</th>
                    <th className="px-3 py-2 font-medium">Code</th>
                    {showUnitTypeColumn && <th className="px-3 py-2 font-medium">Type d'unité</th>}
                    <th className="px-3 py-2 font-medium">Profil</th>
                    <th className="px-3 py-2 text-center font-medium">Membres</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role, idx) => {
                    return (
                      <tr key={role.id} className={`border-b border-l-4 hover:bg-muted/30 transition-colors ${idx % 2 === 1 ? 'bg-muted/10' : ''}`} style={{ borderLeftColor: role.unitTypeColor ?? '#d1d5db' }}>
                        <td className="px-3 py-2.5">
                          <span className="font-medium">{role.name}</span>
                          {role.description && <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>}
                        </td>
                        <td className="px-3 py-2.5"><Badge variant="outline" className="text-xs font-mono">{role.code}</Badge></td>
                        {showUnitTypeColumn && (
                          <td className="px-3 py-2.5 text-muted-foreground">{role.unitTypeName ?? <span className="italic">Global</span>}</td>
                        )}
                        <td className="px-3 py-2.5"><Badge variant="secondary" className="text-xs">{role.securityProfileName}</Badge></td>
                        <td className="px-3 py-2.5 text-center">
                          {role.assignmentCount > 0 ? <span className="font-medium">{role.assignmentCount}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(role)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(role)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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
        title="Supprimer la fonction"
        description={`Êtes-vous sûr de vouloir supprimer « ${deleting?.name} » ?`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </>
  )
}
