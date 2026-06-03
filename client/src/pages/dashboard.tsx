import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { useAdminDashboard } from '@/services/dashboard-service'
import { useExpiringDocuments } from '@/services/document-service'
import { useUnpaidCotisations } from '@/services/cotisation-service'
import { useSettingValue } from '@/services/settings-service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import UnitLeaderDashboard from '@/pages/dashboard-unit-leader'
import { Users, Building2, UsersRound, ClipboardList, AlertTriangle, FileText, Receipt } from 'lucide-react'

function DashboardAlerts() {
  const navigate = useNavigate()
  const currentSchoolYear = useSettingValue('cotisation.current_school_year') ?? '2025-2026'
  const { data: expiringDocs } = useExpiringDocuments(30)
  const { data: unpaidMembers } = useUnpaidCotisations(currentSchoolYear)

  const hasAlerts = (expiringDocs && expiringDocs.length > 0) || (unpaidMembers && unpaidMembers.length > 0)
  if (!hasAlerts) return null

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {expiringDocs && expiringDocs.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-orange-700">
              <AlertTriangle className="h-4 w-4" />
              Documents ({expiringDocs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-48 overflow-auto">
              {expiringDocs.map(doc => (
                <div key={doc.documentId}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:underline"
                  onClick={() => navigate(`/members/${doc.memberId}`)}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{doc.memberName}</span>
                  <span className="text-muted-foreground">—</span>
                  <span className="truncate text-muted-foreground">{doc.title}</span>
                  <Badge variant={doc.isExpired ? 'destructive' : 'outline'} className="ml-auto shrink-0 text-xs">
                    {doc.isExpired ? 'Expiré' : new Date(doc.expiryDate).toLocaleDateString('fr-FR')}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {unpaidMembers && unpaidMembers.length > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-red-700">
              <Receipt className="h-4 w-4" />
              Cotisations impayées ({unpaidMembers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-48 overflow-auto">
              {unpaidMembers.map(m => (
                <div key={m.memberId}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:underline"
                  onClick={() => navigate(`/members/${m.memberId}`)}
                >
                  <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{m.memberName}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{m.unitName}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

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

      <DashboardAlerts />

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
  const { user, hasPermission } = useAuthStore()
  const [selectedUnit, setSelectedUnit] = useState<string>('')

  if (!user) return <LoadingSpinner />

  // Super admin → admin dashboard
  if (user.isSuperAdmin) {
    return <AdminDashboard />
  }

  const isUnitLeader = hasPermission(PERMISSIONS.UNITS_EDIT)

  // Unit leader with multiple units → unit picker + unit dashboard
  if (isUnitLeader && user.unitAccess.length > 1) {
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
  if (isUnitLeader && user.unitAccess.length === 1) {
    return <UnitLeaderDashboard unitId={user.unitAccess[0].unitId} />
  }

  // Regular member → redirect to Ma fiche
  return <Navigate to="/my-profile" replace />
}
