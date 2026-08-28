// The historic GNDJ "foulards" (neckerchiefs) — the authentic sub-group identity, taken from the old group
// site (C:\...\old\images\foulards). Each historic Beyrouth group and the Jamhour group wears a distinct
// two-colour scarf; a unit inherits its sub-group's colours regardless of branch (a Meute 2ème Beyrouth and
// a Troupe 2ème Beyrouth share the same colours). Colours read pixel-for-pixel from the original GIFs.
// Rendered on unit cards as a diagonal two-tone header band (the scarf's two colours split on the diagonal).
export type FoulardVariant = 'f2' | 'f3' | 'f10' | 'clan' | 'fg'

// Each foulard's colours (1..N), rendered as vertical stripes on the emblem. Solid scarves list one colour.
const FOULARDS: Record<FoulardVariant, { colors: string[]; label: string }> = {
  f2: { colors: ['#0000FF'], label: '2ème Beyrouth' }, // solid blue
  f3: { colors: ['#0000FF', '#FFFFFF'], label: '3ème Beyrouth' }, // blue + white
  f10: { colors: ['#0000FF', '#FF8040'], label: '10ème Beyrouth' }, // blue + orange
  clan: { colors: ['#0000FF', '#FF8040', '#FFFFFF'], label: 'Clan' }, // blue + orange + white (group-wide)
  fg: { colors: ['#000080', '#0080FF'], label: 'Jamhour' }, // navy + light blue
}

// Resolve a unit name to its foulard. The group-wide Clan has its own tricolour scarf; Beyrouth units are the
// numbered historic groups (2/3/10); everything else (Jamhour: Rondes, Compagnies, Noyau, JEM…) wears "fg".
export function foulardFor(name: string): FoulardVariant {
  const n = name.toLowerCase()
  if (n.includes('clan')) return 'clan'
  if (n.includes('beyrouth')) {
    if (n.includes('10')) return 'f10'
    if (n.includes('3')) return 'f3'
    if (n.includes('2')) return 'f2'
  }
  return 'fg'
}

// The foulard colours (1..N) + label for a unit.
export function foulardColors(name: string): { colors: string[]; label: string } {
  const { colors, label } = FOULARDS[foulardFor(name)]
  return { colors, label }
}
