// Catalog of the email templates the app knows about: which CATEGORY each belongs to, whether the app sends it
// on its own (auto) or someone picks it by hand, and WHEN it goes out. Drives the grouped list on
// Paramètres → Modèles d'email so the CG/admin can see at a glance what each template is for.
// Keep in sync with the codes used in the backend (EmailJob("<code>", …)). A template created by hand in the
// admin (unknown code) falls in "Autres".

export type EmailCategory = 'compte' | 'inscriptions' | 'documents' | 'chefs' | 'membres' | 'site' | 'systeme' | 'autres'

export const EMAIL_CATEGORIES: { key: EmailCategory; label: string; description: string }[] = [
  { key: 'compte', label: 'Connexion & compte', description: 'Identifiant, mot de passe, code de connexion' },
  { key: 'inscriptions', label: 'Inscriptions (demandes)', description: 'Le portail des familles et les réponses aux demandes' },
  { key: 'documents', label: 'Documents', description: 'Campagne de vérification des documents' },
  { key: 'chefs', label: 'Chefs & maîtrise', description: 'Messages aux chefs et rappels de la rentrée' },
  { key: 'membres', label: 'Messages aux membres', description: 'Envoyés depuis « Groupes → Envoyer un message »' },
  { key: 'site', label: 'Site public', description: 'Formulaire de contact' },
  { key: 'systeme', label: 'Système (administrateur)', description: 'Alertes et archives techniques' },
  { key: 'autres', label: 'Autres', description: 'Modèles créés à la main' },
]

export interface EmailTemplateInfo {
  category: EmailCategory
  // true = sent by the app itself when something happens; false = someone chooses it and clicks "Envoyer".
  auto: boolean
  // When / how it goes out, in plain words.
  when: string
}

export const EMAIL_TEMPLATE_CATALOG: Record<string, EmailTemplateInfo> = {
  // Connexion & compte
  login_code: { category: 'compte', auto: true, when: 'Un membre se connecte avec un code reçu par email' },
  password_reset: { category: 'compte', auto: true, when: 'Un membre clique sur « Mot de passe oublié ? »' },
  member_password_reset: { category: 'compte', auto: true, when: 'Un chef réinitialise le mot de passe d\'un membre' },
  account_activation: { category: 'compte', auto: true, when: '« Identifiant oublié ? », compte créé à la main, ou fiche du membre → Actions → Envoyer l\'accès' },
  // Inscriptions
  demande_email_verification: { category: 'inscriptions', auto: true, when: 'Une famille crée son compte sur le portail' },
  demande_password_reset: { category: 'inscriptions', auto: true, when: 'Une famille réinitialise son mot de passe du portail' },
  household_lookup_code: { category: 'inscriptions', auto: true, when: 'Une famille utilise « Retrouver mes informations »' },
  demande_submitted: { category: 'inscriptions', auto: true, when: 'Une famille soumet une demande' },
  demande_submission_reminder: { category: 'inscriptions', auto: false, when: 'Le CG clique sur « Relancer les non-soumis »' },
  demande_approved: { category: 'inscriptions', auto: false, when: 'Le CG clique sur « Envoyer les réponses » (demande acceptée, avec le lien pour choisir le mot de passe)' },
  demande_declined: { category: 'inscriptions', auto: false, when: 'Le CG clique sur « Envoyer les réponses » (demande refusée)' },
  demande_merged: { category: 'inscriptions', auto: false, when: 'Le CG fusionne des demandes en double (case « envoyer un email » cochée)' },
  // Documents
  document_reminder: { category: 'documents', auto: true, when: 'Campagne de documents (début de la correction), ou « Relance documents »' },
  membership_on_hold: { category: 'documents', auto: true, when: 'Campagne de documents : dossier incomplet à la date finale, adhésion mise en attente' },
  document_verification_incomplete: { category: 'documents', auto: true, when: 'Campagne de documents : la vérification n\'est pas terminée à une date clé (alerte au CG)' },
  // Chefs
  leader_welcome: { category: 'chefs', auto: true, when: 'Une seule fois, quand un membre reçoit pour la première fois une fonction de chef' },
  cu_rentree: { category: 'chefs', auto: false, when: '« Emails aux chefs » — l\'email de rentrée' },
  rentree_task_reminder: { category: 'chefs', auto: true, when: 'Chaque semaine pendant la rentrée : les tâches en retard ou proches' },
  // Membres
  reinscription_returning: { category: 'membres', auto: false, when: '« Groupes » → Envoyer un message : demander aux membres de mettre à jour leur fiche et leurs documents' },
  adhoc_message: { category: 'membres', auto: false, when: 'Message libre à un groupe, réponse à un message de contact, alerte quotidienne de l\'administrateur' },
  // Site public
  contact_form: { category: 'site', auto: true, when: 'Quelqu\'un utilise le formulaire de contact du site' },
  // Système
  error_alert: { category: 'systeme', auto: true, when: 'Une erreur se produit sur le serveur' },
  audit_year_archive: { category: 'systeme', auto: true, when: 'Changement d\'année scoute : archive du journal d\'audit' },
}

export function templateInfo(code: string): EmailTemplateInfo {
  return EMAIL_TEMPLATE_CATALOG[code] ?? { category: 'autres', auto: false, when: 'Choisi à la main (Emails aux chefs ou Groupes)' }
}
