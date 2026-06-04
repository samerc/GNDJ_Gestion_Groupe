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

// ─── Simple bar component ──────────────────
function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-muted-foreground truncate">{label}</span>
      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-xs font-medium text-right">{value}</span>
    </div>
  )
}

function AdminDashboard() {
  const currentSchoolYear = useSettingValue('cotisation.current_school_year') ?? '2025-2026'
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear)
  const { data, isLoading } = useAdminDashboard(schoolYear)

  if (isLoading) return <LoadingSpinner />
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tableau de bord</h1>
        <Select value={schoolYear} onValueChange={setSchoolYear}>
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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
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
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${data.missingDocuments > 0 ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
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
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${data.unpaidCotisations > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
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
          <CardContent className="space-y-2.5">
            {data.unitBreakdown.map(u => (
              <div key={u.unitCode}>
                <Bar value={u.memberCount} max={maxUnitMembers} color="bg-primary" label={u.unitCode} />
                <div className="flex justify-end mt-0.5">
                  <span className="text-[10px] text-muted-foreground">{u.docCompliance}% dossiers complets</span>
                </div>
              </div>
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
          <CardContent className="space-y-2.5">
            {data.ageGroups.map(g => (
              <Bar key={g.label} value={g.count} max={maxAgeGroup} color="bg-indigo-500" label={g.label} />
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

  if (user.isSuperAdmin) return <AdminDashboard />

  const isUnitLeader = hasPermission(PERMISSIONS.UNITS_EDIT)

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
