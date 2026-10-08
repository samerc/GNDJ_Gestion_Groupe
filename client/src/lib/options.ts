import { normalizeSearch } from '@/lib/utils'

// Static {value,label} option lists for form selects (French labels). Values are the canonical
// strings stored in the DB; keep in sync with the server's allowed-set validators. PINNED_* surface
// common choices at the top of SearchableSelect. (Schools/cities/professions live in DB settings.)

// Returns the option list with the current stored value appended as a selectable option when it isn't already
// present (exact match). A Radix <Select> renders EMPTY for a value outside its options — and migrated/legacy
// data holds many contact types/countries outside the fixed lists (e.g. phone type "Mobile Mère", address type
// "Domicile principal", country "UNITED STATES"). Injecting the value makes it display AND round-trip on save
// (a save-without-touching would otherwise look blanked), without destroying the original label.
export function optionsWithCurrent(options: { value: string; label: string }[], value?: string | null) {
  if (!value || options.some(o => o.value === value)) return options
  return [...options, { value, label: value }]
}

export const GENDER_OPTIONS = [
  { value: 'Masculin', label: 'Masculin' },
  { value: 'Féminin', label: 'Féminin' },
]

// Parents' relationship status (household attribute). Same set the demande wizard uses; shown on the fiche.
export const PARENTS_SITUATION_OPTIONS = ['Unis', 'Séparés', 'Divorcés']

export const BLOOD_TYPE_OPTIONS = [
  { value: 'A+', label: 'A+' },
  { value: 'A-', label: 'A-' },
  { value: 'B+', label: 'B+' },
  { value: 'B-', label: 'B-' },
  { value: 'AB+', label: 'AB+' },
  { value: 'AB-', label: 'AB-' },
  { value: 'O+', label: 'O+' },
  { value: 'O-', label: 'O-' },
]

export const NATIONALITY_OPTIONS = [
  { value: 'Libanaise', label: 'Libanaise' },
  { value: 'Française', label: 'Française' },
  { value: 'Syrienne', label: 'Syrienne' },
  { value: 'Palestinienne', label: 'Palestinienne' },
  { value: 'Égyptienne', label: 'Égyptienne' },
  { value: 'Jordanienne', label: 'Jordanienne' },
  { value: 'Irakienne', label: 'Irakienne' },
  { value: 'Saoudienne', label: 'Saoudienne' },
  { value: 'Émiratie', label: 'Émiratie' },
  { value: 'Koweïtienne', label: 'Koweïtienne' },
  { value: 'Américaine', label: 'Américaine' },
  { value: 'Canadienne', label: 'Canadienne' },
  { value: 'Britannique', label: 'Britannique' },
  { value: 'Allemande', label: 'Allemande' },
  { value: 'Belge', label: 'Belge' },
  { value: 'Suisse', label: 'Suisse' },
  { value: 'Italienne', label: 'Italienne' },
  { value: 'Espagnole', label: 'Espagnole' },
  { value: 'Turque', label: 'Turque' },
  { value: 'Brésilienne', label: 'Brésilienne' },
  { value: 'Australienne', label: 'Australienne' },
  { value: 'Arménienne', label: 'Arménienne' },
  { value: 'Autre', label: 'Autre' },
]

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'Cash', label: 'Espèces' },
  { value: 'Virement', label: 'Virement bancaire' },
  { value: 'Autre', label: 'Autre' },
]

export const PHONE_TYPE_OPTIONS = [
  { value: 'Mobile', label: 'Mobile' },
  { value: 'Domicile', label: 'Domicile' },
  { value: 'Travail', label: 'Travail' },
  { value: 'Autre', label: 'Autre' },
]

export const PHONE_COUNTRY_CODES = [
  { value: '+961', label: '+961 (Liban)' },
  { value: '+1', label: '+1 (USA/Canada)' },
  { value: '+33', label: '+33 (France)' },
  { value: '+44', label: '+44 (UK)' },
  { value: '+971', label: '+971 (EAU)' },
  { value: '+966', label: '+966 (Arabie S.)' },
  { value: '+49', label: '+49 (Allemagne)' },
  { value: '+32', label: '+32 (Belgique)' },
  { value: '+41', label: '+41 (Suisse)' },
  { value: '+61', label: '+61 (Australie)' },
  { value: '+55', label: '+55 (Brésil)' },
]

export const EMAIL_TYPE_OPTIONS = [
  { value: 'Personnel', label: 'Personnel' },
  { value: 'Travail', label: 'Travail' },
  { value: 'École', label: 'École' },
  { value: 'Autre', label: 'Autre' },
]

export const ADDRESS_TYPE_OPTIONS = [
  { value: 'Domicile', label: 'Domicile' },
  { value: 'Travail', label: 'Travail' },
  { value: 'Autre', label: 'Autre' },
]

export const COUNTRY_OPTIONS = [
  { value: 'Liban', label: 'Liban' },
  { value: 'France', label: 'France' },
  { value: 'Canada', label: 'Canada' },
  { value: 'États-Unis', label: 'États-Unis' },
  { value: 'Syrie', label: 'Syrie' },
  { value: 'Égypte', label: 'Égypte' },
  { value: 'Jordanie', label: 'Jordanie' },
  { value: 'EAU', label: 'Émirats Arabes Unis' },
  { value: 'Arabie Saoudite', label: 'Arabie Saoudite' },
  { value: 'Koweït', label: 'Koweït' },
  { value: 'Royaume-Uni', label: 'Royaume-Uni' },
  { value: 'Allemagne', label: 'Allemagne' },
  { value: 'Belgique', label: 'Belgique' },
  { value: 'Suisse', label: 'Suisse' },
  { value: 'Brésil', label: 'Brésil' },
  { value: 'Australie', label: 'Australie' },
  { value: 'Autre', label: 'Autre' },
]

// Relationship of a parent / tutor to the member (guardian links). Stored values may come from the old import without
// accents (« Pere », « Mere »), so lookups are accent/case-insensitive. Shared by the Famille cards, the household
// contacts and the contact-review popup.
export const RELATIONSHIP_OPTIONS = [
  { value: 'Père', label: 'Père' },
  { value: 'Mère', label: 'Mère' },
  { value: 'Tuteur', label: 'Tuteur' },
  { value: 'TuteurLégal', label: 'Tuteur légal' },
  { value: 'Autre', label: 'Autre' },
]
const relOption = (v: string) => RELATIONSHIP_OPTIONS.find((r) => normalizeSearch(r.value) === normalizeSearch(v))

// Display label for a stored relationship (« Pere » → « Père »); unknown values are shown as stored.
export function relationshipLabel(value: string): string {
  return relOption(value)?.label ?? value
}

// The canonical option value for a stored relationship, so an imported « Mere » pre-selects « Mère » in a Select
// (Radix matches by exact value); unknown values are kept as stored.
export function canonicalRelationship(value: string): string {
  return relOption(value)?.value ?? value
}

