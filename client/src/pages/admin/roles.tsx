// Admin screen "Fonctions" (super-admin): flat, cross-unit-type list of ALL functional roles.
// Thin wrapper — all CRUD/logic lives in the shared FunctionalRolesList; here we just enable the
// unit-type column + the unit-type picker field (non-sortable mode). The per-unit-type, drag-to-rank
// view of the same component lives on unit-type-detail.tsx (sortable mode).
import { FunctionalRolesList } from '@/components/shared/functional-roles-list'
import { PageHeader } from '@/components/shared/page-header'
import { Page } from '@/components/shared/page'
import { Briefcase } from 'lucide-react'

export default function RolesPage() {
  return (
    <Page>
      <PageHeader
        title="Fonctions"
        icon={Briefcase}
        description="Gestion de toutes les fonctions à travers les types d'unité."
      />
      <FunctionalRolesList showUnitTypeColumn showUnitTypeField />
    </Page>
  )
}
