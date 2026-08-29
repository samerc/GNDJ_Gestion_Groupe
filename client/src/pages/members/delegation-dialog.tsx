// Access-delegation dialog ("Délégation d'accès") — CG / super-admin only (roles.manage_group).
// Grants a specific member extra access with NO visible role (invisible on the public site / maîtrises):
//   • "Accès complet Chef de Groupe (entrant)" — the full CG toolset incl. the appointment power + group-wide
//     access, so an incoming CG can run everything before the role is formally set / if the outgoing CG is away.
//   • Granular per-area (Aucun / Lecture / Complet) — e.g. give one ACG "Camp BP" only.
// Takes effect on the member's NEXT login or token refresh (≤15 min). Mirrors the Accès maîtrise area picker.
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { useMemberDelegation, useSetMemberDelegation, type MemberDelegation } from '@/services/member-service'
import { parseApiError } from '@/lib/error-utils'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

const LEVELS = [
  { value: 'aucun', label: 'Aucun' },
  { value: 'lecture', label: 'Lecture' },
  { value: 'complet', label: 'Complet' },
]

export function DelegationDialog({ memberId, memberName, open, onOpenChange }: {
  memberId: string; memberName: string; open: boolean; onOpenChange: (v: boolean) => void
}) {
  const { data, isLoading } = useMemberDelegation(memberId, open)
  const setMutation = useSetMemberDelegation(memberId)

  const [fullCg, setFullCg] = useState(false)
  const [levels, setLevels] = useState<Record<string, string>>({})

  // Seed the working copy from the server whenever the dialog (re)opens or fresh data arrives — the
  // "adjust state during render" pattern (React's recommended alternative to a setState-in-effect), keyed on
  // (open, data) so edits are preserved between renders but a fresh open re-reads the server state.
  const [seed, setSeed] = useState<{ open: boolean; data: MemberDelegation | undefined }>({ open: false, data: undefined })
  if (seed.open !== open || seed.data !== data) {
    setSeed({ open, data })
    if (open && data) {
      setFullCg(data.fullCg)
      setLevels(Object.fromEntries(data.areas.map(a => [a.key, a.level])))
    }
  }

  const dirty = data && (fullCg !== data.fullCg || data.areas.some(a => levels[a.key] !== a.level))

  const save = async () => {
    try {
      await setMutation.mutateAsync(fullCg ? { fullCg: true } : { fullCg: false, areaLevels: levels })
      toast.success('Délégation enregistrée — effective à la prochaine connexion de la personne.')
      onOpenChange(false)
    } catch (e) { toast.error(parseApiError(e)) }
  }

  const clearAll = () => { setFullCg(false); setLevels(prev => Object.fromEntries(Object.keys(prev).map(k => [k, 'aucun']))) }

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
            {/* Full CG hand-off preset */}
            <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">Accès complet Chef de Groupe (entrant)</p>
                  <p className="text-xs text-muted-foreground">
                    Tout ce que fait un Chef de Groupe (demandes, camp, membres, passages, nominations…) sur tout le
                    groupe. Pour un CG entrant, avant que le rôle ne soit officialisé.
                  </p>
                </div>
              </div>
              <Switch checked={fullCg} onCheckedChange={setFullCg} />
            </div>

            {/* Granular per-area (hidden while the full-CG preset is on) */}
            {!fullCg && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Ou accès par domaine</p>
                <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  {(data?.areas ?? []).map(a => (
                    <div key={a.key} className="flex items-center justify-between gap-2">
                      <span className="text-sm">{a.label}</span>
                      <Select value={levels[a.key] ?? 'aucun'} onValueChange={(v) => setLevels(prev => ({ ...prev, [a.key]: v }))}>
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
