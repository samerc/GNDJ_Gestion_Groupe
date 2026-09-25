// CU "Mon unité" preferences — the schema the frontend owns (the server stores it opaquely on the user's account,
// User.UnitDashboardPrefsJson, so it follows the CU on every device). Saved prefs are MERGED against these
// defaults on load, so a button or row field added later appears automatically, and unknown ids are dropped.
// The defaults reproduce the roster exactly as it was before customization.

// Action-bar buttons, in their default order.
export const UNIT_BUTTONS = [
  { id: 'birthdays', label: 'Anniversaires' },
  { id: 'roster', label: 'Liste (PDF)' },
  { id: 'trombi', label: 'Trombinoscope' },
  { id: 'export', label: 'Exporter' },
  { id: 'cards', label: 'Cartes' },
  { id: 'photos', label: 'Photos' },
  { id: 'teams', label: 'Équipes' },
] as const
export type UnitButtonId = (typeof UNIT_BUTTONS)[number]['id']

// What each member row of the roster can show (the name is always shown).
export const ROW_FIELDS = [
  { id: 'photo', label: 'Photo', default: true },
  { id: 'fonction', label: 'Fonction', default: true },
  { id: 'team', label: 'Équipe', default: false },
  { id: 'matricule', label: 'Matricule', default: false },
  { id: 'age', label: 'Âge', default: false },
  { id: 'absences', label: 'Absences aux réunions', default: true },
  { id: 'dossier', label: 'État du dossier (documents + cotisation)', default: false },
] as const
export type RowFieldId = (typeof ROW_FIELDS)[number]['id']

export type RosterGrouping = 'team' | 'alpha'

export interface UnitDashboardPrefs {
  buttons: { id: UnitButtonId; visible: boolean }[] // display order
  row: Record<RowFieldId, boolean>
  grouping: RosterGrouping
}

export function defaultUnitPrefs(): UnitDashboardPrefs {
  return {
    buttons: UNIT_BUTTONS.map(b => ({ id: b.id, visible: true })),
    row: Object.fromEntries(ROW_FIELDS.map(f => [f.id, f.default])) as Record<RowFieldId, boolean>,
    grouping: 'team',
  }
}

// Saved JSON (or null) → a complete prefs object: keeps the saved button order/visibility, drops unknown ids,
// appends any new button at the end, and fills missing row fields with their default. Never throws.
export function mergeUnitPrefs(json: string | null | undefined): UnitDashboardPrefs {
  const def = defaultUnitPrefs()
  if (!json) return def
  let saved: Partial<UnitDashboardPrefs>
  try { saved = JSON.parse(json) } catch { return def }
  if (!saved || typeof saved !== 'object') return def

  const known = new Set<string>(UNIT_BUTTONS.map(b => b.id))
  const buttons: UnitDashboardPrefs['buttons'] = []
  for (const b of Array.isArray(saved.buttons) ? saved.buttons : []) {
    if (b && known.has(b.id) && !buttons.some(x => x.id === b.id)) buttons.push({ id: b.id, visible: b.visible !== false })
  }
  for (const b of def.buttons) if (!buttons.some(x => x.id === b.id)) buttons.push(b)

  const row = { ...def.row }
  if (saved.row && typeof saved.row === 'object')
    for (const f of ROW_FIELDS) if (typeof saved.row[f.id] === 'boolean') row[f.id] = saved.row[f.id]

  return { buttons, row, grouping: saved.grouping === 'alpha' ? 'alpha' : 'team' }
}

// Prefs → JSON to save, or null when equal to the defaults (so a future default change is picked up).
export function serializeUnitPrefs(p: UnitDashboardPrefs): string | null {
  const json = JSON.stringify(p)
  return json === JSON.stringify(defaultUnitPrefs()) ? null : json
}
