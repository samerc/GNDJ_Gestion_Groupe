import { useState } from 'react'
import { Navigate } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { useAdminDashboard } from '@/services/dashboard-service'
import { useSettingValue } from '@/services/settings-service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import UnitLeaderDashboard from '@/pages/dashboard-unit-leader'
import { Users, UserCheck, FileX, Receipt, UserMinus } from 'lucide-react'

// ─── Horizontal bar chart ──────────────────
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

function AdminDashboard() {
  const currentScoutYear = useSettingValue('cotisation.current_scout_year') ?? '2025-2026'
  const [scoutYear, setScoutYear] = useState(currentScoutYear)
  const { data, isLoading } = useAdminDashboard(scoutYear)

  if (isLoading) return <LoadingSpinner variant="page" />
  if (!data) return (
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-2">
      <p className="text-lg font-medium">Impossible de charger le tableau de bord</p>
      <p className="text-sm">Veuillez réessayer ultérieurement.</p>
    </div>
  )

  const maxUnitMembers = Math.max(...data.unitBreakdown.map(u => u.memberCount), 1)
  const maxAgeGroup = Math.max(...data.ageGroups.map(g => g.count), 1)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground">Vue d'ensemble du groupe — année {scoutYear}</p>
        </div>
        <Select value={scoutYear} onValueChange={setScoutYear}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="2025-2026">2025-2026</SelectItem>
            <SelectItem value="2024-2025">2024-2025</SelectItem>
            <SelectItem value="2023-2024">2023-2024</SelectItem>
          </SelectContent>
        </Select>
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

export default function DashboardPage() {
  const { user, hasPermission } = useAuthStore()
  const [selectedUnit, setSelectedUnit] = useState<string>('')

  if (!user) return <LoadingSpinner />

  // Super-admins and Chefs de Groupe (group-level managers) see the group-wide dashboard.
  if (user.isSuperAdmin || hasPermission(PERMISSIONS.MAITRISE_MANAGE)) return <AdminDashboard />

  const isUnitLeader = hasPermission(PERMISSIONS.UNITS_EDIT)

  // Regular members go straight to profile
  if (!isUnitLeader) return <Navigate to="/my-profile" replace />

  if (isUnitLeader && user.unitAccess.length > 1) {
    const unitId = selectedUnit || user.unitAccess[0]?.unitId
    return (
      <div className="space-y-4">
        <Select value={unitId} onValueChange={setSelectedUnit}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Sélectionner une unité" /></SelectTrigger>
          <SelectContent>
            {user.unitAccess.map(u => <SelectItem key={u.unitId} value={u.unitId}>{u.unitName} — {u.roleName}</SelectItem>)}
          </SelectContent>
        </Select>
        <UnitLeaderDashboard unitId={unitId} />
      </div>
    )
  }

  if (isUnitLeader && user.unitAccess.length === 1) {
    return <UnitLeaderDashboard unitId={user.unitAccess[0].unitId} />
  }

  return <Navigate to="/my-profile" replace />
}
