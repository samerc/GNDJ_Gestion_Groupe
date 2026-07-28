// Single access point for the app's release identity + changelog.
// - APP_VERSION / BUILD_COMMIT / BUILD_DATE are baked in at build time (vite.config.ts `define`).
// - CHANGELOG is the auto-generated release history (deploy/bump.ps1 writes src/data/changelog.json from
//   the git commits since the previous version tag). Newest entry first.
import changelogData from '@/data/changelog.json'

export interface ChangelogEntry {
  version: string
  date: string
  changes: string[]
}

// __* globals fall back to safe defaults in a context where Vite didn't inject them (e.g. unit tests).
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
export const BUILD_COMMIT: string = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev'
export const BUILD_DATE: string = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : ''

export const CHANGELOG: ChangelogEntry[] = changelogData as ChangelogEntry[]
