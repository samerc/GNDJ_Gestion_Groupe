// Admin screen "Fonctions" (super-admin): flat, cross-unit-type list of ALL functional roles.
// Thin wrapper — all CRUD/logic lives in the shared FunctionalRolesList; here we just enable the
// unit-type column + the unit-type picker field (non-sortable mode). The per-unit-type, drag-to-rank
// view of the same component lives on unit-type-detail.tsx (sortable mode).
import { FunctionalRolesList } from '@/components/shared/functional-roles-list'

export default function RolesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Fonctions</h1>
      <p className="text-muted-foreground">Gestion de toutes les fonctions à travers les types d'unité.</p>
      <FunctionalRolesList showUnitTypeColumn showUnitTypeField />
    </div>
  )
}
