// Static {value,label} option lists for form selects (French labels). Values are the canonical
// strings stored in the DB; keep in sync with the server's allowed-set validators. PINNED_* surface
// common choices at the top of SearchableSelect. (Schools/cities/professions live in DB settings.)
export const GENDER_OPTIONS = [
  { value: 'Masculin', label: 'Masculin' },
  { value: 'Féminin', label: 'Féminin' },
]

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

export const PINNED_NATIONALITIES = ['Libanaise', 'Française', 'Syrienne', 'Palestinienne']

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

export const PROFESSION_OPTIONS = [
  { value: 'Médecin', label: 'Médecin' },
  { value: 'Ingénieur', label: 'Ingénieur' },
  { value: 'Avocat', label: 'Avocat' },
  { value: 'Enseignant', label: 'Enseignant' },
  { value: 'Professeur', label: 'Professeur' },
  { value: 'Architecte', label: 'Architecte' },
  { value: 'Pharmacien', label: 'Pharmacien' },
  { value: 'Dentiste', label: 'Dentiste' },
  { value: 'Comptable', label: 'Comptable' },
  { value: 'Banquier', label: 'Banquier' },
  { value: 'Commerçant', label: 'Commerçant' },
  { value: 'Entrepreneur', label: 'Entrepreneur' },
  { value: 'Informaticien', label: 'Informaticien' },
  { value: 'Journaliste', label: 'Journaliste' },
  { value: 'Fonctionnaire', label: 'Fonctionnaire' },
  { value: 'Militaire', label: 'Militaire' },
  { value: 'Artisan', label: 'Artisan' },
  { value: 'Agriculteur', label: 'Agriculteur' },
  { value: 'Infirmier', label: 'Infirmier' },
  { value: 'Au foyer', label: 'Au foyer' },
  { value: 'Retraité', label: 'Retraité' },
  { value: 'Sans emploi', label: 'Sans emploi' },
  { value: 'Autre', label: 'Autre' },
]
