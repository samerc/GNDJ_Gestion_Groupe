// "Accès & permissions" hub — the single place to manage everything permission-related, with three tabs that
// all speak the same vocabulary (domaines, and the effective-access viewer's fonction/délégué/super-admin model):
//   • Profils   — the reusable named permission sets (roles.view / roles.manage). Gated on maitrise.manage
//                 (NOT roles.view): a Chef d'Unité holds roles.view for the Fonction picker but must not see the
//                 authorization model / who holds each profile.
//   • Fonctions — per group-maîtrise function, the access level per domaine (roles.manage_group).
//   • Membres   — per-person "accès délégués": extra access for one member without a visible role (roles.manage_group).
// Each tab shows only if the user holds its permission (super-admin / Chef de Groupe see all three). The child
// pages render in `embedded` mode (their own headers suppressed) so this page owns the single title + tab bar.
import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import SecurityProfilesPage from './security-profiles'
import GroupAccessPage from './group-access'
import { MemberDelegationsSection } from './member-delegations'
import { SuperAdminsSection } from './super-admins'
import { BackToSettings } from '@/components/shared/back-to-settings'

export default function RolesAccessPage() {
  const { hasPermission } = useAuthStore()
  const isSuperAdmin = useAuthStore((s) => s.user?.isSuperAdmin ?? false)
  const canProfiles = hasPermission(PERMISSIONS.MAITRISE_MANAGE)
  const canGroup = hasPermission(PERMISSIONS.ROLES_MANAGE_GROUP)

  const tabs = [
    canProfiles && { value: 'profiles', label: 'Profils' },
    canGroup && { value: 'fonctions', label: 'Fonctions' },
    canGroup && { value: 'membres', label: 'Membres' },
  ].filter(Boolean) as { value: string; label: string }[]
  const [tab, setTab] = useState(tabs[0]?.value ?? 'profiles')

  return (
    <div className="space-y-4">
      <BackToSettings />
      <div>
        <h1 className="text-2xl font-bold">Accès &amp; permissions</h1>
        <p className="text-sm text-muted-foreground">
          Profils de permissions, accès par fonction et accès délégués à une personne — au même endroit.
        </p>
      </div>

      {/* Super-admin management (super-admin only) — the flag is not a role/profile, so it lives above the tabs. */}
      {isSuperAdmin && <SuperAdminsSection />}

      {tabs.length > 1 ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {tabs.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
          </TabsList>
          {canProfiles && <TabsContent value="profiles" className="mt-4"><SecurityProfilesPage embedded /></TabsContent>}
          {canGroup && <TabsContent value="fonctions" className="mt-4"><GroupAccessPage embedded /></TabsContent>}
          {canGroup && <TabsContent value="membres" className="mt-4"><MemberDelegationsSection /></TabsContent>}
        </Tabs>
      ) : (
        // A single available tab → render it directly (no tab bar). Only "Profils" can be the lone tab (a
        // roles.manage_group holder always also holds maitrise.manage, so they see all three).
        <SecurityProfilesPage embedded />
      )}
    </div>
  )
}
