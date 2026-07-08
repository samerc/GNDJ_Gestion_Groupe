import { useAuthStore } from '@/stores/auth-store'
import { MemberDocuments } from '@/components/members/member-documents'
import { MemberCotisations } from '@/components/members/member-cotisations'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { FileText, Receipt } from 'lucide-react'

// "Mes documents" — a regular member's own document checklist (upload/download own files) plus their
// cotisations (view/download receipts). The Ma fiche Documents + Cotisations tabs were merged here to
// avoid the redundant duplicate. Scoped to the logged-in user's own member id.
export default function MyDocumentsPage() {
  const user = useAuthStore((s) => s.user)
  const memberId = user?.memberId ?? ''

  // No memberId yet (user not hydrated / account without a linked member) → wait rather than render empty.
  if (!memberId) return <LoadingSpinner />

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Mes documents</h1>
        </div>
        <MemberDocuments memberId={memberId} isOwnProfile />
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Receipt className="h-6 w-6 text-muted-foreground" />
          <h2 className="text-xl font-bold">Mes cotisations</h2>
        </div>
        <MemberCotisations memberId={memberId} />
      </div>
    </div>
  )
}
