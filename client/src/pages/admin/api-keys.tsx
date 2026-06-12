import { parseApiError } from '@/lib/error-utils'
import { useState } from 'react'
import { useApiKeys, useCreateApiKey, useToggleApiKey, useDeleteApiKey, type ApiKeyDto } from '@/services/api-key-service'
import { useMembers } from '@/services/member-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { RequiredLabel } from '@/components/shared/required-label'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { useFormValidation } from '@/hooks/use-form-validation'
import { Plus, Trash2, Key, Copy, ToggleLeft, ToggleRight } from 'lucide-react'
import { toast } from 'sonner'

const AVAILABLE_SCOPES = [
  { value: 'members:read-own', label: 'Lire son profil' },
  { value: 'documents:upload', label: 'Envoyer des documents' },
  { value: 'cotisations:read-own', label: 'Voir ses cotisations' },
  { value: 'members:read', label: 'Lire tous les membres (admin)' },
  { value: 'members:write', label: 'Modifier les membres (admin)' },
  { value: 'documents:read', label: 'Lire tous les documents (admin)' },
]

interface CreateForm {
  name: string
  scopes: string[]
  memberId: string
  expiresAt: string
}

const defaultForm: CreateForm = { name: '', scopes: [], memberId: '', expiresAt: '' }

export default function ApiKeysPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<ApiKeyDto | null>(null)
  const [form, setForm] = useState<CreateForm>(defaultForm)
  const [error, setError] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [createdKeyDialogOpen, setCreatedKeyDialogOpen] = useState(false)
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()

  const { data: apiKeys, isLoading } = useApiKeys()
  const { data: membersData } = useMembers({ pageSize: 500 })
  const createMutation = useCreateApiKey()
  const toggleMutation = useToggleApiKey()
  const deleteMutation = useDeleteApiKey()

  const openCreate = () => {
    setForm(defaultForm)
    setError(''); clearAll()
    setFormOpen(true)
  }

  const handleScopeToggle = (scope: string) => {
    setForm(f => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter(s => s !== scope) : [...f.scopes, scope],
    }))
    clearField('scopes')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ name: !form.name, scopes: form.scopes.length === 0 })) return
    try {
      const result = await createMutation.mutateAsync({
        name: form.name,
        scopes: form.scopes.join(','),
        memberId: form.memberId || null,
        expiresAt: form.expiresAt || null,
      })
      toast.success('Cle API creee')
      setFormOpen(false)
      setCreatedKey(result.key)
      setCreatedKeyDialogOpen(true)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleToggle = async (id: string) => {
    try {
      await toggleMutation.mutateAsync(id)
      toast.success('Statut modifie')
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteMutation.mutateAsync(deleting.id)
      toast.success('Cle API supprimee')
      setDeleting(null)
    } catch (err) {
      toast.error(parseApiError(err))
      setDeleting(null)
    }
  }

  const handleCopyKey = async () => {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey)
      toast.success('Cle copiee dans le presse-papiers')
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cles API</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle cle
        </Button>
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !apiKeys || apiKeys.length === 0 ? (
        <EmptyState
          icon={Key}
          title="Aucune cle API"
          description="Creez votre premiere cle API."
          action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Creer</Button>}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Prefixe</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Membre lie</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Derniere utilisation</TableHead>
                <TableHead>Expiration</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((item) => (
                <TableRow key={item.id} className="even:bg-muted/30">
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{item.keyPrefix}...</code>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {item.scopes.split(',').map((scope) => (
                        <Badge key={scope} variant="outline" className="text-xs">{scope.trim()}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.memberName ?? '\u2014'}</TableCell>
                  <TableCell>
                    {item.isActive
                      ? <Badge className="bg-green-600">Active</Badge>
                      : <Badge variant="secondary">Inactive</Badge>
                    }
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.lastUsedAt ? formatDate(item.lastUsedAt) : 'Jamais'}</TableCell>
                  <TableCell className="text-muted-foreground">{item.expiresAt ? formatDate(item.expiresAt) : 'Aucune'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleToggle(item.id)} title={item.isActive ? 'Desactiver' : 'Activer'}>
                        {item.isActive
                          ? <ToggleRight className="h-4 w-4 text-green-600" />
                          : <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                        }
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleting(item)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle cle API</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            {hasErrors && <FormFieldErrors show={hasErrors} />}
            <div className="space-y-2">
              <RequiredLabel htmlFor="name" required>Nom</RequiredLabel>
              <Input id="name" className={fieldClass('name')} value={form.name} onChange={(e) => { setForm(f => ({ ...f, name: e.target.value })); clearField('name') }} required />
            </div>
            <div className="space-y-2">
              <RequiredLabel required>Scopes</RequiredLabel>
              <div className={`space-y-2 rounded-md border p-3 ${fieldClass('scopes')}`}>
                {AVAILABLE_SCOPES.map((scope) => (
                  <label key={scope.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.scopes.includes(scope.value)}
                      onChange={() => handleScopeToggle(scope.value)}
                    />
                    <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded break-all">{scope.value}</code>
                    <span className="text-muted-foreground">{scope.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <RequiredLabel htmlFor="memberId">Membre lie (optionnel)</RequiredLabel>
              <select
                id="memberId"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={form.memberId}
                onChange={(e) => setForm(f => ({ ...f, memberId: e.target.value }))}
              >
                <option value="">-- Aucun --</option>
                {membersData?.items.map((m) => (
                  <option key={m.id} value={m.id}>{m.firstName} {m.lastName}{m.cardNumber ? ` (${m.cardNumber})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <RequiredLabel htmlFor="expiresAt">Expiration (optionnel)</RequiredLabel>
              <Input id="expiresAt" type="datetime-local" value={form.expiresAt} onChange={(e) => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Creation...' : 'Creer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Key display dialog (shown once after creation) */}
      <Dialog open={createdKeyDialogOpen} onOpenChange={(open) => { if (!open) { setCreatedKey(null); setCreatedKeyDialogOpen(false) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cle API creee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              Cette cle ne sera plus visible apres fermeture de cette fenetre.
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md bg-muted p-3 text-sm font-mono break-all select-all">{createdKey}</code>
              <Button variant="outline" size="icon" onClick={handleCopyKey} title="Copier">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { setCreatedKey(null); setCreatedKeyDialogOpen(false) }}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Supprimer la cle API"
        description={`Etes-vous sur de vouloir supprimer la cle \u00ab ${deleting?.name} \u00bb ? Cette action est irreversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
