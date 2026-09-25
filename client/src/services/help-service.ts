// In-app "Aide" guides (docs/help, served role-filtered by /help). `client` = apiClient for signed-in members,
// publicApi for the anonymous public guide (enrolment portal). Keyed ['help', ...].
import { useQuery } from '@tanstack/react-query'
import type { AxiosInstance } from 'axios'
import apiClient from '@/lib/api-client'

export type HelpAudience = 'public' | 'member' | 'cu' | 'cg' | 'admin' | 'dev'

export interface HelpDocSummary {
  slug: string
  title: string
  audience: HelpAudience
  order: number
  summary: string | null
  sections: string[]
}

export interface HelpDoc {
  slug: string
  title: string
  audience: HelpAudience
  summary: string | null
  markdown: string
}

export interface HelpSearchHit { slug: string; title: string; section: string; snippet: string }

// Labels + order of the audience groups on the Aide page.
export const AUDIENCE_LABELS: Record<HelpAudience, string> = {
  public: 'Inscription (familles)',
  member: 'Membres',
  cu: "Chefs d'unité",
  cg: 'Chef de groupe',
  admin: 'Administration',
  dev: 'Documentation technique',
}

export function useHelpList(client: AxiosInstance = apiClient) {
  return useQuery({
    queryKey: ['help', 'list', client === apiClient ? 'auth' : 'public'],
    queryFn: () => client.get<HelpDocSummary[]>('/help').then((r) => r.data),
    staleTime: 5 * 60_000,
  })
}

export function useHelpDoc(slug: string | undefined, client: AxiosInstance = apiClient) {
  return useQuery({
    queryKey: ['help', 'doc', slug, client === apiClient ? 'auth' : 'public'],
    queryFn: () => client.get<HelpDoc>(`/help/${slug}`).then((r) => r.data),
    enabled: !!slug,
    staleTime: 5 * 60_000,
  })
}

export function useHelpSearch(q: string) {
  const term = q.trim()
  return useQuery({
    queryKey: ['help', 'search', term],
    queryFn: () => apiClient.get<HelpSearchHit[]>('/help/search', { params: { q: term } }).then((r) => r.data),
    enabled: term.length >= 2,
    staleTime: 60_000,
  })
}

// Heading text → anchor id (same rule used by the viewer, the TOC and search hits).
export function headingId(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
