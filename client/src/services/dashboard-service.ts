// Dashboard resource: read-only aggregates — the unit-leader roster and the CG/admin overview.
// Queries key on ['dashboard', ...].
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface RosterMemberDto {
  memberId: string; firstName: string; lastName: string; cardNumber: string | null
  functionalRoleName: string; primaryPhone: string | null; primaryEmail: string | null
  dateOfBirth: string | null; photoPath: string | null
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
