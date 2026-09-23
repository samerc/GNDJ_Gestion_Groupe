// "Accès & permissions" hub — the single place to manage everything permission-related. Group roles are now
// ordinary profiles (the full merge: no separate "Accès maîtrise" per-function editor), so there are two tabs:
//   • Profils — the reusable permission profiles (unit AND group roles). A super-admin edits any profile (raw or
//               by domaine); a Chef de Groupe edits GROUP-level profiles by domaine (editing one applies to all
//               its holders). Gated on maitrise.manage (NOT roles.view): a Chef d'Unité holds roles.view for the
//               Fonction picker but must not see the authorization model.
//   • Membres — per-person "accès délégués": extra access for one member without a visible role (roles.manage_group).
// The child pages render in `embedded` mode (their own headers suppressed) so this page owns the title + tab bar.
import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { ShieldCheck } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import SecurityProfilesPage from './security-profiles'
import { MemberDelegationsSection } from './member-delegations'
import { SuperAdminsSection } from './super-admins'
import { BackToSettings } from '@/components/shared/back-to-settings'
import { PageHeader } from '@/components/shared/page-header'
import { Page } from '@/components/shared/page'

export default function RolesAccessPage() {
  const { hasPermission } = useAuthStore()
  const isSuperAdmin = useAuthStore((s) => s.user?.isSuperAdmin ?? false)
  const canProfiles = hasPermission(PERMISSIONS.MAITRISE_MANAGE)
  const canGroup = hasPermission(PERMISSIONS.ROLES_MANAGE_GROUP)

  const tabs = [
    canProfiles && { value: 'profiles', label: 'Profils' },
    canGroup && { value: 'membres', label: 'Membres' },
  ].filter(Boolean) as { value: string; label: string }[]
  const [tab, setTab] = useState(tabs[0]?.value ?? 'profiles')

  return (
    <Page>
      <BackToSettings />
      <PageHeader
        title="Accès & permissions"
        icon={ShieldCheck}
        description="Profils de permissions (rôles d'unité et de groupe) et accès délégués à une personne — au même endroit."
      />

      {/* Super-admin management (super-admin only) — the flag is not a role/profile, so it lives above the tabs. */}
      {isSuperAdmin && <SuperAdminsSection />}

      {tabs.length > 1 ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {tabs.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
          </TabsList>
          {canProfiles && <TabsContent value="profiles" className="mt-4"><SecurityProfilesPage embedded /></TabsContent>}
          {canGroup && <TabsContent value="membres" className="mt-4"><MemberDelegationsSection /></TabsContent>}
        </Tabs>
      ) : (
        // A single available tab → render it directly (no tab bar). Only "Profils" can be the lone tab.
        <SecurityProfilesPage embedded />
      )}
    </Page>
  )
}
