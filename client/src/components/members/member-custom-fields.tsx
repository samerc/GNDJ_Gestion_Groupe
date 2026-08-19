import { useState } from 'react'
import { useActiveCustomFields, useMemberCustomFieldValues, useSetMemberCustomFieldValue, useDeleteMemberCustomFieldValue, useSetMyCustomFieldValue, useDeleteMyCustomFieldValue, type CustomFieldListDto, type CustomFieldEditableBy, type MemberCustomFieldValueDto } from '@/services/custom-field-service'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Tip } from '@/components/ui/tooltip'
import { Check, X, Pencil, Trash2, ListPlus, Lock } from 'lucide-react'
import { toast } from 'sonner'

// "Infos complémentaires" tab of the member detail page + Ma fiche. Renders the admin-defined custom fields
// (text/number/select/boolean) and lets each be edited inline per field type — but ONLY if the current user
// is allowed to fill that field (field.editableBy: Member / UnitLeader / GroupLeader). Non-editable fields
// are read-only with a "Rempli par …" hint. selfService = the member editing their OWN fiche (Ma fiche):
// uses the /my-profile self-service endpoints and can only touch Member-scoped fields.
interface Props {
  memberId: string
  selfService?: boolean
}

// Human hint for who fills a field (shown when the field is read-only for the current user).
const EDITABLE_HINT: Record<CustomFieldEditableBy, string> = {
  Member: 'Rempli par le membre',
  UnitLeader: "Rempli par le chef d'unité",
  GroupLeader: 'Rempli par le chef de groupe',
}

// One field's row: shows the current value, swaps to a type-appropriate editor on "edit", and
// upserts via setMutation (delete clears it). Enter saves / Escape cancels. `existing` is the
// member's saved value for this field, undefined when none has been set yet. `canEdit` gates the
// edit/delete controls; `selfService` picks the own-record endpoints.
function FieldRow({ field, existing, memberId, canEdit, selfService }: { field: CustomFieldListDto; existing: MemberCustomFieldValueDto | undefined; memberId: string; canEdit: boolean; selfService?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  // Instantiate both hook sets (rules of hooks) and pick per selfService — mutations don't fetch, so this is free.
  const setLeader = useSetMemberCustomFieldValue(memberId), setSelf = useSetMyCustomFieldValue(memberId)
  const delLeader = useDeleteMemberCustomFieldValue(memberId), delSelf = useDeleteMyCustomFieldValue(memberId)
  const setMutation = selfService ? setSelf : setLeader
  const deleteMutation = selfService ? delSelf : delLeader

  const startEdit = () => {
    setValue(existing?.value ?? '')
    setEditing(true)
  }

  const handleSave = async () => {
    try {
      await setMutation.mutateAsync({ customFieldId: field.id, value })
      toast.success('Valeur enregistrée')
      setEditing(false)
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const handleDelete = async () => {
    if (!existing) return
    try {
      // Self-service clears by field id; the leader endpoint clears by the value's id.
      if (selfService) await delSelf.mutateAsync(field.id)
      else await delLeader.mutateAsync(existing.id)
      toast.success('Valeur supprimée')
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') setEditing(false)
  }

  // Select-type fields store their choices as a JSON string array; tolerate malformed JSON.
  const options: string[] = field.options ? (() => { try { return JSON.parse(field.options) as string[] } catch { return [] } })() : []

  const displayValue = () => {
    if (!existing) return <span className="text-muted-foreground">—</span>
    if (field.fieldType === 'boolean') return existing.value === 'true' ? 'Oui' : 'Non'
    return existing.value
  }

  const renderEditor = () => {
    switch (field.fieldType) {
      case 'number':
        return <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={handleKeyDown} className="h-8 w-48" autoFocus />
      case 'select':
        return (
          <Select value={value} onValueChange={(v) => setValue(v)}>
            <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
            <SelectContent>
              {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        )
      case 'boolean':
        return (
          <Select value={value || 'false'} onValueChange={(v) => setValue(v)}>
            <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Oui</SelectItem>
              <SelectItem value="false">Non</SelectItem>
            </SelectContent>
          </Select>
        )
      default:
        return <Input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={handleKeyDown} className="h-8 w-48" autoFocus />
    }
  }

  return (
    <div className="flex items-center justify-between rounded-md border px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{field.name}</p>
        {!editing && <p className="text-sm">{displayValue()}</p>}
        {/* When the current user can't fill this field, explain who does (only if not actively editing). */}
        {!editing && !canEdit && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />{EDITABLE_HINT[field.editableBy]}
          </p>
        )}
      </div>
      {editing ? (
        <div className="flex items-center gap-2">
          {renderEditor()}
          <Tip content="Enregistrer"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave} disabled={setMutation.isPending}>
            <Check className="h-3.5 w-3.5" />
          </Button></Tip>
          <Tip content="Annuler"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(false)}>
            <X className="h-3.5 w-3.5" />
          </Button></Tip>
        </div>
      ) : canEdit ? (
        <div className="flex items-center gap-1">
          <Tip content="Modifier"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button></Tip>
          {existing && (
            <Tip content="Supprimer"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDelete} disabled={deleteMutation.isPending}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button></Tip>
          )}
        </div>
      ) : null}
    </div>
  )
}

export function MemberCustomFields({ memberId, selfService }: Props) {
  const { data: fields, isLoading: fieldsLoading } = useActiveCustomFields()
  const { data: values, isLoading: valuesLoading } = useMemberCustomFieldValues(memberId)
  const { user, hasPermission } = useAuthStore()

  // Current user's capability. A group manager (CG/ACG/super-admin) can edit any field; a unit leader
  // (members.edit → CU) can edit Member + UnitLeader fields; on Ma fiche (selfService) the member can edit
  // only Member fields. This mirrors the server-side enforcement.
  const isGroupManager = !!user?.isSuperAdmin || hasPermission(PERMISSIONS.MAITRISE_MANAGE)
  const isUnitLeader = hasPermission(PERMISSIONS.MEMBERS_EDIT)
  const canEditField = (editableBy: CustomFieldEditableBy): boolean => {
    if (selfService) return editableBy === 'Member'
    if (editableBy === 'GroupLeader') return isGroupManager
    return isUnitLeader // Member + UnitLeader fields: any unit leader (or above)
  }

  if (fieldsLoading || valuesLoading) return <LoadingSpinner />
  if (!fields || fields.length === 0) return (
    <EmptyState
      icon={ListPlus}
      title="Aucun champ personnalisé"
      description="Aucun champ personnalisé n'est configuré."
    />
  )

  return (
    <div className="space-y-2">
      {fields.map(field => {
        const existing = values?.find(v => v.customFieldId === field.id)
        return <FieldRow key={field.id} field={field} existing={existing} memberId={memberId} canEdit={canEditField(field.editableBy)} selfService={selfService} />
      })}
    </div>
  )
}
