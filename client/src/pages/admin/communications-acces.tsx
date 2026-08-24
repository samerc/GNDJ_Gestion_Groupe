import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Send } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import CommunicationsPage from './communications'
import SendAccessPage from './send-access'

// Merged "Communications & accès" page — the two email-sending tools that were separate menu items and did the
// same core thing (send people their login / a message), for different audiences:
//   • Emails aux chefs : send a template email to selected leaders (e.g. the rentrée onboarding + activation link).
//   • Envoyer les accès : send each member of a unit their username + set-password link.
// Each is a TAB shown only if the user holds the matching permission (a CG holds both). Each child renders in
// `embedded` mode (its own header suppressed) so this page owns the single title + tab bar — same pattern as
// "Profils & accès" and "Suivi des documents".
export default function CommunicationsAccesPage() {
  const { hasPermission } = useAuthStore()
  const canChefs = hasPermission(PERMISSIONS.MAITRISE_MANAGE)
  const canAcces = hasPermission(PERMISSIONS.MEMBERS_RESET_PASSWORD)

  const tabs = [
    canChefs && { value: 'chefs', label: 'Emails aux chefs' },
    canAcces && { value: 'acces', label: 'Envoyer les accès' },
  ].filter(Boolean) as { value: string; label: string }[]

  const [params] = useSearchParams()
  const initial = params.get('tab') === 'acces' ? 'acces' : params.get('tab') === 'chefs' ? 'chefs' : tabs[0]?.value
  const [tab, setTab] = useState(initial ?? 'chefs')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Send className="h-6 w-6 text-primary" />Communications &amp; accès</h1>
        <p className="text-sm text-muted-foreground">Envoyer un message aux chefs, ou envoyer aux membres leur identifiant et leur lien de connexion.</p>
      </div>
      {tabs.length > 1 ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {tabs.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
          </TabsList>
          {canChefs && <TabsContent value="chefs" className="mt-4"><CommunicationsPage embedded /></TabsContent>}
          {canAcces && <TabsContent value="acces" className="mt-4"><SendAccessPage embedded /></TabsContent>}
        </Tabs>
      ) : (
        // A single available tab → render it directly (no tab bar).
        tabs[0]?.value === 'acces' ? <SendAccessPage embedded /> : <CommunicationsPage embedded />
      )}
    </div>
  )
}
