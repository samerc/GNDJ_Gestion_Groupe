import { Send } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Page } from '@/components/shared/page'
import CommunicationsPage from './communications'

// "Emails aux chefs" — send a template email (e.g. the rentrée email) to the leaders. The page used to be
// "Communications & accès" with a second tab, "Envoyer les accès" (the 2026 launch rollout of set-password links
// to every member, unit by unit). That tab was removed: every member has their access now, new members get their
// link automatically when their demande is converted, and a single member can still be sent theirs from their
// file (Actions → Envoyer l'accès). The route path is kept so old links keep working.
export default function CommunicationsAccesPage() {
  return (
    <Page>
      <PageHeader title="Emails aux chefs" icon={Send}
        description="Choisissez un modèle et les destinataires, prévisualisez, puis envoyez — par exemple l'email de rentrée. Les chefs sans email de contact sont ignorés." />
      <CommunicationsPage embedded />
    </Page>
  )
}
