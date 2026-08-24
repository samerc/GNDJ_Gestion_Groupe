import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { FileWarning } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import DocumentVerificationPage from './document-verification'
import DocumentRemindersPage from './document-reminders'

// Merged "Suivi des documents" page — combines the two document-follow-up tools that were separate menu items:
//   • Campagne : the date-driven verification campaign (auto open/close of deposit, on-hold engine).
//   • Relances : the ad-hoc unit-by-unit reminder sender for incomplete dossiers.
// Both are CG/super-admin (maitrise.manage). Each child renders in `embedded` mode (its own header suppressed)
// so this page owns the single title + tab bar — same pattern as the "Profils & accès" merge.
export default function DocumentsSuiviPage() {
  // Allow deep-linking a tab (e.g. the rentrée "Relancer les documents" action → ?tab=relances).
  const [params] = useSearchParams()
  const [tab, setTab] = useState(params.get('tab') === 'relances' ? 'relances' : 'campagne')
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FileWarning className="h-6 w-6 text-primary" />Suivi des documents
        </h1>
        <p className="text-sm text-muted-foreground">
          Campagne de vérification (dates + mise en attente automatiques) et relances manuelles des dossiers incomplets.
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="campagne">Campagne</TabsTrigger>
          <TabsTrigger value="relances">Relances</TabsTrigger>
        </TabsList>
        <TabsContent value="campagne" className="mt-4"><DocumentVerificationPage embedded /></TabsContent>
        <TabsContent value="relances" className="mt-4"><DocumentRemindersPage embedded /></TabsContent>
      </Tabs>
    </div>
  )
}
