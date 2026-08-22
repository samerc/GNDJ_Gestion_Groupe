// Public group-site resource: units, site config, contact form. All anonymous via publicApi (no auth).
// Keyed on ['public', ...]. SiteContent shape is the source of truth re-exported by site-content-service.
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
  unitTypeId: string
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
  footer: { tagline: string; instagram?: string; facebook?: string; email?: string; phone?: string }
  contact: { intro: string; address: string }
}
export interface PublicSiteConfig { inscriptionsOpen: boolean; content: SiteContent }

// GET /public/site-config (anonymous) → inscriptionsOpen flag (= demande.enabled) + editable site texts; 60s staleTime.
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
  phone: string | null // the leader's own (personal) phone, when on file
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

// GET /public/units (anonymous) → published units grouped by branch (unit type) for the public list.
export function usePublicUnits() {
  return useQuery({
    queryKey: ['public', 'units'],
    queryFn: async () => (await publicApi.get<PublicUnitGroup[]>('/public/units')).data,
  })
}

// GET /public/units/{slug} (anonymous) → published unit detail (maîtrise, teams, founding year); disabled until slug set.
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

// POST /public/contact (anonymous) → contact form; rate-limited + honeypot (website must stay empty) server-side.
export function useSendContact() {
  return useMutation({
    mutationFn: (data: ContactPayload) => publicApi.post('/public/contact', data),
  })
}
