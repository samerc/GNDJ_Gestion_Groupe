// Admin "Listes" page ("/admin/lists", perm maitrise.manage — CG + super-admin). One home for the member-data
// reference lists a Chef de Groupe curates: Écoles, Classes, Villes. Uses the shared ManagedListEditor (add,
// rename that CASCADES onto member/applicant records, archive an in-use value, usage counts). These lists were
// previously only editable in Settings (super-admin) — consolidated here so the CG can manage them.
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ManagedListEditor } from '@/components/shared/managed-list-editor'
import { PageHeader } from '@/components/shared/page-header'
import { Page } from '@/components/shared/page'
import { List } from 'lucide-react'

const LISTS = [
  { key: 'member.schools', label: 'Écoles' },
  { key: 'member.classes', label: 'Classes' },
  { key: 'member.cities', label: 'Villes' },
  { key: 'member.profession_domains', label: 'Professions' },
]

export default function ManagedListsPage() {
  const [tab, setTab] = useState(LISTS[0].key)
  return (
    <Page>
      <PageHeader
        title="Listes"
        icon={List}
        description="Écoles, classes, villes et domaines de profession proposés dans les formulaires. Renommer une valeur met aussi à jour les fiches existantes ; retirer une valeur utilisée l'archive (conservée sur les fiches)."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {LISTS.map((l) => <TabsTrigger key={l.key} value={l.key}>{l.label}</TabsTrigger>)}
        </TabsList>
        {LISTS.map((l) => (
          <TabsContent key={l.key} value={l.key} className="mt-4">
            <ManagedListEditor settingKey={l.key} />
          </TabsContent>
        ))}
      </Tabs>
    </Page>
  )
}
