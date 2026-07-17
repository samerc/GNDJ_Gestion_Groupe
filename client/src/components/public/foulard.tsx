// The historic GNDJ "foulards" (neckerchiefs) — the authentic sub-group identity, taken from the old group
// site (C:\...\old\images\foulards). Each historic Beyrouth group and the Jamhour group wears a distinct
// two-colour scarf; a unit inherits its sub-group's colours regardless of branch (a Meute 2ème Beyrouth and
// a Troupe 2ème Beyrouth share the same colours). Colours read pixel-for-pixel from the original GIFs.
// Rendered on unit cards as a diagonal two-tone header band (the scarf's two colours split on the diagonal).
export type FoulardVariant = 'f2' | 'f3' | 'f10' | 'fg'

// [colourA, colourB] = the two scarf colours. f2 is a solid scarf, so both are the same blue.
const FOULARDS: Record<FoulardVariant, { colors: [string, string]; label: string }> = {
  f2: { colors: ['#0000FF', '#0000FF'], label: '2ème Beyrouth' }, // solid blue
  f3: { colors: ['#0000FF', '#FFFFFF'], label: '3ème Beyrouth' }, // blue + white
  f10: { colors: ['#0000FF', '#FF8040'], label: '10ème Beyrouth' }, // blue + orange
  fg: { colors: ['#000080', '#0080FF'], label: 'Jamhour' }, // navy + light blue
}

// Resolve a unit name to its foulard. Beyrouth units are the numbered historic groups (2/3/10); everything
// else (Jamhour: Rondes, Compagnies, Clan, Noyau, JEM…) wears the group foulard "fg".
export function foulardFor(name: string): FoulardVariant {
  const n = name.toLowerCase()
  if (n.includes('beyrouth')) {
    if (n.includes('10')) return 'f10'
    if (n.includes('3')) return 'f3'
    if (n.includes('2')) return 'f2'
  }
  return 'fg'
}

// The two foulard colours + label for a unit, ready for a diagonal split.
export function foulardColors(name: string): { a: string; b: string; label: string } {
  const { colors, label } = FOULARDS[foulardFor(name)]
  return { a: colors[0], b: colors[1], label }
}
