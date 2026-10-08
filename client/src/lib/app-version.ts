// The app's release identity: APP_VERSION / BUILD_COMMIT / BUILD_DATE, baked in at build time (vite.config.ts
// `define`). Read by the header and sidebar on every page, so this file must stay tiny: the changelog itself lives in
// lib/changelog.ts, imported only by the « Journal des versions » page (it is ~250 KB of JSON and used to sit in the
// start-up script of every user).

// A change is either a plain string (legacy — falls back to the release date) or an object carrying its own
// date (so entries added on different days within one unreleased block show their true date).
export type ChangelogChange = string | { date?: string; text: string }

export interface ChangelogEntry {
  version: string
  date: string
  changes: ChangelogChange[]
}

// __* globals fall back to safe defaults in a context where Vite didn't inject them (e.g. unit tests).
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
export const BUILD_COMMIT: string = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev'
export const BUILD_DATE: string = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : ''
