// Dashboard resource: read-only aggregates — the unit-leader roster and the CG/admin overview.
// Queries key on ['dashboard', ...].
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface RosterMemberDto {
  memberId: string; firstName: string; lastName: string; cardNumber: string | null
  functionalRoleName: string; primaryPhone: string | null; primaryEmail: string | null
  dateOfBirth: string | null; photoPath: string | null
  // Dossier compliance (same rule as the Membres list): all active document types approved; current-year
  // cotisation paid or exempt (null = cotisation not tracked).
  docsComplete: boolean; cotisationOk: boolean | null
}

export interface TeamRosterDto {
  teamId: string; teamName: string; totem: string | null; color1: string | null; color2: string | null
  members: RosterMemberDto[]
}

export interface UnitRosterGroupDto { id: string; name: string; memberIds: string[] }

export interface UnitDashboardDto {
  unitId: string; unitName: string; unitTypeName: string
  totalMembers: number; totalTeams: number
  teams: TeamRosterDto[]; unassignedMembers: RosterMemberDto[]
  groups: UnitRosterGroupDto[] // rule-based groups the CU can filter the roster by (ShowInUnitList)
}

export interface UnitBreakdownDto { unitCode: string; unitName: string; memberCount: number; docCompliance: number }
export interface AgeGroupDto { label: string; count: number }

export interface AdminDashboardDto {
  totalMembers: number
  boys: number
  girls: number
  ungendered: number
  membersWithoutUnit: number
  unpaidCotisations: number
  missingDocuments: number
  unitBreakdown: UnitBreakdownDto[]
  ageGroups: AgeGroupDto[]
}

// Accueil "action hub" overview — timely/actionable content (action items, campaign, rentrée, cotisations,
// trend), computed "now" and independent of the year selector that drives the stats/charts above.
export interface DemandeCampaignDto {
  enabled: boolean; total: number; pending: number; approved: number; declined: number
  responsesSent: number; decided: number; acceptanceRate: number
}
export interface RentreeSummaryDto { scoutYear: string; total: number; done: number }
export interface CotisationOverviewDto { total: number; paid: number; unpaid: number; exempt: number }

export interface DashboardOverviewDto {
  pendingDemandes: number
  pendingChangeRequests: number
  passagesToFinalize: number
  pendingDocuments: number
  membersOnHold: number
  campaign: DemandeCampaignDto
  rentree: RentreeSummaryDto | null
  cotisations: CotisationOverviewDto
  membersThisYear: number
  membersLastYear: number
  thisYear: string
  lastYear: string
}

// GET /dashboard/overview — the group-level Accueil action hub. Keyed ['dashboard','overview'].
export function useDashboardOverview(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: () => apiClient.get<DashboardOverviewDto>('/dashboard/overview').then(r => r.data),
    enabled,
    staleTime: 60_000,
  })
}

// GET /dashboard/unit/{unitId} — unit roster grouped by team (Maîtrise first) for the CU dashboard.
// Unit-scoped. Keyed ['dashboard','unit',unitId].
export function useUnitDashboard(unitId: string | undefined) {
  return useQuery({
    queryKey: ['dashboard', 'unit', unitId],
    queryFn: () => apiClient.get<UnitDashboardDto>(`/dashboard/unit/${unitId}`).then(r => r.data),
    enabled: !!unitId,
  })
}

// GET /dashboard/admin — group-wide stats (counts/gender/units/ages/unpaid/docs), all scoped to the
// selected scoutYear's active window. Keyed ['dashboard','admin',scoutYear].
export function useAdminDashboard(scoutYear: string) {
  return useQuery({
    queryKey: ['dashboard', 'admin', scoutYear],
    queryFn: () => apiClient.get<AdminDashboardDto>('/dashboard/admin', { params: { scoutYear } }).then(r => r.data),
  })
}

// GET /my-profile/dashboard-layout — the caller's saved group-dashboard layout (JSON string, or null = default).
// Keyed ['dashboard','layout']; merged against the widget registry by the page via mergeLayout().
export function useDashboardLayout() {
  return useQuery({
    queryKey: ['dashboard', 'layout'],
    queryFn: () => apiClient.get<{ layout: string | null }>('/my-profile/dashboard-layout').then(r => r.data.layout),
    staleTime: 5 * 60 * 1000,
  })
}

// PUT /my-profile/dashboard-layout — save (or clear, when null) the caller's layout.
export function useUpdateDashboardLayout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (layoutJson: string | null) => apiClient.put('/my-profile/dashboard-layout', { layoutJson }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard', 'layout'] }),
  })
}

// GET /my-profile/unit-dashboard-prefs — the CU's saved "Mon unité" preferences (JSON string, null = defaults).
export function useUnitDashboardPrefs() {
  return useQuery({
    queryKey: ['unit-dashboard-prefs'],
    queryFn: () => apiClient.get<{ prefs: string | null }>('/my-profile/unit-dashboard-prefs').then(r => r.data.prefs),
    staleTime: 5 * 60 * 1000,
  })
}

// PUT /my-profile/unit-dashboard-prefs — save (or clear, when null) the CU's preferences.
export function useUpdateUnitDashboardPrefs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (prefsJson: string | null) => apiClient.put('/my-profile/unit-dashboard-prefs', { prefsJson }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unit-dashboard-prefs'] }),
  })
}
