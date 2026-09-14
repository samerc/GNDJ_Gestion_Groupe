// Per-user customization of the group "Accueil" dashboard: which widgets show, in what order, at what width.
// The layout is a JSON array of WidgetConfig, saved on the user's account (GET/PUT /my-profile/dashboard-layout).
// This module owns the widget SCHEMA (ids, defaults, merge); the actual widget rendering lives in dashboard.tsx.

export type WidgetId =
  | 'actions' | 'campaign' | 'effectif' | 'rentree' | 'cotisations'
  | 'birthdays' | 'keyNumbers' | 'unitChart' | 'ageChart'

export type WidgetWidth = 'full' | 'half' | 'third'

export interface WidgetConfig { id: WidgetId; visible: boolean; width: WidgetWidth }

// Display label + whether the widget depends on the year selector (year-scoped widgets need the stats query).
export const WIDGET_META: Record<WidgetId, { label: string; yearScoped?: boolean }> = {
  actions:     { label: 'À traiter' },
  campaign:    { label: "Campagne d'inscription" },
  effectif:    { label: 'Effectif' },
  rentree:     { label: 'Rentrée scoute' },
  cotisations: { label: 'Cotisations' },
  birthdays:   { label: 'Anniversaires' },
  keyNumbers:  { label: 'Chiffres clés', yearScoped: true },
  unitChart:   { label: 'Membres par unité', yearScoped: true },
  ageChart:    { label: 'Répartition par âge', yearScoped: true },
}

// The default layout — arranged so cards pair by SIMILAR HEIGHT into a 6-column grid (short with short, tall
// alone at full width), which avoids the "one tall card strands a short neighbour" whitespace out of the box:
//   actions (full) · keyNumbers (full) · [effectif|rentrée|cotisations = 3 shorts] ·
//   [campagne | répartition âge = 2 mediums] · membres/unité (full, tall) · anniversaires (full).
export const DEFAULT_LAYOUT: WidgetConfig[] = [
  { id: 'actions',     visible: true, width: 'full' },
  { id: 'keyNumbers',  visible: true, width: 'full' },
  { id: 'effectif',    visible: true, width: 'third' },
  { id: 'rentree',     visible: true, width: 'third' },
  { id: 'cotisations', visible: true, width: 'third' },
  { id: 'campaign',    visible: true, width: 'half' },
  { id: 'ageChart',    visible: true, width: 'half' },
  { id: 'unitChart',   visible: true, width: 'full' },
  { id: 'birthdays',   visible: true, width: 'full' },
]

const ALL_IDS = DEFAULT_LAYOUT.map(w => w.id)
const WIDTHS: WidgetWidth[] = ['full', 'half', 'third']

// Width → grid column span on the 6-col desktop grid. On mobile the grid is 1 column, so everything is full width.
export const WIDTH_COLSPAN: Record<WidgetWidth, string> = {
  full: 'md:col-span-6',
  half: 'md:col-span-3',
  third: 'md:col-span-2',
}

// Parse a saved layout string and MERGE it against the default registry: keep the saved order / visibility /
// width, drop unknown ids, and append any known widget the saved layout is missing (forward-compatible when a
// new widget is added later). Invalid / absent input → a fresh copy of the default.
export function mergeLayout(saved: string | null | undefined): WidgetConfig[] {
  const fallback = () => DEFAULT_LAYOUT.map(w => ({ ...w }))
  if (!saved) return fallback()
  let parsed: unknown
  try { parsed = JSON.parse(saved) } catch { return fallback() }
  if (!Array.isArray(parsed)) return fallback()

  const seen = new Set<WidgetId>()
  const out: WidgetConfig[] = []
  for (const raw of parsed) {
    const id = (raw as { id?: string })?.id as WidgetId
    if (!ALL_IDS.includes(id) || seen.has(id)) continue
    seen.add(id)
    const width = (raw as { width?: WidgetWidth })?.width
    out.push({
      id,
      visible: (raw as { visible?: boolean })?.visible !== false,
      width: WIDTHS.includes(width as WidgetWidth) ? (width as WidgetWidth) : 'full',
    })
  }
  // Append any widget the saved layout didn't mention (e.g. added in a later release), so it's discoverable.
  for (const w of DEFAULT_LAYOUT) if (!seen.has(w.id)) out.push({ ...w })
  return out
}

// Serialize for saving. Returns null when the layout equals the default (store null so a future default change
// is picked up, and so "réinitialiser" clears the row).
export function serializeLayout(layout: WidgetConfig[]): string | null {
  const isDefault =
    layout.length === DEFAULT_LAYOUT.length &&
    layout.every((w, i) => w.id === DEFAULT_LAYOUT[i].id && w.visible === DEFAULT_LAYOUT[i].visible && w.width === DEFAULT_LAYOUT[i].width)
  return isDefault ? null : JSON.stringify(layout.map(w => ({ id: w.id, visible: w.visible, width: w.width })))
}
