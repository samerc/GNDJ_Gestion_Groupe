// "Commission" tab of a Camp BP. Everyone on the commission sees who is on it and what each member may do.
//  • CG: chooses the responsables du camp (= chefs de commission: ACGs with full rights on this camp).
//  • CG or a responsable: add / remove members (maîtrise only) and set each member's rights per area —
//    Familles / Jeux / Paramètres: Aucun / Voir / Modifier. Responsables always have full access.
//  • Other members: read-only.
// Changes apply at each member's next sign-in / session refresh (≤ 15 min).
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { UserPlus, X, Users, Search, ShieldCheck, Pencil } from 'lucide-react'
import { parseApiError } from '@/lib/error-utils'
import {
  useCampCommission, useSetCampCommission, useSetCampCommissionAccess, useCampCommissionCandidates, useSetCampResponsables,
  type CampAccessLevel, type CampCommissionMemberDto, type CampMyAccessDto,
} from '@/services/camp-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { ResponsablesPicker } from './responsables-picker'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'

const LEVELS: { value: CampAccessLevel; label: string }[] = [
  { value: 'none', label: 'Aucun' },
  { value: 'view', label: 'Voir' },
  { value: 'edit', label: 'Modifier' },
]
const AREAS = [
  { key: 'famillesAccess', label: 'Familles' },
  { key: 'jeuxAccess', label: 'Jeux' },
  { key: 'parametresAccess', label: 'Paramètres' },
] as const

export function CampCommissionTab({ campId, access }: { campId: string; access: CampMyAccessDto }) {
  const { data: members, isLoading } = useCampCommission(campId)
  const save = useSetCampCommission(campId)
  const setAccess = useSetCampCommissionAccess(campId)
  const setResp = useSetCampResponsables(campId)
  const [picking, setPicking] = useState(false)
  const [editingResp, setEditingResp] = useState<string[] | null>(null) // CG: responsables being edited

  const list = members ?? []
  const ids = list.map((m) => m.memberId)
  const update = async (memberIds: string[], ok: string) => {
    try { await save.mutateAsync(memberIds); toast.success(ok) } catch (err) { toast.error(parseApiError(err)) }
  }
  const changeLevel = async (m: CampCommissionMemberDto, key: typeof AREAS[number]['key'], level: CampAccessLevel) => {
    try {
      await setAccess.mutateAsync({
        memberId: m.memberId, famillesAccess: m.famillesAccess, jeuxAccess: m.jeuxAccess, parametresAccess: m.parametresAccess,
        [key]: level,
      })
    } catch (err) { toast.error(parseApiError(err)) }
  }

  if (isLoading) return <LoadingSpinner />
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          La Commission BP organise ce camp. Les <b>responsables du camp</b> (chefs de commission, choisis par le chef de
          groupe) ont accès à tout et choisissent ce que chaque autre membre peut voir ou modifier. Seuls les membres de
          la maîtrise peuvent en faire partie. Les changements s'appliquent à la
          prochaine connexion (au plus tard ~15 min) ; l'accès s'arrête quand le camp est archivé.
        </p>
        <div className="flex flex-wrap gap-2">
          {access.isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setEditingResp(list.filter((m) => m.isResponsable).map((m) => m.memberId))}>
              <Pencil className="mr-1.5 h-4 w-4" />Responsables du camp
            </Button>
          )}
          {access.canManageCommission && (
            <Button size="sm" onClick={() => setPicking(true)} disabled={save.isPending}>
              <UserPlus className="mr-1.5 h-4 w-4" />Ajouter un membre
            </Button>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={Users} title="Aucun membre dans la commission"
          description={access.canManageCommission ? 'Ajoutez les chefs qui organisent ce camp, puis choisissez ce que chacun peut voir.' : "La commission n'a pas encore été nommée."} />
      ) : (
        <div className="divide-y rounded-lg border">
          {list.map((m) => (
            <div key={m.memberId} className="flex flex-col gap-2 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {m.lastName} {m.firstName}
                  {m.isResponsable && <Badge variant="outline" className="gap-1 border-sky-300 text-sky-700 dark:border-sky-800 dark:text-sky-300"><ShieldCheck className="h-3 w-3" />Responsable du camp (chef de commission)</Badge>}
                </p>
                {m.roles && <p className="truncate text-xs text-muted-foreground">{m.roles}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {m.isResponsable ? (
                  <span className="text-xs text-muted-foreground">Accès complet</span>
                ) : AREAS.map((a) => (
                  <div key={a.key} className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{a.label}</span>
                    {access.canSetRights ? (
                      <Select value={m[a.key]} onValueChange={(v) => changeLevel(m, a.key, v as CampAccessLevel)} disabled={setAccess.isPending}>
                        <SelectTrigger className="h-8 w-[108px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={m[a.key] === 'none' ? 'secondary' : 'outline'}>{LEVELS.find((l) => l.value === m[a.key])?.label}</Badge>
                    )}
                  </div>
                ))}
                {access.canManageCommission && (
                  <>
                    {!m.isResponsable && <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-destructive" disabled={save.isPending}
                      onClick={() => update(ids.filter((x) => x !== m.memberId), 'Retiré de la commission')}>
                      <X className="mr-1 h-4 w-4" />Retirer
                    </Button>}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editingResp && (
        <Dialog open onOpenChange={() => setEditingResp(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Responsables du camp</DialogTitle>
              <DialogDescription>Les assistants chef de groupe qui dirigent ce camp, avec tous les droits dessus.</DialogDescription>
            </DialogHeader>
            <ResponsablesPicker value={editingResp} onChange={setEditingResp} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingResp(null)}>Annuler</Button>
              <Button disabled={setResp.isPending} onClick={async () => {
                try { await setResp.mutateAsync(editingResp); toast.success('Responsables enregistrés'); setEditingResp(null) }
                catch (err) { toast.error(parseApiError(err)) }
              }}>Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {access.canManageCommission && (
        <MaitrisePicker open={picking} onOpenChange={setPicking} exclude={ids}
          onPick={async (id, name) => {
            setPicking(false)
            await update([...ids, id], `${name} ajouté(e) à la commission`)
          }} />
      )}
    </div>
  )
}

// Picker limited to the maîtrise (members with an active leadership role) — regular members can't join a commission.
function MaitrisePicker({ open, onOpenChange, exclude, onPick }: {
  open: boolean; onOpenChange: (o: boolean) => void; exclude: string[]; onPick: (id: string, name: string) => void
}) {
  const { data: candidates, isLoading } = useCampCommissionCandidates(open)
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = search.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    return (candidates ?? [])
      .filter((c) => !exclude.includes(c.memberId))
      .filter((c) => !q || `${c.firstName} ${c.lastName} ${c.roles ?? ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q))
  }, [candidates, exclude, search])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter à la Commission BP</DialogTitle>
          <DialogDescription>Seuls les membres de la maîtrise peuvent faire partie de la commission.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Rechercher un chef…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        </div>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {isLoading ? <LoadingSpinner /> : filtered.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Aucun membre de la maîtrise trouvé.</p>
          ) : filtered.map((c) => (
            <button key={c.memberId} type="button" onClick={() => onPick(c.memberId, `${c.firstName} ${c.lastName}`)}
              className="w-full rounded border px-2 py-1.5 text-left text-sm hover:bg-muted/50">
              <span className="font-medium">{c.lastName} {c.firstName}</span>
              {c.roles && <span className="block truncate text-xs text-muted-foreground">{c.roles}</span>}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
