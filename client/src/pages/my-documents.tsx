import { useAuthStore } from '@/stores/auth-store'
import { MemberDocuments } from '@/components/members/member-documents'
import { MemberCotisations } from '@/components/members/member-cotisations'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Receipt, FolderOpen } from 'lucide-react'

// "Mes documents" — a regular member's own dossier: the document checklist (upload/download own
// files) plus their cotisations (view/download receipts). The two Ma fiche tabs (Documents +
// Cotisations) were merged here; both sections share ONE consistent card design (tinted icon tile
// header + flat content) so the page reads as a single, coherent dossier. Scoped to the user's member.
export default function MyDocumentsPage() {
  const user = useAuthStore((s) => s.user)
  const memberId = user?.memberId ?? ''

  // No memberId yet (user not hydrated / account without a linked member) → wait rather than render empty.
  if (!memberId) return <LoadingSpinner variant="page" />

  return (
    <Page size="narrow">
      <PageHeader title="Mon dossier" icon={FolderOpen} description="Vos documents et cotisations" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </span>
            Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MemberDocuments memberId={memberId} isOwnProfile />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Receipt className="h-5 w-5" />
            </span>
            Cotisations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MemberCotisations memberId={memberId} bare selfView />
        </CardContent>
      </Card>
    </Page>
  )
}
