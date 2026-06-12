import { parseApiError } from '@/lib/error-utils'
import { useState } from 'react'
import { useSecurityProfiles, useSecurityProfile, useUpdateSecurityProfilePermissions } from '@/services/security-profile-service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Shield, ChevronRight, Save } from 'lucide-react'
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
    label: 'Administration',
    permissions: [
      { value: 'audit.view', label: 'Journal d\'audit' },
      { value: 'admin.hard_delete', label: 'Suppression définitive' },
    ],
  },
]

export default function SecurityProfilesPage() {
  const { data: profiles, isLoading } = useSecurityProfiles()
  const [selectedId, setSelectedId] = useState<string>('')

  if (isLoading) return <LoadingSpinner variant="table" />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Profils de sécurité</h1>

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

        {/* Permission editor */}
        {selectedId ? (
          <PermissionEditor profileId={selectedId} />
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center py-16 text-muted-foreground">
              Sélectionnez un profil pour voir et modifier ses permissions.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function PermissionEditor({ profileId }: { profileId: string }) {
  const { data: profile, isLoading } = useSecurityProfile(profileId)
  const updateMutation = useUpdateSecurityProfilePermissions()
  const [editedPerms, setEditedPerms] = useState<Set<string> | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  if (isLoading) return <LoadingSpinner />
  if (!profile) return null

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
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive mb-4">{error}</div>}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {PERMISSION_GROUPS.map(group => {
            const groupChecked = group.permissions.filter(p => currentPerms.has(p.value)).length
            const allChecked = groupChecked === group.permissions.length
            const someChecked = groupChecked > 0 && !allChecked

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
        </div>
      </CardContent>
    </Card>
  )
}
