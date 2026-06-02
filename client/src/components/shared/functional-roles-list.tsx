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
            <div className="space-y-2">
              {roles.map(role => (
                <div key={role.id} className="group flex items-center gap-3 rounded-md border p-3 hover:bg-muted/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{role.name}</span>
                      <Badge variant="outline" className="text-xs">{role.code}</Badge>
                      <Badge variant="secondary" className="text-xs">{role.securityProfileName}</Badge>
                      {showUnitTypeColumn && (
                        <span className="text-xs text-muted-foreground">
                          {role.unitTypeName ?? 'Global'}
                        </span>
                      )}
                    </div>
                    {role.description && <p className="text-sm text-muted-foreground mt-0.5">{role.description}</p>}
                    {role.assignmentCount > 0 && <span className="text-xs text-muted-foreground">{role.assignmentCount} membre{role.assignmentCount > 1 ? 's' : ''} actif{role.assignmentCount > 1 ? 's' : ''}</span>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(role)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleting(role)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
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
