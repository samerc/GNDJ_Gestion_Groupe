import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminDashboard } from '@/services/dashboard-service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import UnitLeaderDashboard from '@/pages/dashboard-unit-leader'
import { Users, Building2, UsersRound, ClipboardList } from 'lucide-react'

function AdminDashboard() {
  const navigate = useNavigate()
  const { data, isLoading } = useAdminDashboard()

  if (isLoading) return <LoadingSpinner />
  if (!data) return null

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tableau de bord</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Users className="h-8 w-8 text-primary/60" />
            <div>
              <p className="text-2xl font-bold">{data.totalMembers}</p>
              <p className="text-sm text-muted-foreground">Membres</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Building2 className="h-8 w-8 text-primary/60" />
            <div>
              <p className="text-2xl font-bold">{data.totalUnits}</p>
              <p className="text-sm text-muted-foreground">Unités actives</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <UsersRound className="h-8 w-8 text-primary/60" />
            <div>
              <p className="text-2xl font-bold">{data.totalTeams}</p>
              <p className="text-sm text-muted-foreground">Équipes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <ClipboardList className="h-8 w-8 text-primary/60" />
            <div>
              <p className="text-2xl font-bold">{data.activeAssignments}</p>
              <p className="text-sm text-muted-foreground">Postes actifs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Unités</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.units.map(u => (
              <div key={u.id} className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => navigate(`/units/${u.id}`)}>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{u.name}</span>
                    <Badge variant="outline" className="text-xs">{u.unitTypeName}</Badge>
                    {!u.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                  </div>
                </div>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>{u.memberCount} membres</span>
                  <span>{u.teamCount} équipes</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const [selectedUnit, setSelectedUnit] = useState<string>('')

  if (!user) return <LoadingSpinner />

  // Super admin → admin dashboard
  if (user.isSuperAdmin) {
    return <AdminDashboard />
  }

  // Unit leader with multiple units → unit picker + unit dashboard
  if (user.unitAccess.length > 1) {
    const unitId = selectedUnit || user.unitAccess[0]?.unitId
    return (
      <div className="space-y-4">
        <Select value={unitId} onValueChange={setSelectedUnit}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Sélectionner une unité" />
          </SelectTrigger>
          <SelectContent>
            {user.unitAccess.map(u => (
              <SelectItem key={u.unitId} value={u.unitId}>{u.unitName} — {u.roleName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <UnitLeaderDashboard unitId={unitId} />
      </div>
    )
  }

  // Unit leader with single unit
  if (user.unitAccess.length === 1) {
    return <UnitLeaderDashboard unitId={user.unitAccess[0].unitId} />
  }

  // Regular member with no unit access
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tableau de bord</h1>
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-lg font-medium">Bienvenue, {user.firstName} {user.lastName}</p>
          <p className="text-sm text-muted-foreground mt-1">Vous n'êtes actuellement assigné à aucune unité.</p>
        </CardContent>
      </Card>
    </div>
  )
}
