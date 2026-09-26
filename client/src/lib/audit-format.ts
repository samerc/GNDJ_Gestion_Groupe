// Shared rendering for the audit trail — French labels for every action/entity/field, the User-Agent parser, the
// value formatter, the row summary, and the before→after DiffViewer. Used by BOTH the admin audit-log page and the
// per-member "Journal" tab so the two stay identical.
import type { AuditLogDto } from '@/services/audit-service'

// Colour buckets reused across the many domain actions below.
const GREEN = 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300'
const BLUE = 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
const RED = 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300'
const PURPLE = 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300'
const ORANGE = 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300'
const GRAY = 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'

// French label + colour for every audit action string emitted by the backend handlers. Anything not
// listed falls back to the raw action string with no colour (so a new action is still shown, just untranslated).
export const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  // Generic CRUD
  Create: { label: 'Création', color: GREEN },
  Update: { label: 'Modification', color: BLUE },
  Delete: { label: 'Suppression', color: RED },
  // Auth / sessions
  Login: { label: 'Connexion', color: PURPLE },
  LoginFailed: { label: 'Échec connexion', color: ORANGE },
  LoginBlocked: { label: 'Connexion bloquée', color: ORANGE },
  Logout: { label: 'Déconnexion', color: GRAY },
  ChangePassword: { label: 'Changement de mot de passe', color: PURPLE },
  PasswordReset: { label: 'Réinitialisation du mot de passe', color: PURPLE },
  ResetPassword: { label: 'Réinitialisation du mot de passe', color: PURPLE },
  ResetApplicantPassword: { label: 'Réinit. mot de passe (parent)', color: PURPLE },
  SignOutOtherDevices: { label: 'Déconnexion des autres appareils', color: PURPLE },
  DisconnectSession: { label: 'Session déconnectée', color: PURPLE },
  Impersonate: { label: 'Voir comme', color: PURPLE },
  GrantSuperAdmin: { label: 'Super-admin accordé', color: PURPLE },
  RevokeSuperAdmin: { label: 'Super-admin retiré', color: RED },
  VerifyContact: { label: 'Coordonnées confirmées', color: BLUE },
  ReviewContacts: { label: 'Coordonnées vérifiées', color: BLUE },
  VerifyEmailManual: { label: 'Email vérifié (manuel)', color: BLUE },
  UpdateUsername: { label: 'Identifiant modifié', color: BLUE },
  CreateLogin: { label: 'Compte créé', color: GREEN },
  CreateLogins: { label: 'Comptes créés', color: GREEN },
  // Assignments / passage
  CorrectUnit: { label: "Correction d'unité", color: BLUE },
  Transfer: { label: 'Transfert', color: BLUE },
  EndAssignment: { label: "Fin d'affectation", color: BLUE },
  BulkCreate: { label: 'Proposition en lot', color: GREEN },
  Review: { label: 'Révision', color: BLUE },
  BulkReview: { label: 'Révision en lot', color: BLUE },
  Finalize: { label: 'Finalisation', color: GREEN },
  Toggle: { label: 'Activation / désactivation', color: GRAY },
  // Demandes
  Decide: { label: 'Décision', color: BLUE },
  BulkDecide: { label: 'Décision en lot', color: BLUE },
  SetUnit: { label: 'Unité définie', color: BLUE },
  EditDemande: { label: 'Modification de la demande', color: BLUE },
  MergeDemandes: { label: 'Fusion de demandes', color: BLUE },
  SendResponses: { label: 'Envoi des réponses', color: GRAY },
  CloseCampaign: { label: 'Clôture des demandes', color: RED },
  ImportDecisions: { label: 'Import des décisions', color: BLUE },
  DeleteAccount: { label: 'Suppression du compte', color: RED },
  UpdateRejectionReasons: { label: 'Motifs de refus modifiés', color: BLUE },
  CreateInvite: { label: 'Invitation créée', color: GREEN },
  RevokeInvite: { label: 'Invitation annulée', color: RED },
  ClearScoutRelationMatch: { label: 'Lien proche retiré', color: ORANGE },
  // Members
  Restore: { label: 'Restauration', color: GREEN },
  Purge: { label: 'Suppression définitive', color: RED },
  MergeMembers: { label: 'Fusion de membres', color: BLUE },
  RejectDuplicateMembers: { label: 'Non-doublons', color: GRAY },
  SetDelegation: { label: "Délégation d'accès", color: BLUE },
  // Documents
  AcceptDocument: { label: 'Document accepté', color: GREEN },
  RejectDocument: { label: 'Document refusé', color: RED },
  ReviewDocument: { label: 'Vérification de document', color: BLUE },
  AddPages: { label: 'Ajout de pages', color: BLUE },
  DeletePage: { label: 'Suppression de page', color: RED },
  Download: { label: 'Téléchargement', color: PURPLE },
  UpdateDocumentCampaign: { label: 'Campagne documents modifiée', color: BLUE },
  SendDocumentCampaignErrors: { label: "Emails d'erreur (campagne)", color: GRAY },
  ApplyDocumentCampaignHold: { label: 'Dossiers mis en attente', color: ORANGE },
  ReactivateMember: { label: 'Membre réactivé', color: GREEN },
  // Communications / emails
  SendLeaderMessage: { label: 'Message aux chefs', color: GRAY },
  SendAccess: { label: 'Envoi des accès', color: GRAY },
  SendDocumentReminders: { label: 'Relance documents', color: GRAY },
  SendSubmissionReminders: { label: 'Relance des non-soumis', color: GRAY },
  // Roles / access / structure
  Archive: { label: 'Archivage', color: ORANGE },
  Unarchive: { label: 'Réactivation', color: GREEN },
  SetDefault: { label: 'Fonction par défaut', color: BLUE },
  Merge: { label: 'Fusion', color: BLUE },
  SetGroupAccess: { label: 'Accès maîtrise modifié', color: BLUE },
  // Rentrée
  OpenInscriptions: { label: 'Ouverture des inscriptions', color: GREEN },
  OpenPassage: { label: 'Ouverture du passage', color: GREEN },
  // Managed lists
  RenameListValue: { label: 'Valeur renommée', color: BLUE },
  ArchiveListValue: { label: 'Valeur archivée', color: ORANGE },
  DeleteListValue: { label: 'Valeur supprimée', color: RED },
  AddListValue: { label: 'Valeur ajoutée', color: GREEN },
  UnarchiveListValue: { label: 'Valeur réactivée', color: GREEN },
  // Fratries
  ApproveSiblingGroup: { label: 'Fratrie confirmée', color: GREEN },
  RejectSiblingSuggestion: { label: 'Fratrie rejetée', color: RED },
  LinkSiblings: { label: 'Fratrie liée', color: BLUE },
  UnlinkSibling: { label: 'Fratrie déliée', color: ORANGE },
  // Réunions / groupes / autres
  Approve: { label: 'Approbation', color: GREEN },
  SaveAttendance: { label: 'Présences enregistrées', color: BLUE },
  SendMessage: { label: 'Message envoyé', color: GRAY },
  Reply: { label: 'Réponse', color: GRAY },
}

export const ENTITY_LABELS: Record<string, string> = {
  User: 'Utilisateur',
  ApplicantAccount: "Compte d'inscription",
  Member: 'Membre',
  Unit: 'Unité',
  Team: 'Équipe',
  Association: 'Association',
  UnitType: "Type d'unité",
  FunctionalRole: 'Fonction',
  SecurityProfile: 'Profil de sécurité',
  MemberAssignment: 'Affectation',
  MemberDocument: 'Document',
  MemberCotisation: 'Cotisation',
  MemberProgression: 'Progression',
  MemberChangeRequest: 'Demande de modification',
  DocumentType: 'Type de document',
  Setting: 'Paramètre',
  Guardian: 'Parent',
  GuardianLink: 'Lien parent',
  Passage: 'Passage',
  Demande: "Demande d'inscription",
  SiblingGroup: 'Fratrie',
  SiblingRejection: 'Fratrie rejetée',
  MemberDuplicateRejection: 'Non-doublon',
  ApiKey: 'Clé API',
  CustomField: 'Champ personnalisé',
  Event: 'Événement',
  NewsPost: 'Actualité',
  Page: 'Page',
  Resource: 'Ressource',
  ScoutStage: 'Étape',
  Badge: 'Badge',
  SmtpServer: 'Serveur SMTP',
  EmailTemplate: "Modèle d'email",
  SiteContent: 'Contenu du site',
  UnitTypeProgression: 'Parcours scout',
  MemberGroup: 'Groupe de membres',
  Meeting: 'Réunion',
  ReportTemplate: 'Modèle de rapport',
  Trombinoscope: 'Trombinoscope',
  ContactMessage: 'Message de contact',
  AuditLog: "Journal d'audit",
}

// Human labels for the raw snapshot field names, so the detail reads in French instead of PascalCase keys.
export const FIELD_LABELS: Record<string, string> = {
  Member: 'Membre', Unit: 'Unité', Team: 'Équipe', Role: 'Fonction',
  StartDate: 'Début', EndDate: 'Fin', Name: 'Nom', Totem: 'Totem', Adjective: 'Adjectif',
  Description: 'Description', Color1: 'Couleur 1', Color2: 'Couleur 2', DisplayOrder: 'Ordre',
  IsMaitrise: 'Maîtrise', Email: 'Email', Code: 'Code', Reason: 'Motif', Title: 'Titre',
  ReceiptNumber: 'Reçu', ScoutYear: 'Année scoute', FirstName: 'Prénom', LastName: 'Nom',
  Portal: 'Portail',
  // Member profile fields (Update Member / Ma fiche diff)
  DateOfBirth: 'Date de naissance', Gender: 'Genre', CardNumber: 'Matricule',
  ExternalCardNumber: 'N° de carte', BloodType: 'Groupe sanguin', Nationality: 'Nationalité',
  School: 'École', Classe: 'Classe', Section: 'Section', ProfessionDomain: 'Domaine professionnel',
  Profession: 'Profession', MedicalNotes: 'Notes médicales', Allergies: 'Allergies', Notes: 'Notes',
  ParentsSituation: 'Situation des parents',
  // Parent (guardian) fields
  Parent: 'Parent', RelationshipType: 'Relation', IsPrimaryContact: 'Contact principal',
  IsEmergencyContact: "Contact d'urgence", IsDeceased: 'Décédé(e)', Phone: 'Téléphone',
  // Member contact fields (add/update/delete phone/email/address, primary contact email)
  Type: 'Type', Address: 'Adresse', PrimaryContactEmail: 'Courriel de contact principal',
  // Parcours / groupes / réunions / rapports / trombinoscope / messages
  From: 'De', To: 'Vers', PathType: 'Type de parcours', ScopeType: 'Portée',
  Recipients: 'Destinataires', Absences: 'Absences', Date: 'Date', Sender: 'Expéditeur',
  Subject: 'Objet', Published: 'Publié', MemberCount: 'Nombre de membres',
  Format: 'Format', ReportType: 'Type de rapport',
  // Resolved-name keys emitted by the handlers (member/unit/role names instead of GUIDs)
  ProposedUnit: 'Unité proposée', ProposedRole: 'Fonction proposée',
  FinalUnit: 'Unité finale', FinalRole: 'Fonction finale',
  NewUnit: 'Nouvelle unité', NewRole: 'Nouvelle fonction', DecidedUnit: 'Unité décidée',
  Child: 'Enfant', Children: 'Enfants', Members: 'Membres', Target: 'Membre lié',
  Keeper: 'Conservé', Merged: 'Fusionné(s)', KeptReference: 'Référence conservée',
  Father: 'Père', Mother: 'Mère',
  Status: 'Statut', Count: 'Nombre', IsLeaving: 'Quitte le groupe',
  Document: 'Document', ReviewNotes: 'Note de vérification', FileName: 'Fichier',
  FileCount: 'Nombre de fichiers',
  added: 'Pages ajoutées', pages: 'Pages',
  KeepOld: "Conserver l'ancienne fonction", IsSuperAdmin: 'Super-administrateur',
  AccountsDeleted: 'Comptes supprimés', Before: 'Avant le',
  // Send-report keys (Envoyer l'accès / Relance documents / Emails aux chefs)
  sent: 'Envoyés', noEmail: 'Sans email', noAccount: 'Sans compte', noAccess: 'Sans accès',
  skipped: 'Ignorés', compliant: 'Dossiers complets', template: 'Modèle', unit: 'Unité',
}
export const fieldLabel = (k: string) => FIELD_LABELS[k] ?? k
export const actionMeta = (action: string) => ACTION_LABELS[action] ?? { label: action, color: '' }
export const entityLabel = (t: string) => ENTITY_LABELS[t] ?? t

// A raw User-Agent lists every legacy compatibility token (Mozilla/AppleWebKit/KHTML/Gecko/Chrome/Safari…),
// which reads like "all browsers at once". Parse it to a readable "Browser N · OS" (order matters — the most
// specific browser token wins). The full UA stays available as a tooltip.
export function parseUserAgent(ua: string | null | undefined): string {
  if (!ua) return '—'
  let os = ''
  const aMatch = ua.match(/Android\s([\d.]+)/)
  if (/Windows NT/.test(ua)) os = 'Windows'
  else if (aMatch) os = `Android ${aMatch[1]}`
  else if (/Android/.test(ua)) os = 'Android'
  else if (/(iPhone|iPad|iPod|iOS)/.test(ua)) os = 'iOS'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/CrOS/.test(ua)) os = 'ChromeOS'
  else if (/Linux/.test(ua)) os = 'Linux'

  let br = 'Navigateur inconnu'
  let m: RegExpMatchArray | null
  if ((m = ua.match(/Edg(?:e|A|iOS)?\/([\d]+)/))) br = `Edge ${m[1]}`
  else if ((m = ua.match(/(?:OPR|Opera)\/([\d]+)/))) br = `Opera ${m[1]}`
  else if ((m = ua.match(/SamsungBrowser\/([\d]+)/))) br = `Samsung Internet ${m[1]}`
  else if ((m = ua.match(/(?:Firefox|FxiOS)\/([\d]+)/))) br = `Firefox ${m[1]}`
  else if ((m = ua.match(/(?:CriOS|Chrome)\/([\d]+)/))) br = `Chrome ${m[1]}`
  else if (/Safari/.test(ua) && (m = ua.match(/Version\/([\d]+)/))) br = `Safari ${m[1]}`
  return [br, os].filter(Boolean).join(' · ')
}

// Renders a stored value readably: booleans → Oui/Non, null/empty → —, arrays → comma-joined, nested objects
// → "clé: valeur" pairs (so a snapshot embedding a list/object no longer shows "[object Object]").
export function formatVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
  if (Array.isArray(v)) return v.map(formatVal).join(', ')
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>).map(([k, val]) => `${fieldLabel(k)} : ${formatVal(val)}`).join(' · ')
  }
  return String(v)
}

// Best-effort human label for a log row, sniffed from the first recognizable field in the JSON snapshot.
export function entitySummary(log: AuditLogDto): string {
  const json = log.newValues || log.oldValues
  if (!json) return ''
  try {
    const obj = JSON.parse(json)
    if (obj.Member) return formatVal(obj.Member)   // assignments / passages (readable member name)
    if (obj.Child) return formatVal(obj.Child)      // demandes (child name)
    if (obj.Keeper) return formatVal(obj.Keeper)    // merges (kept member)
    if (obj.Members) return formatVal(obj.Members)  // sibling groups (list of names)
    if (obj.Name) return formatVal(obj.Name)
    if (obj.Email) return formatVal(obj.Email)
    if (obj.Title) return formatVal(obj.Title)
    if (obj.FirstName && obj.LastName) return `${obj.FirstName} ${obj.LastName}`
    if (obj.ReceiptNumber) return formatVal(obj.ReceiptNumber)
    if (obj.Code) return formatVal(obj.Code)
    if (obj.Reason) return formatVal(obj.Reason)
  } catch { /* ignore */ }
  return ''
}

