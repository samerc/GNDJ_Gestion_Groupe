import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useUnits } from '@/services/unit-service'
import { useTeams, teamsForSelect } from '@/services/team-service'
import { useFunctionalRoles } from '@/services/role-service'
import { useBulkChangePassages, type PassageDto } from '@/services/passage-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Callout } from '@/components/shared/callout'

// Branch order of the parcours scout, so the unit picker reads like the group (Meute → … → Groupe).
const BRANCH_ORDER = ['MEU', 'RON', 'TRO', 'COM', 'CLAN', 'NOY', 'JEM', 'FEU', 'CAR', 'GRP']
const branchRank = (code: string) => { const i = BRANCH_ORDER.indexOf(code); return i < 0 ? 99 : i }
const unitNumber = (name: string) => Number(name.match(/\d+/)?.[0] ?? 0)

// "Changer la sélection": gives every selected passage line the SAME decision — a destination unit (+ optional
// équipe) and fonction, or "Quitte le groupe" — with an optional reason the CU sees. One request; each unit's
// leaders get a single notification listing the members changed.
export function BulkChangeDialog({ open, onOpenChange, passages, onDone }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  passages: PassageDto[]
  onDone: () => void
}) {
  const [unitId, setUnitId] = useState('')
  const [leaving, setLeaving] = useState(false)
  const [teamId, setTeamId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  // Reset the form each time the dialog opens (render-phase reset, no effect).
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) { setUnitId(''); setLeaving(false); setTeamId(''); setRoleId(''); setNotes(''); setError('') }
  }

  const { data: unitsData } = useUnits({ isActive: true, pageSize: 100 })
  const { data: rolesData } = useFunctionalRoles()
  const { data: teamsData } = useTeams({ unitId: unitId || undefined, pageSize: 100, enabled: open && !!unitId })
  const change = useBulkChangePassages()

  const units = unitsData?.items
  const roles = useMemo(() => rolesData ?? [], [rolesData])
  const teams = teamsForSelect(teamsData?.items).filter(t => !t.isMaitrise) // no Maîtrise team in the passage

  // Active units grouped by branch, in parcours order.
  const groups = useMemo(() => {
    const byType = new Map<string, { code: string; name: string; units: NonNullable<typeof units> }>()
    for (const u of units ?? []) {
      const g = byType.get(u.unitTypeId) ?? { code: u.unitTypeCode, name: u.unitTypeName, units: [] }
      g.units.push(u)
      byType.set(u.unitTypeId, g)
    }
    return [...byType.values()]
      .sort((a, b) => branchRank(a.code) - branchRank(b.code) || a.name.localeCompare(b.name))
      .map(g => ({ ...g, units: [...g.units].sort((a, b) => unitNumber(a.name) - unitNumber(b.name) || a.name.localeCompare(b.name)) }))
  }, [units])

  const destTypeId = units?.find(u => u.id === unitId)?.unitTypeId
  // Member fonctions of the destination branch (not maîtrise, not archived), default one first.
  const fnRoles = useMemo(
    () => roles.filter(r => !r.isArchived && !r.isMaitrise && r.unitTypeId === destTypeId)
      .sort((a, b) => Number(b.isDefaultForNewMembers) - Number(a.isDefaultForNewMembers) || a.rank - b.rank),
    [roles, destTypeId],
  )

  const pickUnit = (v: string) => {
    if (v === '__leave__') { setLeaving(true); setUnitId(''); setTeamId(''); setRoleId(''); return }
    setLeaving(false)
    setUnitId(v)
    setTeamId('')
    // Default to the branch's base fonction (what a new arrival gets); the CG can change it.
    const type = units?.find(u => u.id === v)?.unitTypeId
    const list = roles.filter(r => !r.isArchived && !r.isMaitrise && r.unitTypeId === type)
    const base = list.find(r => r.isDefaultForNewMembers) ?? [...list].sort((a, b) => a.rank - b.rank)[0]
    setRoleId(base?.id ?? '')
  }

  const submit = async () => {
    if (!leaving && (!unitId || !roleId)) { setError("Choisissez l'unité et la fonction."); return }
    try {
      const r = await change.mutateAsync({
        passageIds: passages.map(p => p.id),
        leaving,
        finalUnitId: leaving ? null : unitId,
        finalTeamId: leaving || !teamId ? null : teamId,
        finalRoleId: leaving ? null : roleId,
        cgNotes: notes.trim() || null,
      })
      toast.success(`${r.count} ligne(s) modifiée(s)`)
      onDone()
      onOpenChange(false)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  // Short list of who is concerned (first names shown, the rest counted).
  const shown = passages.slice(0, 6).map(p => p.memberName).join(', ')
  const more = passages.length > 6 ? ` et ${passages.length - 6} autre(s)` : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Changer {passages.length} ligne(s)</DialogTitle>
          <DialogDescription>{shown}{more}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error && <Callout tone="danger">{error}</Callout>}

          <div className="space-y-2">
            <label className="text-sm font-medium">Destination</label>
            <Select value={leaving ? '__leave__' : unitId} onValueChange={pickUnit}>
              <SelectTrigger><SelectValue placeholder="Choisir une unité" /></SelectTrigger>
              <SelectContent>
                {groups.map(g => (
                  <SelectGroup key={g.code + g.name}>
                    <SelectLabel>{g.name}</SelectLabel>
                    {g.units.map(u => <SelectItem key={u.id} value={u.id}>{u.code} — {u.name}</SelectItem>)}
                  </SelectGroup>
                ))}
                <SelectGroup>
                  <SelectLabel>Départ</SelectLabel>
                  <SelectItem value="__leave__">Quitte le groupe</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {!leaving && unitId && (<>
            <div className="space-y-2">
              <label className="text-sm font-medium">Équipe (facultatif)</label>
              <Select value={teamId || '_none'} onValueChange={(v) => setTeamId(v === '_none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Aucune équipe" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Aucune équipe (le chef d'unité l'attribuera)</SelectItem>
                  {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Fonction</label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger><SelectValue placeholder="Choisir une fonction" /></SelectTrigger>
                <SelectContent>
                  {fnRoles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>)}

          <div className="space-y-2">
            <label className="text-sm font-medium">Raison (facultatif)</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} placeholder="Visible par le chef d'unité…" />
          </div>
          <p className="text-xs text-muted-foreground">
            Toutes les lignes sélectionnées recevront la même décision. Chaque chef d'unité concerné reçoit une notification.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} disabled={change.isPending}>{change.isPending ? 'Enregistrement…' : 'Appliquer'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
