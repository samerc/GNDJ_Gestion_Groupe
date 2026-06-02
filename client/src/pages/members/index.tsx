import { parseApiError } from '@/lib/error-utils'
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { useFormValidation } from '@/hooks/use-form-validation'
import { useMembers, useCreateMember, useDeleteMember, type MemberListDto, type MemberFormData } from '@/services/member-service'
import { useDebounce } from '@/hooks/use-debounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { useSettingArray } from '@/services/settings-service'
import { GENDER_OPTIONS, BLOOD_TYPE_OPTIONS, NATIONALITY_OPTIONS } from '@/lib/options'
import { Plus, Trash2, Search, Users, Eye } from 'lucide-react'

export default function MembersPage() {
  const navigate = useNavigate()
  const pinnedNationalities = useSettingArray('pinned_nationalities')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [credentialsDialog, setCredentialsDialog] = useState<{ username: string; password: string; memberId: string } | null>(null)
  const [deleting, setDeleting] = useState<MemberListDto | null>(null)
  const [form, setForm] = useState<MemberFormData>({ firstName: '', lastName: '' })
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()
  const hasLoadedOnce = useRef(false)

  const { data, isLoading } = useMembers({ search: debouncedSearch || undefined, page })
  const createMutation = useCreateMember()
  const deleteMutation = useDeleteMember()

  if (data && data.totalCount > 0) hasLoadedOnce.current = true
  const showSearch = hasLoadedOnce.current || (data && data.totalCount > 0)

  const openCreate = () => {
    setForm({ firstName: '', lastName: '', dateOfBirth: '', gender: '', cardNumber: '', bloodType: '', nationality: '', school: '' })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ firstName: !form.firstName, lastName: !form.lastName })) return
    try {
      const payload = {
        ...form,
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
        cardNumber: form.cardNumber || null,
        bloodType: form.bloodType || null,
        nationality: form.nationality || null,
        school: form.school || null,
      }
      const result = await createMutation.mutateAsync(payload)
      setFormOpen(false)
      setCredentialsDialog({ username: result.username, password: result.temporaryPassword, memberId: result.memberId })
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteMutation.mutateAsync(deleting.id)
      setDeleting(null)
    } catch (err) {
      setError(parseApiError(err))
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Membres</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau membre
        </Button>
      </div>

      {showSearch && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, prénom ou carte..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun membre"
          description={search ? 'Aucun résultat pour cette recherche.' : 'Ajoutez votre premier membre.'}
          action={!search && <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Ajouter</Button>}
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Prénom</TableHead>
                  <TableHead>Date de naissance</TableHead>
                  <TableHead>N° Carte</TableHead>
                  <TableHead>Courriel</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => navigate(`/members/${item.id}`)}>
                    <TableCell className="font-medium">{item.lastName}</TableCell>
                    <TableCell>{item.firstName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.dateOfBirth ? new Date(item.dateOfBirth).toLocaleDateString('fr-FR') : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.cardNumber ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{item.primaryEmail ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{item.primaryPhone ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/members/${item.id}`)}>
                          <Eye className="h-4 w-4" />
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

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{data.totalCount} résultat{data.totalCount > 1 ? 's' : ''}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={!data.hasPreviousPage} onClick={() => setPage(p => p - 1)}>Précédent</Button>
                <span className="flex items-center text-sm text-muted-foreground">Page {data.page} / {data.totalPages}</span>
                <Button variant="outline" size="sm" disabled={!data.hasNextPage} onClick={() => setPage(p => p + 1)}>Suivant</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouveau membre</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <FormFieldErrors show={hasErrors} />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel htmlFor="firstName" required>Prénom</RequiredLabel>
                <Input id="firstName" className={fieldClass('firstName')} value={form.firstName} onChange={(e) => { setForm(f => ({ ...f, firstName: e.target.value })); clearField('firstName') }} required />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="lastName" required>Nom</RequiredLabel>
                <Input id="lastName" className={fieldClass('lastName')} value={form.lastName} onChange={(e) => { setForm(f => ({ ...f, lastName: e.target.value })); clearField('lastName') }} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel htmlFor="dateOfBirth">Date de naissance</RequiredLabel>
                <Input id="dateOfBirth" type="date" value={form.dateOfBirth ?? ''} onChange={(e) => setForm(f => ({ ...f, dateOfBirth: e.target.value || null }))} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Sexe</RequiredLabel>
                <Select value={form.gender ?? ''} onValueChange={(v) => setForm(f => ({ ...f, gender: v || null }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel htmlFor="cardNumber">N° Carte</RequiredLabel>
                <Input id="cardNumber" value={form.cardNumber ?? ''} onChange={(e) => setForm(f => ({ ...f, cardNumber: e.target.value || null }))} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Nationalité</RequiredLabel>
                <SearchableSelect
                  value={form.nationality ?? ''}
                  onValueChange={(v) => setForm(f => ({ ...f, nationality: v || null }))}
                  options={NATIONALITY_OPTIONS}
                  pinnedValues={pinnedNationalities}
                  searchPlaceholder="Rechercher une nationalité..."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel>Groupe sanguin</RequiredLabel>
                <Select value={form.bloodType ?? ''} onValueChange={(v) => setForm(f => ({ ...f, bloodType: v || null }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    {BLOOD_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="school">École</RequiredLabel>
                <Input id="school" value={form.school ?? ''} onChange={(e) => setForm(f => ({ ...f, school: e.target.value || null }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Création...' : 'Créer et voir la fiche'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Supprimer le membre"
        description={`Êtes-vous sûr de vouloir supprimer « ${deleting?.firstName} ${deleting?.lastName} » ?`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />

      {/* Credentials dialog — shown after member creation */}
      <Dialog open={!!credentialsDialog} onOpenChange={() => { if (credentialsDialog) navigate(`/members/${credentialsDialog.memberId}`); setCredentialsDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compte créé avec succès</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Un compte utilisateur a été créé automatiquement. Notez ces informations — le mot de passe ne sera plus affiché.
            </p>
            <div className="rounded-md bg-muted p-4 space-y-2 font-mono text-sm">
              <div>
                <span className="text-muted-foreground">Nom d'utilisateur : </span>
                <span className="font-bold">{credentialsDialog?.username}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Mot de passe : </span>
                <span className="font-bold">{credentialsDialog?.password}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { if (credentialsDialog) navigate(`/members/${credentialsDialog.memberId}`); setCredentialsDialog(null) }}>
              Voir la fiche du membre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
