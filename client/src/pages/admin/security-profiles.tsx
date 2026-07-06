// Admin "Profils de sécurité" screen. Master/detail: a profile list on the left, and on the right
// either the PERMISSION EDITOR (checklist grouped by category) or the MEMBERS tab (who holds this
// profile via their active function). Permission editing + create/delete are gated by roles.manage
// (super-admin); a Chef de Groupe with only roles.view sees the Membres tab read-only. System
// profiles (isSystem) can't be deleted. Editor edits are staged locally until "Enregistrer".
import { parseApiError } from '@/lib/error-utils'
import { useState } from 'react'
import { useSecurityProfiles, useSecurityProfile, useUpdateSecurityProfilePermissions, useCreateSecurityProfile, useDeleteSecurityProfile } from '@/services/security-profile-service'
import { useSecurityProfileMembers } from '@/services/role-service'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { RequiredLabel } from '@/components/shared/required-label'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Shield, ChevronRight, Save, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

// All permissions grouped by category for the editor
const PERMISSION_GROUPS: { label: string; permissions: { value: string; label: string }[] }[] = [
  {
    label: 'Membres',
    permissions: [
      { value: 'members.view', label: 'Voir' },
      { value: 'members.create', label: 'Créer' },
      { value: 'members.edit', label: 'Modifier' },
      { value: 'members.delete', label: 'Supprimer' },
      { value: 'members.reset_password', label: 'Réinitialiser le mot de passe' },
    ],
  },
  {
    label: 'Unités',
    permissions: [
      { value: 'units.view', label: 'Voir' },
      { value: 'units.create', label: 'Créer' },
      { value: 'units.edit', label: 'Modifier' },
      { value: 'units.delete', label: 'Supprimer' },
    ],
  },
  {
    label: 'Équipes',
    permissions: [
      { value: 'teams.view', label: 'Voir' },
      { value: 'teams.create', label: 'Créer' },
      { value: 'teams.edit', label: 'Modifier' },
      { value: 'teams.delete', label: 'Supprimer' },
    ],
  },
  {
    label: 'Affectations',
    permissions: [
      { value: 'assignments.view', label: 'Voir' },
      { value: 'assignments.create', label: 'Créer' },
      { value: 'assignments.edit', label: 'Modifier' },
      { value: 'assignments.delete', label: 'Supprimer' },
    ],
  },
  {
    label: 'Famille',
    permissions: [
      { value: 'relationships.view', label: 'Voir' },
      { value: 'relationships.create', label: 'Créer' },
      { value: 'relationships.edit', label: 'Modifier' },
      { value: 'relationships.delete', label: 'Supprimer' },
    ],
  },
  {
    label: 'Documents',
    permissions: [
      { value: 'documents.view', label: 'Voir' },
      { value: 'documents.create', label: 'Créer' },
      { value: 'documents.edit', label: 'Modifier' },
      { value: 'documents.delete', label: 'Supprimer' },
      { value: 'documents.approve', label: 'Approuver' },
    ],
  },
  {
    label: 'Types de documents',
    permissions: [
      { value: 'document_types.view', label: 'Voir' },
      { value: 'document_types.manage', label: 'Gérer' },
    ],
  },
  {
    label: 'Cotisations',
    permissions: [
      { value: 'cotisations.view', label: 'Voir' },
      { value: 'cotisations.create', label: 'Créer' },
      { value: 'cotisations.edit', label: 'Modifier' },
      { value: 'cotisations.delete', label: 'Supprimer' },
    ],
  },
  {
    label: 'Fonctions',
    permissions: [
      { value: 'roles.view', label: 'Voir' },
      { value: 'roles.manage', label: 'Gérer' },
    ],
  },
  {
    label: 'Associations',
    permissions: [
      { value: 'associations.view', label: 'Voir' },
      { value: 'associations.manage', label: 'Gérer' },
    ],
  },
  {
    label: "Types d'unité",
    permissions: [
      { value: 'unit_types.view', label: 'Voir' },
      { value: 'unit_types.manage', label: 'Gérer' },
    ],
  },
  {
    label: 'Progression',
    permissions: [
      { value: 'progression.view', label: 'Voir' },
      { value: 'progression.manage', label: 'Gérer' },
    ],
  },
  {
    label: 'Passage',
    permissions: [
      { value: 'passage.view', label: 'Voir' },
      { value: 'passage.propose', label: 'Proposer' },
      { value: 'passage.manage', label: 'Gérer (CG)' },
    ],
  },
  {
    label: "Demandes d'inscription",
    permissions: [
      { value: 'demande.view', label: 'Voir' },
      { value: 'demande.manage', label: 'Gérer' },
    ],
  },
  {
    label: 'Site public',
    permissions: [
      { value: 'content.manage', label: 'Gérer le contenu' },
    ],
  },
  {
    label: 'Administration',
    permissions: [
      { value: 'audit.view', label: 'Journal d\'audit' },
      { value: 'admin.hard_delete', label: 'Suppression définitive' },
    ],
  },
]

export default function SecurityProfilesPage() {
  const { data: profiles, isLoading } = useSecurityProfiles()
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission(PERMISSIONS.ROLES_MANAGE)
  const [selectedId, setSelectedId] = useState<string>('')
  const [createOpen, setCreateOpen] = useState(false)

  if (isLoading) return <LoadingSpinner variant="table" />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Profils de sécurité</h1>
          {!canManage && <p className="text-sm text-muted-foreground">Consultez les membres de chaque profil.</p>}
        </div>
        {canManage && <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Nouveau profil</Button>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Profile list */}
        <Card>
          <CardHeader><CardTitle className="text-base">Profils</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {profiles?.map(p => (
                <button
                  key={p.id}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${selectedId === p.id ? 'bg-muted' : ''}`}
                  onClick={() => setSelectedId(p.id)}
                >
                  <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.code}</div>
                  </div>
                  {p.isSystem && <Badge variant="outline" className="text-[10px] shrink-0">Système</Badge>}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Permission editor + members */}
        {selectedId ? (
          <PermissionEditor profileId={selectedId} canManage={canManage} onDeleted={() => setSelectedId('')} />
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center py-16 text-muted-foreground">
              Sélectionnez un profil pour voir {canManage ? 'ses permissions et ses membres.' : 'ses membres.'}
            </CardContent>
          </Card>
        )}
      </div>

      {canManage && <CreateProfileDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(id) => setSelectedId(id)} />}
    </div>
  )
}

function CreateProfileDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const createMutation = useCreateSecurityProfile()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [perms, setPerms] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  const reset = () => { setName(''); setDescription(''); setPerms(new Set()); setError('') }

  const togglePerm = (perm: string) => setPerms(prev => { const n = new Set(prev); if (n.has(perm)) n.delete(perm); else n.add(perm); return n })
  // Group checkbox: if every child is on, clear them all; otherwise turn them all on.
  const toggleGroup = (group: typeof PERMISSION_GROUPS[0]) => setPerms(prev => {
    const n = new Set(prev)
    const allChecked = group.permissions.every(p => n.has(p.value))
    for (const p of group.permissions) { if (allChecked) n.delete(p.value); else n.add(p.value) }
    return n
  })

  const handleCreate = async () => {
    setError('')
    if (!name.trim()) { setError('Le nom est requis.'); return }
    try {
      const r = await createMutation.mutateAsync({ name: name.trim(), description: description.trim() || null, permissions: [...perms] })
      toast.success('Profil créé')
      reset()
      onOpenChange(false)
      onCreated(r.id)
    } catch (err) { setError(parseApiError(err)) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nouveau profil de sécurité</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><RequiredLabel required>Nom</RequiredLabel><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Aumônier" /></div>
            <div className="space-y-2"><RequiredLabel>Description</RequiredLabel><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optionnel" /></div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Permissions ({perms.size})</p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {PERMISSION_GROUPS.map(group => {
                const groupChecked = group.permissions.filter(p => perms.has(p.value)).length
                const allChecked = groupChecked === group.permissions.length
                const someChecked = groupChecked > 0 && !allChecked
                return (
                  <div key={group.label} className="rounded-md border p-3">
                    <label className="flex items-center gap-2 mb-2 cursor-pointer">
                      <input type="checkbox" checked={allChecked} ref={(el) => { if (el) el.indeterminate = someChecked }} onChange={() => toggleGroup(group)} className="rounded" />
                      <span className="font-medium text-sm">{group.label}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{groupChecked}/{group.permissions.length}</span>
                    </label>
                    <div className="space-y-1 pl-5">
                      {group.permissions.map(p => (
                        <label key={p.value} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input type="checkbox" checked={perms.has(p.value)} onChange={() => togglePerm(p.value)} className="rounded" />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }}>Annuler</Button>
          <Button onClick={handleCreate} disabled={createMutation.isPending}>{createMutation.isPending ? 'Création...' : 'Créer'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PermissionEditor({ profileId, canManage, onDeleted }: { profileId: string; canManage: boolean; onDeleted: () => void }) {
  const { data: profile, isLoading } = useSecurityProfile(profileId)
  const updateMutation = useUpdateSecurityProfilePermissions()
  const deleteMutation = useDeleteSecurityProfile()
  const [editedPerms, setEditedPerms] = useState<Set<string> | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [tab, setTab] = useState<'perms' | 'members'>(canManage ? 'perms' : 'members')

  const handleDelete = async () => {
    setError('')
    try {
      await deleteMutation.mutateAsync(profileId)
      toast.success('Profil supprimé')
      setDeleteOpen(false)
      onDeleted()
    } catch (err) { setError(parseApiError(err)); setDeleteOpen(false) }
  }

  if (isLoading) return <LoadingSpinner />
  if (!profile) return null

  // editedPerms === null means "unmodified, mirror the server set"; once the user toggles anything it
  // becomes a staged local copy (drives the dirty/Enregistrer state) until saved or reset.
  const currentPerms = editedPerms ?? new Set(profile.permissions)
  const hasChanges = editedPerms !== null

  const togglePerm = (perm: string) => {
    const next = new Set(editedPerms ?? profile.permissions)
    if (next.has(perm)) next.delete(perm)
    else next.add(perm)
    setEditedPerms(next)
    setSaved(false)
  }

  const toggleGroup = (group: typeof PERMISSION_GROUPS[0]) => {
    const next = new Set(editedPerms ?? profile.permissions)
    const allChecked = group.permissions.every(p => next.has(p.value))
    for (const p of group.permissions) {
      if (allChecked) next.delete(p.value)
      else next.add(p.value)
    }
    setEditedPerms(next)
    setSaved(false)
  }

  const handleSave = async () => {
    if (!editedPerms) return
    setError('')
    try {
      await updateMutation.mutateAsync({ id: profileId, permissions: [...editedPerms] })
      setEditedPerms(null)
      setSaved(true)
      toast.success('Permissions enregistrées')
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleReset = () => {
    setEditedPerms(null)
    setSaved(false)
  }

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{profile.name}</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              {profile.description ?? profile.code}
              {profile.roleCount > 0 && <span> — {profile.roleCount} fonction{profile.roleCount > 1 ? 's' : ''}</span>}
            </p>
          </div>
          {canManage && tab === 'perms' && (
            <div className="flex items-center gap-2">
              {saved && <span className="text-sm text-green-600">Enregistré</span>}
              {hasChanges && (
                <>
                  <Button variant="outline" size="sm" onClick={handleReset}>Annuler</Button>
                  <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                    <Save className="mr-1 h-4 w-4" />{updateMutation.isPending ? '...' : 'Enregistrer'}
                  </Button>
                </>
              )}
              {!hasChanges && !profile.isSystem && (
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="mr-1 h-4 w-4" />Supprimer
                </Button>
              )}
            </div>
          )}
        </div>
        {/* Tabs: permissions (admins only) + members */}
        <div className="flex gap-1 border-b mt-3 -mb-px">
          {canManage && (
            <button onClick={() => setTab('perms')}
              className={`px-3 py-2 text-sm font-medium border-b-2 ${tab === 'perms' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              Permissions
            </button>
          )}
          <button onClick={() => setTab('members')}
            className={`px-3 py-2 text-sm font-medium border-b-2 ${tab === 'members' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            Membres
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive mb-4">{error}</div>}

        {tab === 'members' && <ProfileMembersList profileId={profileId} />}

        {tab === 'perms' && canManage &&
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {PERMISSION_GROUPS.map(group => {
            const groupChecked = group.permissions.filter(p => currentPerms.has(p.value)).length
            const allChecked = groupChecked === group.permissions.length
            const someChecked = groupChecked > 0 && !allChecked // → group checkbox shows indeterminate

            return (
              <div key={group.label} className="rounded-md border p-3">
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked }}
                    onChange={() => toggleGroup(group)}
                    className="rounded"
                  />
                  <span className="font-medium text-sm">{group.label}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{groupChecked}/{group.permissions.length}</span>
                </label>
                <div className="space-y-1 pl-5">
                  {group.permissions.map(p => (
                    <label key={p.value} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={currentPerms.has(p.value)}
                        onChange={() => togglePerm(p.value)}
                        className="rounded"
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>}
      </CardContent>
    </Card>
    <ConfirmDialog
      open={deleteOpen}
      onOpenChange={setDeleteOpen}
      title="Supprimer le profil"
      description={`Supprimer le profil « ${profile.name} » ? Cette action est définitive.${profile.roleCount > 0 ? ' Ce profil est utilisé par des fonctions — réaffectez-les d\'abord.' : ''}`}
      confirmLabel="Supprimer"
      variant="destructive"
      loading={deleteMutation.isPending}
      onConfirm={handleDelete}
    />
    </>
  )
}

// Members who currently hold this profile (via their active function). Read-only — used by both
// the super-admin editor (Membres tab) and the Chef de Groupe view.
function ProfileMembersList({ profileId }: { profileId: string }) {
  const { data: members, isLoading } = useSecurityProfileMembers(profileId)
  if (isLoading) return <LoadingSpinner />
  if (!members?.length) return <p className="py-8 text-center text-sm text-muted-foreground">Aucun membre n'a ce profil actuellement.</p>
  return (
    <div className="divide-y">
      {members.map((m, i) => (
        <div key={`${m.memberId}-${i}`} className="flex items-center gap-3 py-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{m.lastName} {m.firstName}</div>
            <div className="text-xs text-muted-foreground">{m.functionName ?? '—'}</div>
          </div>
          {m.unitCode && <Badge variant="outline" className="shrink-0 text-[10px]">{m.unitCode}</Badge>}
          {m.isAccountFlag && <Badge className="shrink-0 text-[10px]">Compte</Badge>}
        </div>
      ))}
    </div>
  )
}
