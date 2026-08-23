// Deadline ANCHORS — the fixed catalog of date-typed settings a rentrée task can hang its due date on.
// When a template/task has a deadlineAnchor, its real due date is resolved LIVE from that setting's value on
// the server (so the checklist tracks the year's actual calendar). Kept in sync with the backend catalog in
// GNDJ.Application.Rentree.RentreeAnchors.
export const RENTREE_ANCHORS: { value: string; label: string }[] = [
  { value: 'demande.submission_start', label: 'Ouverture des soumissions (inscriptions)' },
  { value: 'demande.submission_deadline', label: 'Date limite des soumissions (inscriptions)' },
  { value: 'demande.member_start_date', label: 'Début des nouveaux membres' },
  { value: 'passage.date', label: 'Date du passage' },
  { value: 'documents.deposit_start', label: 'Dépôt des documents — début' },
  { value: 'documents.deposit_deadline', label: 'Dépôt des documents — date limite' },
  { value: 'documents.correction_start', label: 'Correction des documents — début' },
  { value: 'documents.correction_deadline', label: 'Correction des documents — date limite' },
  { value: 'documents.final_deadline', label: 'Documents — échéance finale' },
]

// Options for the template-editor dropdown ("Aucune (date manuelle)" first).
export const RENTREE_ANCHOR_OPTIONS = [{ value: '', label: 'Aucune (date manuelle)' }, ...RENTREE_ANCHORS]

export const anchorLabel = (key: string | null | undefined) =>
  key ? RENTREE_ANCHORS.find((a) => a.value === key)?.label ?? key : undefined
