// The release history shown on « Journal des versions » (pages/admin/changelog.tsx, lazy-loaded). deploy/bump.ps1
// writes src/data/changelog.json from the git commits since the previous version tag; newest entry first. Keep this
// import OUT of lib/app-version.ts, which every page loads.
import changelogData from '@/data/changelog.json'
import type { ChangelogEntry } from '@/lib/app-version'

export const CHANGELOG: ChangelogEntry[] = changelogData as ChangelogEntry[]
