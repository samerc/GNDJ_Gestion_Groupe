// Admin "Profils de sécurité" screen (a tab of the "Accès & permissions" hub). Master/detail: a profile list
// on the left, and on the right either the PERMISSION EDITOR (the shared PermissionGroups checklist grouped by
// domain) or the MEMBERS tab (who holds this profile via their active function). Permission editing +
// create/delete are gated by roles.manage (super-admin); a Chef de Groupe with only roles.view sees the Membres
// tab read-only. System profiles (isSystem) can't be deleted. Editor edits are staged locally until "Enregistrer".
import { parseApiError } from '@/lib/error-utils'
import { useState } from 'react'
import { useSecurityProfiles, useSecurityProfile, useUpdateSecurityProfilePermissions, useSetProfileAreaAccess, useCreateSecurityProfile, useDeleteSecurityProfile } from '@/services/security-profile-service'
import { useSecurityProfileMembers, useMergeSecurityProfiles } from '@/services/role-service'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { RequiredLabel } from '@/components/shared/required-label'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { PermissionGroups, AreaLevels } from '@/components/admin/permission-editor'
import { Shield, ChevronRight, Save, Plus, Trash2, GitMerge } from 'lucide-react'
import { toast } from 'sonner'

// `embedded` = rendered inside the "Accès & permissions" hub (its title/tabs own the header), so we suppress
// this page's standalone header/title but keep the "Nouveau profil" action.
export default function SecurityProfilesPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { data: profiles, isLoading } = useSecurityProfiles()
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission(PERMISSIONS.ROLES_MANAGE)         // super-admin: edit ANY profile (raw + domaine)
  const canGroupEdit = hasPermission(PERMISSIONS.ROLES_MANAGE_GROUP) // CG: edit group-level profiles by domaine (capped)
  const [selectedId, setSelectedId] = useState<string>('')
  const [createOpen, setCreateOpen] = useState(false)

  if (isLoading) return <LoadingSpinner variant="table" />

  return (
    <div className="space-y-6">
      {embedded ? (
        canManage && <div className="flex justify-end"><Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Nouveau profil</Button></div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Profils de sécurité</h1>
            {!canManage && <p className="text-sm text-muted-foreground">Consultez les membres de chaque profil.</p>}
          </div>
          {canManage && <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Nouveau profil</Button>}
        </div>
      )}

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
          // key={selectedId} remounts the editor on profile switch so staged (unsaved) permission toggles,
          // the dirty/saved flags, error banner and active tab don't bleed from the previous profile onto the next.
          <PermissionEditor key={selectedId} profileId={selectedId} canManage={canManage} canGroupEdit={canGroupEdit} onDeleted={() => setSelectedId('')} />
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
            <PermissionGroups value={perms} onChange={setPerms} />
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

function PermissionEditor({ profileId, canManage, canGroupEdit, onDeleted }: { profileId: string; canManage: boolean; canGroupEdit: boolean; onDeleted: () => void }) {
  const { data: profile, isLoading } = useSecurityProfile(profileId)
  const updateMutation = useUpdateSecurityProfilePermissions()   // avancé (raw) save — super-admin
  const areaMutation = useSetProfileAreaAccess()                 // simple (domaine) save — CG / super-admin
  const deleteMutation = useDeleteSecurityProfile()
  const [editedPerms, setEditedPerms] = useState<Set<string> | null>(null)  // avancé working copy (null = unmodified)
  const [levels, setLevels] = useState<Record<string, string> | null>(null) // simple working copy (null = unmodified)
  // Editor mode: super-admin defaults to avancé (full control incl. structural perms); a CG only ever gets simple.
  const [mode, setMode] = useState<'simple' | 'avance'>(canManage ? 'avance' : 'simple')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false)
  const [tab, setTab] = useState<'perms' | 'members'>('perms')

  const handleDelete = async () => {
    setError('')
    try {
      await deleteMutation.mutateAsync(profileId)
      toast.success('Profil supprimé')
      setDeleteOpen(false)
      onDeleted()
    } catch (err) {
      // A blocked delete (profile still used by a function → 400) must surface a visible toast, not a banner
      // in the just-closed dialog.
      toast.error(parseApiError(err)); setDeleteOpen(false)
    }
  }

  if (isLoading) return <LoadingSpinner />
  if (!profile) return null

  // Who can edit THIS profile, and how. super-admin (roles.manage) → any profile, raw or domaine. A Chef de
  // Groupe (roles.manage_group) → only a GROUP-LEVEL profile that isn't chef-de-groupe, via the domaine editor.
  const canRaw = canManage
  const canAreaEdit = canManage || (canGroupEdit && profile.isGroupLevel && profile.code !== 'chef-de-groupe')
  const canEditAny = canRaw || canAreaEdit
  const effectiveMode: 'simple' | 'avance' = mode === 'avance' && !canRaw ? 'simple' : mode
  const showPermsTab = canEditAny
  const activeTab = showPermsTab ? tab : 'members'

  // Working copies + dirty state per mode.
  const currentPerms = editedPerms ?? new Set(profile.permissions)
  const currentLevels = levels ?? Object.fromEntries(profile.areas.map(a => [a.key, a.level]))
  const dirty = effectiveMode === 'avance'
    ? editedPerms !== null
    : levels !== null && profile.areas.some(a => (currentLevels[a.key] ?? 'aucun') !== a.level)

  const switchMode = (m: 'simple' | 'avance') => { setMode(m); setEditedPerms(null); setLevels(null); setSaved(false) }

  const doSave = async () => {
    setError('')
    try {
      if (effectiveMode === 'avance') {
        await updateMutation.mutateAsync({ id: profileId, permissions: [...currentPerms] })
      } else {
        await areaMutation.mutateAsync({ id: profileId, areaLevels: currentLevels })
      }
      setEditedPerms(null); setLevels(null); setSaved(true)
      toast.success('Permissions enregistrées')
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  // A change to a shared profile hits every holder (+ anyone with it as an accès délégué) — warn before saving.
  const affects = profile.roleCount + profile.delegationCount
  const requestSave = () => { if (affects > 0) setConfirmSaveOpen(true); else doSave() }
  const handleReset = () => { setEditedPerms(null); setLevels(null); setSaved(false) }
  const saving = updateMutation.isPending || areaMutation.isPending

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-base">{profile.name}</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              {profile.description ?? profile.code}
              {profile.roleCount > 0 && <span> — {profile.roleCount} fonction{profile.roleCount > 1 ? 's' : ''}</span>}
              {profile.delegationCount > 0 && <span> · {profile.delegationCount} accès délégué{profile.delegationCount > 1 ? 's' : ''}</span>}
            </p>
            {/* Which fonctions use this profile (not just a count) — helps decide a merge / spot duplicates. */}
            {profile.roleNames.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {profile.roleNames.map((r, i) => <Badge key={i} variant="outline" className="text-[10px] font-normal">{r}</Badge>)}
              </div>
            )}
          </div>
          {canEditAny && activeTab === 'perms' && (
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
              {saved && <span className="text-sm text-green-600 dark:text-green-400">Enregistré</span>}
              {dirty && (
                <>
                  <Button variant="outline" size="sm" onClick={handleReset}>Annuler</Button>
                  <Button size="sm" onClick={requestSave} disabled={saving}>
                    <Save className="mr-1 h-4 w-4" />{saving ? '...' : 'Enregistrer'}
                  </Button>
                </>
              )}
              {/* Merge / delete stay super-admin-only. */}
              {canManage && !dirty && (
                <Button variant="outline" size="sm" onClick={() => setMergeOpen(true)}>
                  <GitMerge className="mr-1 h-4 w-4" />Fusionner
                </Button>
              )}
              {canManage && !dirty && !profile.isSystem && (
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="mr-1 h-4 w-4" />Supprimer
                </Button>
              )}
            </div>
          )}
        </div>
        {/* Tabs: permissions (editable users) + members */}
        <div className="flex gap-1 border-b mt-3 -mb-px">
          {showPermsTab && (
            <button onClick={() => setTab('perms')}
              className={`px-3 py-2 text-sm font-medium border-b-2 ${activeTab === 'perms' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              Permissions
            </button>
          )}
          <button onClick={() => setTab('members')}
            className={`px-3 py-2 text-sm font-medium border-b-2 ${activeTab === 'members' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            Membres
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive mb-4">{error}</div>}

        {activeTab === 'members' && <ProfileMembersList profileId={profileId} />}

        {activeTab === 'perms' && canEditAny && (
          <>
            {/* Simple (domaine) ⇄ Avancé (raw) toggle — avancé only for a super-admin. */}
            {canRaw && (
              <div className="mb-3 inline-flex rounded-md border p-0.5 text-xs">
                <button onClick={() => switchMode('simple')}
                  className={`rounded px-2.5 py-1 font-medium ${effectiveMode === 'simple' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Par domaine</button>
                <button onClick={() => switchMode('avance')}
                  className={`rounded px-2.5 py-1 font-medium ${effectiveMode === 'avance' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Avancé</button>
              </div>
            )}
            {effectiveMode === 'avance'
              ? <PermissionGroups value={currentPerms} onChange={(next) => { setEditedPerms(next); setSaved(false) }} />
              : (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Accès par domaine (Aucun · Lecture · Complet). Ces permissions concernent les données des
                    autres membres / de toute l'unité — chacun voit toujours sa propre fiche.
                  </p>
                  <AreaLevels areas={profile.areas} levels={currentLevels}
                    onChange={(key, v) => { setLevels(prev => ({ ...(prev ?? Object.fromEntries(profile.areas.map(a => [a.key, a.level]))), [key]: v })); setSaved(false) }} />
                </>
              )}
          </>
        )}
      </CardContent>
    </Card>
    <ConfirmDialog
      open={confirmSaveOpen}
      onOpenChange={setConfirmSaveOpen}
      title="Appliquer à tous les détenteurs ?"
      description={`Ce profil est utilisé par ${profile.roleCount} fonction${profile.roleCount > 1 ? 's' : ''}${profile.delegationCount > 0 ? ` et ${profile.delegationCount} accès délégué${profile.delegationCount > 1 ? 's' : ''}` : ''}. La modification s'applique à tous. Continuer ?`}
      confirmLabel="Enregistrer"
      loading={saving}
      onConfirm={async () => { await doSave(); setConfirmSaveOpen(false) }}
    />
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
    <MergeProfileDialog open={mergeOpen} onOpenChange={setMergeOpen}
      sourceId={profileId} sourceName={profile.name} roleCount={profile.roleCount}
      onMerged={() => { setMergeOpen(false); onDeleted() }} />
    </>
  )
}

// Merge THIS profile (source) into another (target): repoints its fonctions onto the target, then deletes it.
// For cleaning up duplicate profiles. The members of the source's fonctions inherit the target's permissions.
function MergeProfileDialog({ open, onOpenChange, sourceId, sourceName, roleCount, onMerged }: {
  open: boolean; onOpenChange: (o: boolean) => void; sourceId: string; sourceName: string; roleCount: number; onMerged: () => void
}) {
  const { data: profiles } = useSecurityProfiles()
  const mergeMutation = useMergeSecurityProfiles()
  const [targetId, setTargetId] = useState('')

  const targets = (profiles ?? []).filter(p => p.id !== sourceId)

  const handleMerge = async () => {
    if (!targetId) return
    try {
      const r = await mergeMutation.mutateAsync({ sourceId, targetId })
      const target = targets.find(t => t.id === targetId)
      toast.success(`« ${sourceName} » fusionné dans « ${target?.name ?? '?'} »${r.rolesRepointed > 0 ? ` (${r.rolesRepointed} fonction${r.rolesRepointed > 1 ? 's' : ''} déplacée${r.rolesRepointed > 1 ? 's' : ''})` : ''}.`)
      onMerged()
    } catch (err) { toast.error(parseApiError(err)) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setTargetId(''); onOpenChange(o) }}>
      <DialogContent className="max-w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fusionner le profil</DialogTitle>
          <DialogDescription>
            Le profil « {sourceName} » sera <span className="font-medium text-foreground">supprimé</span>, et
            {roleCount > 0
              ? ` ses ${roleCount} fonction${roleCount > 1 ? 's' : ''} (et donc leurs membres) `
              : ' ses fonctions (aucune actuellement) '}
            basculeront vers le profil choisi. À utiliser pour nettoyer des profils en double.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <RequiredLabel required>Fusionner dans</RequiredLabel>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger><SelectValue placeholder="Choisir le profil cible…" /></SelectTrigger>
            <SelectContent>
              {targets.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mergeMutation.isPending}>Annuler</Button>
          <Button variant="destructive" onClick={handleMerge} disabled={!targetId || mergeMutation.isPending}>
            {mergeMutation.isPending ? 'Fusion…' : 'Fusionner'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
