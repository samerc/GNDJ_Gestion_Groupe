import { useQuery, useMutation } from '@tanstack/react-query'
import publicApi from '@/lib/public-api-client'

export interface PublicUnitListItem {
  slug: string
  name: string
  unitTypeName: string
  gender: string | null
  ageMin: number | null
  ageMax: number | null
  memberCount: number
}

export interface PublicUnitGroup {
  unitTypeName: string
  color: string | null
  ageMin: number | null
  ageMax: number | null
  description: string | null
  units: PublicUnitListItem[]
}

// ---- Site config (inscriptions open + editable texts) ----
export interface SiteValue { title: string; text: string }
export interface SiteStat { value: string; label: string }
export interface SiteContent {
  home: {
    heroBadge: string; heroTitle: string; heroSubtitle: string
    introTitle: string; introText: string
    values: SiteValue[]; stats: SiteStat[]
    ctaTitle: string; ctaText: string
  }
  footer: { tagline: string }
  contact: { intro: string; address: string }
}
export interface PublicSiteConfig { inscriptionsOpen: boolean; content: SiteContent }

export function usePublicSiteConfig() {
  return useQuery({
    queryKey: ['public', 'site-config'],
    queryFn: async () => (await publicApi.get<PublicSiteConfig>('/public/site-config')).data,
    staleTime: 60_000,
  })
}

export interface PublicLeader {
  name: string
  roleName: string
}

export interface PublicTeam {
  name: string
  youthCount: number
}

export interface PublicUnitDetail {
  slug: string
  name: string
  unitTypeName: string
  gender: string | null
  ageMin: number | null
  ageMax: number | null
  publicDescription: string | null
  foundedDate: string | null
  leaders: PublicLeader[]
  teams: PublicTeam[]
  totalYouth: number
}

export function usePublicUnits() {
  return useQuery({
    queryKey: ['public', 'units'],
    queryFn: async () => (await publicApi.get<PublicUnitGroup[]>('/public/units')).data,
  })
}

export function usePublicUnitDetail(slug: string | undefined) {
  return useQuery({
    queryKey: ['public', 'unit', slug],
    queryFn: async () => (await publicApi.get<PublicUnitDetail>(`/public/units/${slug}`)).data,
    enabled: !!slug,
  })
}

export interface ContactPayload {
  name: string
  email: string
  subject: string
  message: string
  website: string // honeypot — must stay empty
}

export function useSendContact() {
  return useMutation({
    mutationFn: (data: ContactPayload) => publicApi.post('/public/contact', data),
  })
}
