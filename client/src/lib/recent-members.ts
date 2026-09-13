// Per-device (localStorage) recently-viewed + favorite members, for quick jump-back in the command palette
// and a star toggle on the member fiche. Purely a client convenience — no backend, no cross-device sync.
export interface RecentMember { id: string; name: string; unit?: string | null }

const RECENT_KEY = 'members.recent'
const FAV_KEY = 'members.favorites'
const MAX_RECENT = 8

function read(key: string): RecentMember[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string') : []
  } catch { return [] }
}
function write(key: string, arr: RecentMember[]) {
  try { localStorage.setItem(key, JSON.stringify(arr)) } catch { /* ignore quota/private-mode */ }
}

export function getRecentMembers(): RecentMember[] { return read(RECENT_KEY) }

// Record a member as just-viewed (most-recent first, deduped, capped).
export function pushRecentMember(m: RecentMember) {
  if (!m.id) return
  const next = [{ id: m.id, name: m.name, unit: m.unit ?? null }, ...read(RECENT_KEY).filter((x) => x.id !== m.id)]
  write(RECENT_KEY, next.slice(0, MAX_RECENT))
}

export function getFavoriteMembers(): RecentMember[] { return read(FAV_KEY) }
export function isFavoriteMember(id: string): boolean { return read(FAV_KEY).some((x) => x.id === id) }

// Toggle a member's favorite status; returns the new state (true = now a favorite).
export function toggleFavoriteMember(m: RecentMember): boolean {
  const cur = read(FAV_KEY)
  const idx = cur.findIndex((x) => x.id === m.id)
  if (idx >= 0) { cur.splice(idx, 1); write(FAV_KEY, cur); return false }
  write(FAV_KEY, [{ id: m.id, name: m.name, unit: m.unit ?? null }, ...cur])
  return true
}
