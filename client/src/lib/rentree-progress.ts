// Live PROGRESS signals — the fixed catalog of module-state indicators a rentrée task can reflect. When a
// template/task has a progressKey, its row shows the real state of the work (a count or a boolean, computed
// server-side) instead of a manual checkbox, and auto-satisfies when complete. Kept in sync with the backend
// catalog in GNDJ.Application.Rentree.RentreeProgress.
export interface RentreeProgressDef {
  label: string
  perUnit: boolean // per-unit signals read the task's unit (pair with "une tâche par unité")
}

export const RENTREE_PROGRESS: Record<string, RentreeProgressDef> = {
  'demandes-open': { label: 'Inscriptions ouvertes', perUnit: false },
  'passage-open': { label: 'Passage ouvert', perUnit: false },
  'passage-proposed': { label: 'Passages proposés — par unité', perUnit: true },
  'passage-finalized': { label: 'Passages finalisés', perUnit: false },
  'demandes-reviewed': { label: 'Demandes révisées', perUnit: false },
  'demandes-sent': { label: 'Réponses envoyées', perUnit: false },
  'documents-verified': { label: 'Documents vérifiés — par unité', perUnit: true },
  'photos-done': { label: 'Photos prises — par unité', perUnit: true },
  'cotisations-paid': { label: 'Cotisations réglées — par unité', perUnit: true },
}

// Options for the template-editor dropdown ("Aucun (tâche manuelle)" first).
export const RENTREE_PROGRESS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Aucun (tâche manuelle)' },
  ...Object.entries(RENTREE_PROGRESS).map(([value, def]) => ({ value, label: def.label })),
]

export const getRentreeProgress = (key: string | null | undefined): RentreeProgressDef | undefined =>
  key ? RENTREE_PROGRESS[key] : undefined
