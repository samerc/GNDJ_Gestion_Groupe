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
