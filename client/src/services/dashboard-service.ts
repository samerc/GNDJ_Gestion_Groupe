import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface RosterMemberDto {
  memberId: string; firstName: string; lastName: string; cardNumber: string | null
  functionalRoleName: string; primaryPhone: string | null; primaryEmail: string | null
  dateOfBirth: string | null
}

export interface TeamRosterDto {
  teamId: string; teamName: string; totem: string | null; color1: string | null; color2: string | null
  members: RosterMemberDto[]
}

export interface UnitDashboardDto {
  unitId: string; unitName: string; unitTypeName: string
  totalMembers: number; totalTeams: number
  teams: TeamRosterDto[]; unassignedMembers: RosterMemberDto[]
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

export function useUnitDashboard(unitId: string | undefined) {
  return useQuery({
    queryKey: ['dashboard', 'unit', unitId],
    queryFn: () => apiClient.get<UnitDashboardDto>(`/dashboard/unit/${unitId}`).then(r => r.data),
    enabled: !!unitId,
  })
}

export function useAdminDashboard(schoolYear: string) {
  return useQuery({
    queryKey: ['dashboard', 'admin', schoolYear],
    queryFn: () => apiClient.get<AdminDashboardDto>('/dashboard/admin', { params: { schoolYear } }).then(r => r.data),
  })
}
