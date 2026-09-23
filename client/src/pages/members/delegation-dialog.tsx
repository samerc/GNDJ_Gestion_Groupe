// Access-delegation dialog ("Délégation d'accès") — CG / super-admin only (roles.manage_group).
// Grants a specific member extra access with NO visible role (invisible on the public site / maîtrises):
//   • Attach a PROFILE ("Agir comme…") — e.g. give a future Chef de Groupe the "Chef de Groupe" profile so they
//     can run everything before the role is formally set / if the outgoing CG is away. Resolved LIVE, so it stays
//     in sync if the profile changes; a group-level profile also grants all units.
//   • Granular per-area (Aucun / Lecture / Complet) — e.g. give one ACG "Camp BP" only.
// Both are combinable. Takes effect on the member's NEXT login or token refresh (≤15 min).
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { AreaLevels } from '@/components/admin/permission-editor'
import { useMemberDelegation, useSetMemberDelegation, type MemberDelegation } from '@/services/member-service'
import { useSecurityProfiles } from '@/services/security-profile-service'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'

const NO_PROFILE = '__none__' // Select sentinel for "no profile attached"

export function DelegationDialog({ memberId, memberName, open, onOpenChange }: {
  memberId: string; memberName: string; open: boolean; onOpenChange: (v: boolean) => void
}) {
  const { data, isLoading } = useMemberDelegation(memberId, open)
  const { data: profiles } = useSecurityProfiles()
  const setMutation = useSetMemberDelegation(memberId)

  const [profileId, setProfileId] = useState<string | null>(null)
  const [levels, setLevels] = useState<Record<string, string>>({})

  // Seed the working copy from the server whenever the dialog (re)opens or fresh data arrives — the
  // "adjust state during render" pattern (React's recommended alternative to a setState-in-effect).
  const [seed, setSeed] = useState<{ open: boolean; data: MemberDelegation | undefined }>({ open: false, data: undefined })
  if (seed.open !== open || seed.data !== data) {
    setSeed({ open, data })
    if (open && data) {
      setProfileId(data.profileId)
      setLevels(Object.fromEntries(data.areas.map(a => [a.key, a.level])))
    }
  }

  // "Agir comme" targets = group-level profiles (the meaningful stand-in profiles, e.g. Chef de Groupe).
  const profileOptions = (profiles ?? []).filter(p => p.isGroupLevel)

  const dirty = data && ((profileId ?? null) !== (data.profileId ?? null) || data.areas.some(a => levels[a.key] !== a.level))

  const save = async () => {
    try {
      await setMutation.mutateAsync({ profileId: profileId || null, areaLevels: levels })
      toast.success('Délégation enregistrée — effective à la prochaine connexion de la personne.')
      onOpenChange(false)
    } catch (e) { toast.error(parseApiError(e)) }
  }

  const clearAll = () => { setProfileId(null); setLevels(prev => Object.fromEntries(Object.keys(prev).map(k => [k, 'aucun']))) }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Délégation d'accès</DialogTitle>
          <DialogDescription>
            Accorde à <span className="font-medium text-foreground">{memberName}</span> un accès supplémentaire
            sans rôle visible (invisible sur le site public et les maîtrises). Prend effet à sa prochaine connexion.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? <LoadingSpinner variant="form" /> : (
          <div className="space-y-4">
            {/* Attach a profile ("acts as…") */}
            <div className="space-y-1.5 rounded-lg border p-3">
              <p className="text-sm font-medium">Agir comme (profil)</p>
              <p className="text-xs text-muted-foreground">
                Donne à cette personne tout ce que fait ce profil (par ex. « Chef de Groupe » pour un CG entrant).
                Reste synchronisé si le profil change.
              </p>
              <Select value={profileId ?? NO_PROFILE} onValueChange={(v) => setProfileId(v === NO_PROFILE ? null : v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROFILE}>Aucun profil</SelectItem>
                  {profileOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Granular per-area — additive to the profile above */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Ou / et accès par domaine</p>
              <AreaLevels areas={data?.areas ?? []} levels={levels} columns="sm:grid-cols-2"
                onChange={(key, v) => setLevels(prev => ({ ...prev, [key]: v }))} />
            </div>
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={clearAll} disabled={setMutation.isPending}>Tout retirer</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={setMutation.isPending}>Annuler</Button>
            <Button onClick={save} disabled={setMutation.isPending || !dirty}>
              {setMutation.isPending ? '...' : 'Enregistrer'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
