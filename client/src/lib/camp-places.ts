// Camp BP places (setting camp.places, edited in Paramètres → Camp BP) — the client mirror of
// Application/Camps/CampPlaces.cs. A place can be lieu A (main) and/or lieu B (bad-weather repli), has a size
// (1 petit, 2 moyen, 3 grand) and a capacity = how many games it hosts at the same time.
export interface CampPlace { name: string; a: boolean; b: boolean; size: number; capacity: number }

export const PLACES_SETTING = 'camp.places'
export const SIZE_LABELS: Record<number, string> = { 1: 'Petit', 2: 'Moyen', 3: 'Grand' }

export function parsePlaces(json: string | null | undefined): CampPlace[] {
  try {
    const v = JSON.parse(json || '[]')
    if (!Array.isArray(v)) return []
    return v.filter(p => p && typeof p.name === 'string' && p.name.trim())
      .map(p => ({ name: String(p.name), a: !!p.a, b: !!p.b, size: [1, 2, 3].includes(p.size) ? p.size : 2, capacity: Math.max(1, Number(p.capacity) || 1) }))
  } catch { return [] }
}
