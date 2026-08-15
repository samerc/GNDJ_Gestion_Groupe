// Catalog of built-in actions attachable to a rentrée task. Kept in sync with the backend
// GNDJ.Application.Rentree.RentreeActions. Two kinds:
//   - kind 'do'   → runs a real operation from the checklist (POST /rentree/tasks/{id}/run-action) + marks it done.
//   - kind 'goto' → a one-click navigation shortcut to the relevant page (route), no server work.
// A task with no actionKey (null) is a plain manual task (just the completion checkbox).
export interface RentreeActionDef {
  label: string          // shown on the checklist button / in the editor dropdown
  kind: 'do' | 'goto'
  route?: string         // for 'goto' actions
}

export const RENTREE_ACTIONS: Record<string, RentreeActionDef> = {
  // Do-it-here actions (executed server-side)
  'open-demandes': { label: 'Ouvrir les inscriptions', kind: 'do' },
  'open-passage': { label: 'Ouvrir le passage', kind: 'do' },
  // Navigation shortcuts
  'goto-settings': { label: 'Paramètres', kind: 'goto', route: '/admin/settings' },
  'goto-units': { label: 'Unités & équipes', kind: 'goto', route: '/units' },
  'goto-maitrises': { label: 'Maîtrises', kind: 'goto', route: '/maitrises' },
  'goto-demandes': { label: 'Revue des demandes', kind: 'goto', route: '/admin/demandes' },
  'goto-passage': { label: 'Proposer les passages', kind: 'goto', route: '/passage' },
  'goto-passage-review': { label: 'Validation des passages', kind: 'goto', route: '/admin/passage-validation' },
  'goto-documents': { label: 'Documents & cotisations', kind: 'goto', route: '/unit-documents' },
  'goto-photo': { label: 'Séance photo', kind: 'goto', route: '/photo-session' },
  'goto-my-unit': { label: 'Mon unité', kind: 'goto', route: '/dashboard' },
  'goto-progression': { label: 'Étapes & badges', kind: 'goto', route: '/admin/progression' },
  'goto-communications': { label: 'Envoyer un message aux chefs', kind: 'goto', route: '/admin/communications' },
  'goto-document-reminders': { label: 'Relancer les documents manquants', kind: 'goto', route: '/admin/document-reminders' },
}

// Options for the template-editor dropdown ("Aucune action" first).
export const RENTREE_ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Aucune action' },
  ...Object.entries(RENTREE_ACTIONS).map(([value, def]) => ({
    value,
    label: def.kind === 'do' ? `${def.label} (faire)` : `${def.label} (aller à)`,
  })),
]

export function getRentreeAction(key: string | null | undefined): RentreeActionDef | undefined {
  return key ? RENTREE_ACTIONS[key] : undefined
}
