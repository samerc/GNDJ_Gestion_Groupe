import { useState } from 'react'
import { useActiveCustomFields, useMemberCustomFieldValues, useSetMemberCustomFieldValue, useDeleteMemberCustomFieldValue, type CustomFieldListDto, type MemberCustomFieldValueDto } from '@/services/custom-field-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Check, X, Pencil, Trash2, ListPlus } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  memberId: string
}

function FieldRow({ field, existing, memberId }: { field: CustomFieldListDto; existing: MemberCustomFieldValueDto | undefined; memberId: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const setMutation = useSetMemberCustomFieldValue(memberId)
  const deleteMutation = useDeleteMemberCustomFieldValue(memberId)

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
      await deleteMutation.mutateAsync(existing.id)
      toast.success('Valeur supprimée')
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') setEditing(false)
  }

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
      </div>
      {editing ? (
        <div className="flex items-center gap-2">
          {renderEditor()}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave} disabled={setMutation.isPending}>
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {existing && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDelete} disabled={deleteMutation.isPending}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export function MemberCustomFields({ memberId }: Props) {
  const { data: fields, isLoading: fieldsLoading } = useActiveCustomFields()
  const { data: values, isLoading: valuesLoading } = useMemberCustomFieldValues(memberId)

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
        return <FieldRow key={field.id} field={field} existing={existing} memberId={memberId} />
      })}
    </div>
  )
}
