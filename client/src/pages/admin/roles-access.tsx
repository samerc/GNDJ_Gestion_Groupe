// Merged "Profils & accès" admin page — combines the two role/permission tools that were separate pages:
//   • "Profils de sécurité" (roles.view / roles.manage) — the master permission profiles + who holds each.
//   • "Accès maîtrise" (roles.manage_group) — the CG's per-function, per-area access delegation.
// They edit the same underlying SecurityProfile permissions but for different audiences, so each is a TAB
// shown only if the user holds that permission (a super-admin sees both; a Chef de Groupe sees both; someone
// with only roles.view sees just Profils). The two child pages render in `embedded` mode (their own headers
// suppressed) so this page owns the single title + tab bar.
import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import SecurityProfilesPage from './security-profiles'
import GroupAccessPage from './group-access'

export default function RolesAccessPage() {
  const { hasPermission } = useAuthStore()
  const canProfiles = hasPermission(PERMISSIONS.ROLES_VIEW)
  const canGroup = hasPermission(PERMISSIONS.ROLES_MANAGE_GROUP)

  const tabs = [
    canProfiles && { value: 'profiles', label: 'Profils de sécurité' },
    canGroup && { value: 'access', label: 'Accès maîtrise' },
  ].filter(Boolean) as { value: string; label: string }[]
  const [tab, setTab] = useState(tabs[0]?.value ?? 'profiles')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Profils &amp; accès</h1>
        <p className="text-sm text-muted-foreground">
          Profils de permissions et délégation d'accès de la maîtrise de groupe.
        </p>
      </div>

      {tabs.length > 1 ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {tabs.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
          </TabsList>
          {canProfiles && <TabsContent value="profiles" className="mt-4"><SecurityProfilesPage embedded /></TabsContent>}
          {canGroup && <TabsContent value="access" className="mt-4"><GroupAccessPage embedded /></TabsContent>}
        </Tabs>
      ) : (
        // A single available tab → render it directly (no tab bar).
        tabs[0]?.value === 'access' ? <GroupAccessPage embedded /> : <SecurityProfilesPage embedded />
      )}
    </div>
  )
}
