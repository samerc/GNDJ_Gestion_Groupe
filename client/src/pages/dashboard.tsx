import { useMemo, useState } from 'react'
import { Navigate } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import type { UnitAccess } from '@/types/auth'
import { useAdminDashboard } from '@/services/dashboard-service'
import { useCurrentScoutYear } from '@/hooks/use-scout-year'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import UnitLeaderDashboard from '@/pages/dashboard-unit-leader'
import { Users, UserCheck, FileX, Receipt, UserMinus, Calendar } from 'lucide-react'

// ─── Horizontal bar chart ──────────────────
// One labelled bar; width is value/max as a %. When the bar is too short (≤20%) to hold its
// number inside, the value is rendered just past the bar's end instead (the `--w` CSS var).
function ChartBar({ value, max, color, label, suffix }: { value: number; max: number; color: string; label: string; suffix?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="group flex items-center gap-3 py-1">
      <span className="w-16 text-xs font-medium text-right shrink-0">{label}</span>
      <div className="flex-1 relative">
        <div className="h-7 bg-muted/50 rounded-md" />
        <div className={`absolute inset-y-0 left-0 rounded-md ${color} transition-all duration-500 ease-out flex items-center`} style={{ width: `${Math.max(pct, 2)}%` }}>
          {pct > 20 && <span className="text-white text-xs font-semibold ml-2">{value}</span>}
        </div>
        {pct <= 20 && <span className="absolute left-[calc(max(2%,var(--w))+8px)] top-1/2 -translate-y-1/2 text-xs font-medium" style={{ '--w': `${pct}%` } as React.CSSProperties}>{value}</span>}
      </div>
      {suffix && <span className="text-[10px] text-muted-foreground w-24 shrink-0">{suffix}</span>}
    </div>
  )
}

// Group-wide overview shown to super-admins and Chefs de Groupe: key counts, members-by-unit
// and age-distribution charts, all scoped to the selected scout year (every tile is year-aware).
function AdminDashboard() {
  // Default the year selector to the active scout year (follows the passage year).
  const currentScoutYear = useCurrentScoutYear()
  const [scoutYear, setScoutYear] = useState(currentScoutYear)
  const { data, isLoading } = useAdminDashboard(scoutYear)

  // Year options: the current scout year (labelled "en cours") + the previous 4 — built from the current year
  // so the list is never stale and the selected value is always present (before, the hardcoded list omitted the
  // current year, so the dropdown showed blank). If the selected year predates the window, it's added too.
  const years = useMemo(() => {
    const start = parseInt(currentScoutYear.slice(0, 4), 10)
    const list = Number.isNaN(start)
      ? [currentScoutYear]
      : Array.from({ length: 5 }, (_, i) => `${start - i}-${start - i + 1}`)
    return list.includes(scoutYear) ? list : [scoutYear, ...list]
  }, [currentScoutYear, scoutYear])

  if (isLoading) return <LoadingSpinner variant="page" />
  if (!data) return (
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-2">
      <p className="text-lg font-medium">Impossible de charger le tableau de bord</p>
      <p className="text-sm">Veuillez réessayer ultérieurement.</p>
    </div>
  )

  // Bar-scale denominators (the largest bucket = 100% width); floor at 1 to avoid divide-by-zero.
  const maxUnitMembers = Math.max(...data.unitBreakdown.map(u => u.memberCount), 1)
  const maxAgeGroup = Math.max(...data.ageGroups.map(g => g.count), 1)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground">Vue d'ensemble du groupe — année {scoutYear}</p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Année scoute</label>
          <Select value={scoutYear} onValueChange={setScoutYear}>
            <SelectTrigger className="w-full sm:w-60 gap-2"><Calendar className="h-4 w-4 shrink-0 text-muted-foreground" /><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y}>{y}{y === currentScoutYear ? ' — année en cours' : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 1: Key numbers */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.totalMembers}</p>
              <p className="text-xs text-muted-foreground">Membres</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <UserCheck className="h-5 w-5" />
            </div>
            <div className="flex items-baseline gap-3">
              <div>
                <p className="text-2xl font-bold">{data.boys}</p>
                <p className="text-xs text-muted-foreground">Garçons</p>
              </div>
              <span className="text-muted-foreground/50">/</span>
              <div>
                <p className="text-2xl font-bold">{data.girls}</p>
                <p className="text-xs text-muted-foreground">Filles</p>
              </div>
              {data.ungendered > 0 && (
                <>
                  <span className="text-muted-foreground/50">/</span>
                  <div>
                    <p className="text-2xl font-bold text-muted-foreground">{data.ungendered}</p>
                    <p className="text-xs text-muted-foreground">Non renseigné</p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className={data.missingDocuments > 0 ? 'border-orange-200' : ''}>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${data.missingDocuments > 0 ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
              <FileX className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.missingDocuments}</p>
              <p className="text-xs text-muted-foreground">Docs manquants</p>
            </div>
          </CardContent>
        </Card>
        <Card className={data.unpaidCotisations > 0 ? 'border-red-200' : ''}>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${data.unpaidCotisations > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.unpaidCotisations}</p>
              <p className="text-xs text-muted-foreground">Cotisations impayées</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Members by unit */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Membres par unité</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.unitBreakdown.map(u => (
              <ChartBar key={u.unitCode} value={u.memberCount} max={maxUnitMembers} color="bg-primary" label={u.unitCode} suffix={`${u.docCompliance}% complets`} />
            ))}
            {data.membersWithoutUnit > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t text-sm text-muted-foreground">
                <UserMinus className="h-3.5 w-3.5" />
                <span>{data.membersWithoutUnit} membre{data.membersWithoutUnit > 1 ? 's' : ''} sans unité</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Age distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Répartition par âge</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.ageGroups.map(g => (
              <ChartBar key={g.label} value={g.count} max={maxAgeGroup} color="bg-indigo-500" label={g.label} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Distinct units (by id) — a member can hold several roles in the same unit.
function dedupeByUnit(units: UnitAccess[]): UnitAccess[] {
  const seen = new Set<string>()
  const out: UnitAccess[] = []
  for (const u of units) if (!seen.has(u.unitId)) { seen.add(u.unitId); out.push(u) }
  return out
}

// Renders a unit leader's roster: a picker above it when they lead more than one unit.
function UnitRoster({ units, selectedUnit, setSelectedUnit }: { units: UnitAccess[]; selectedUnit: string; setSelectedUnit: (v: string) => void }) {
  const unitId = selectedUnit || units[0]?.unitId
  if (!unitId) return <Navigate to="/my-profile" replace />
  if (units.length === 1) return <UnitLeaderDashboard unitId={units[0].unitId} />
  return (
    <div className="space-y-4">
      <Select value={unitId} onValueChange={setSelectedUnit}>
        <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Sélectionner une unité" /></SelectTrigger>
        <SelectContent>
          {units.map(u => <SelectItem key={u.unitId} value={u.unitId}>{u.unitName} — {u.roleName}</SelectItem>)}
        </SelectContent>
      </Select>
      <UnitLeaderDashboard unitId={unitId} />
    </div>
  )
}

// Landing page after login. Routes each user to the right dashboard by role:
// super-admin/CG/ACG → group overview, unit leader → their unit roster, everyone else → Ma fiche. Someone
// who is BOTH a group leader (CG/ACG) AND a unit leader (CU/ACU) gets a Groupe | Mon unité toggle.
export default function DashboardPage() {
  const { user, hasPermission } = useAuthStore()
  const [selectedUnit, setSelectedUnit] = useState<string>('')
  const [view, setView] = useState<'groupe' | 'unite'>('groupe')

  if (!user) return <LoadingSpinner />

  // Group-level = super-admin, Chef de Groupe (maitrise.manage), or Assistant Chef de Groupe (a group-level role).
  const isGroupLevel = user.isSuperAdmin || hasPermission(PERMISSIONS.MAITRISE_MANAGE) || user.unitAccess.some(u => u.isGroupLevel)
  // Units the member personally LEADS as a CU/ACU — real unit-leadership only, EXCLUDING the group Maîtrise
  // assignment (a group-level role grants all-units access but isn't a "unit I run").
  const myLeaderUnits = dedupeByUnit(user.unitAccess.filter(u => u.isLeader && !u.isGroupLevel))
  const isUnitLeader = hasPermission(PERMISSIONS.MEMBERS_EDIT)

  // Both a group leader AND a unit leader → toggle between the group overview and their own unit(s).
  if (isGroupLevel && myLeaderUnits.length > 0) {
    return (
      <div className="space-y-4">
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-sm">
          <button onClick={() => setView('groupe')} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${view === 'groupe' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Groupe</button>
          <button onClick={() => setView('unite')} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${view === 'unite' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Mon unité</button>
        </div>
        {view === 'groupe' ? <AdminDashboard /> : <UnitRoster units={myLeaderUnits} selectedUnit={selectedUnit} setSelectedUnit={setSelectedUnit} />}
      </div>
    )
  }

  // Group leader only (CG/ACG/super-admin without a unit role) → group overview.
  if (isGroupLevel) return <AdminDashboard />

  // Regular members go straight to profile.
  if (!isUnitLeader) return <Navigate to="/my-profile" replace />

  // Unit leader only (e.g. a CU who is a youth elsewhere) → the unit(s) they lead (fallback: all their units).
  return <UnitRoster units={myLeaderUnits.length > 0 ? myLeaderUnits : dedupeByUnit(user.unitAccess)} selectedUnit={selectedUnit} setSelectedUnit={setSelectedUnit} />
}
