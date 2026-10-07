// « ? » on each page: which guide section explains the page the user is on. Keyed by route (exact path, or a prefix
// ending with "/*"); each entry lists candidate sections in order and the « ? » button picks the FIRST one the user
// can read (same audiences as the server: member → any member, cu → chef d'unité, cg → Chef de Groupe team,
// admin → super-admin). `section` is the heading text in the guide (its anchor is computed with headingId).
// Keep in sync with the guides in docs/help when a heading is renamed.
export type HelpAudience = 'member' | 'cu' | 'cg' | 'admin'
export interface PageHelp { guide: string; section: string; audience: HelpAudience }

const M = (section: string): PageHelp => ({ guide: 'guide-membre', section, audience: 'member' })
const CU = (section: string): PageHelp => ({ guide: 'guide-chef-unite', section, audience: 'cu' })
const CG = (section: string): PageHelp => ({ guide: 'guide-chef-groupe', section, audience: 'cg' })
const AD = (section: string): PageHelp => ({ guide: 'guide-administration', section, audience: 'admin' })

const PAGE_HELP: Record<string, PageHelp[]> = {
  // Members
  '/my-profile': [M('Ma fiche')],
  '/my-documents': [M('Mes documents')],
  '/my-trombinoscope': [M('Trombinoscope')],
  '/ma-famille': [M('Frères et sœurs')],
  '/calendrier': [CG('Le calendrier'), CU("Le calendrier de l'unité"), M('Le calendrier')],
  // Chefs d'unité (and the Chef de Groupe on the shared pages)
  '/dashboard': [CG("L'Accueil"), CU('Mon unité')],
  '/members/*': [CG('Les membres'), CU("La fiche d'un membre")],
  '/members': [CG('Les membres'), CU("La fiche d'un membre")],
  '/unit-documents': [CU('Vérifier un document')],
  '/passage': [CU('Le passage annuel')],
  '/organiser': [CU('Organiser mon unité')],
  '/change-requests': [CU('Modifications à valider')],
  '/attendance': [CU('Réunions et absences')],
  '/photo-session': [CU('Session photo')],
  '/rentree': [CG('La liste de rentrée'), CU('Votre liste de rentrée')],
  '/camp': [CU('Le Camp BP')],
  // Chef de Groupe
  '/admin/demandes': [CG('Étudier les demandes')],
  '/admin/demande-stats': [CG('Les autres outils des inscriptions')],
  '/admin/demande-accounts': [CG('Les autres outils des inscriptions')],
  '/admin/demande-archives': [CG('Les autres outils des inscriptions')],
  '/admin/demande-duplicates': [CG('Les autres outils des inscriptions')],
  '/admin/communications-acces': [CG('Emails aux chefs et aux membres')],
  '/admin/member-groups': [CG('Emails aux chefs et aux membres')],
  '/admin/passage-validation': [CG('Le passage annuel')],
  '/admin/documents-suivi': [CG('La campagne de documents')],
  '/admin/cotisations': [CG('Les cotisations')],
  '/admin/siblings': [CG('Fratries et doublons')],
  '/admin/data-quality': [CG('Qualité des données')],
  '/maitrises': [CG("Préparer la maîtrise de l'an prochain")],
  '/admin/roles-access': [CG('Accès et délégations')],
  '/admin/camps/*': [CG('Le Camp BP')],
  '/admin/camps': [CG('Le Camp BP')],
  '/admin/contact-messages': [CG('Notifications et messages')],
  '/admin/send-notification': [CG('Notifications et messages')],
  '/admin/settings': [CG('Les paramètres')],
  // Super-admin
  '/admin/system': [AD('Surveiller : la page Système')],
  '/admin/email-outbox': [AD('Les emails')],
  '/admin/error-log': [AD('Les journaux')],
  '/admin/audit-logs': [AD('Les journaux')],
  '/admin/sessions': [AD('Sécurité et accès')],
}

export function helpForPath(pathname: string): PageHelp[] {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (PAGE_HELP[path]) return PAGE_HELP[path]
  // Prefix entries ("/members/*" matches /members/123).
  const prefix = Object.keys(PAGE_HELP).find((k) => k.endsWith('/*') && path.startsWith(k.slice(0, -1)))
  return prefix ? PAGE_HELP[prefix] : []
}
