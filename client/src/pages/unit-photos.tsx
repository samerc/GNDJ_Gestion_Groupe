// « Photos des membres »: one unit's active members as a wall of photos (3:4, the shape they're printed in), grouped by
// team, with a silhouette for anyone without a photo — to spot missing, badly cropped or sideways photos at a glance.
// A chef d'unité sees the unit(s) they lead; a group manager (CG / ACG / super-admin) picks any active unit.
// Clicking a photo opens it big, with a button to replace it and a link to the member's file.
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Camera, ExternalLink, Images } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { useLeaderUnits } from '@/hooks/use-leader-units'
import { useUnits, useUnitPhotos, type UnitPhotoMember } from '@/services/unit-service'
import { MemberPhoto } from '@/components/shared/member-photo'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { SegmentedToggle } from '@/components/shared/segmented-toggle'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// Branch order of the parcours, then the unit's number (2, 3, 10 — not 10, 2, 3).
const BRANCH_RANK: Record<string, number> = { MEU: 0, RON: 1, TRO: 2, COM: 3, CLAN: 4, CLA: 4, NOY: 5, JEM: 6, FEU: 7, CAR: 8, GRP: 9 }
const unitNumber = (name: string) => Number(/\d+/.exec(name)?.[0] ?? 999)

type Filter = 'all' | 'missing'

export default function UnitPhotosPage() {
  const user = useAuthStore((s) => s.user)
  const isManager = !!user?.isSuperAdmin || !!user?.permissions.includes(PERMISSIONS.MAITRISE_MANAGE)
  const leaderUnits = useLeaderUnits()
  const { data: allUnits } = useUnits({ isActive: true, pageSize: 200 }, isManager)

  // Units offered: every active unit for a manager (parcours order), else the units this chef leads.
  const units = useMemo(() => {
    if (!isManager) return leaderUnits.map((u) => ({ id: u.unitId, name: u.unitName }))
    return [...(allUnits?.items ?? [])]
      .sort((a, b) => (BRANCH_RANK[a.unitTypeCode] ?? 99) - (BRANCH_RANK[b.unitTypeCode] ?? 99)
        || unitNumber(a.name) - unitNumber(b.name) || a.name.localeCompare(b.name))
      .map((u) => ({ id: u.id, name: `${u.code} — ${u.name}` }))
  }, [isManager, leaderUnits, allUnits])

  // A manager picks explicitly; a chef starts on their (first) unit.
  const [picked, setPicked] = useState('')
  const unitId = picked || (isManager ? '' : units[0]?.id ?? '')
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<UnitPhotoMember | null>(null)

  const { data, isLoading } = useUnitPhotos(unitId)
  const missing = data ? data.memberCount - data.withPhotoCount : 0
  const teams = useMemo(() => (data?.teams ?? [])
    .map((t) => ({ ...t, members: filter === 'missing' ? t.members.filter((m) => !m.photoPath) : t.members }))
    .filter((t) => t.members.length > 0), [data, filter])

  const picker = units.length > (isManager ? 0 : 1) ? (
    <Select value={unitId} onValueChange={(v) => { setPicked(v); setFilter('all') }}>
      <SelectTrigger className="h-9 w-full sm:w-72"><SelectValue placeholder="Choisir une unité…" /></SelectTrigger>
      <SelectContent>
        {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
      </SelectContent>
    </Select>
  ) : undefined

  return (
    <Page>
      <PageHeader title="Photos des membres" icon={Images}
        description="Les photos de chaque membre de l'unité, pour repérer celles qui manquent ou sont mal cadrées."
        actions={picker} />

      {!unitId ? (
        <EmptyState icon={Images} title={isManager ? 'Choisissez une unité' : 'Aucune unité'}
          description={isManager ? "Sélectionnez une unité en haut pour voir les photos de ses membres." : "Vous ne dirigez aucune unité."} />
      ) : isLoading || !data ? (
        <LoadingSpinner variant="page" />
      ) : (
        <div className="space-y-4">
          {/* Counts + the « missing only » filter */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-48 flex-1 items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-success transition-all"
                  style={{ width: data.memberCount ? `${(data.withPhotoCount / data.memberCount) * 100}%` : '0%' }} />
              </div>
              <span className="whitespace-nowrap text-sm font-medium">{data.withPhotoCount}/{data.memberCount} avec photo</span>
            </div>
            <SegmentedToggle<Filter> size="sm" value={filter} onChange={setFilter}
              options={[{ value: 'all', label: 'Tous' }, { value: 'missing', label: `Sans photo (${missing})` }]} />
          </div>

          {teams.length === 0 ? (
            <EmptyState icon={Camera} title={filter === 'missing' ? 'Tout le monde a une photo' : 'Aucun membre actif'} />
          ) : teams.map((t) => (
            <Card key={t.name}>
              <CardContent className="p-4">
                <h2 className="mb-3 text-sm font-semibold">
                  {t.name} <span className="font-normal text-muted-foreground">· {t.members.length}</span>
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3">
                  {t.members.map((m) => (
                    <button key={m.memberId} type="button" onClick={() => setOpen(m)}
                      className="group flex flex-col items-center gap-1.5 rounded-lg p-1.5 text-center hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <MemberPhoto memberId={m.memberId} name={`${m.firstName} ${m.lastName}`} photoPath={m.photoPath}
                        size={96} height={128} rounded="rounded-md" placeholder="silhouette"
                        className="ring-1 ring-border" />
                      <span className="line-clamp-2 text-xs leading-tight">
                        <span className="font-medium">{m.firstName}</span> {m.lastName}
                      </span>
                      {m.isMaitrise && m.roleName && <span className="line-clamp-1 text-[11px] text-muted-foreground">{m.roleName}</span>}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* The photo in big, with the replace / delete buttons of MemberPhoto (the server checks the rights). */}
      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null) }}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm">
          <DialogHeader><DialogTitle>{open ? `${open.firstName} ${open.lastName}` : ''}</DialogTitle></DialogHeader>
          {open && (
            <div className="flex justify-center py-2">
              <MemberPhoto memberId={open.memberId} name={`${open.firstName} ${open.lastName}`}
                photoPath={data?.teams.flatMap((t) => t.members).find((m) => m.memberId === open.memberId)?.photoPath ?? open.photoPath}
                size={240} height={320} rounded="rounded-lg" placeholder="silhouette" editable />
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {open && (
              <Button variant="outline" asChild>
                <Link to={`/members/${open.memberId}`}><ExternalLink className="mr-1.5 h-4 w-4" />Ouvrir la fiche</Link>
              </Button>
            )}
            <Button variant="ghost" onClick={() => setOpen(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  )
}
