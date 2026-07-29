import { Link } from 'react-router'
import { useMemberDocuments } from '@/services/document-service'
import { useDocumentTypeList } from '@/services/document-type-service'
import { FileText, ChevronRight, CheckCircle2 } from 'lucide-react'

// Prominent shortcut from Ma fiche to the member's dossier ("Mes documents"), showing their document
// completion at a glance. Most members log in to upload documents, so this puts the primary task one tap
// from where they land (Ma fiche). Shows nothing if there are no active document types.
export function DocumentsCta({ memberId }: { memberId: string }) {
  const { data: documents } = useMemberDocuments(memberId)
  const { data: docTypes } = useDocumentTypeList()
  if (!docTypes || docTypes.length === 0) return null

  // Latest uploaded file per document type (same "checklist" logic as the documents page).
  const latestForType = (docTypeId: string) =>
    documents?.filter((d) => d.documentTypeId === docTypeId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  const total = docTypes.length
  const approved = docTypes.filter((dt) => latestForType(dt.id)?.status === 'Approved').length
  const complete = approved === total
  const pct = Math.round((approved / total) * 100)

  return (
    <Link
      to="/my-documents"
      className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40 hover:bg-accent/5"
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${complete ? 'bg-green-100 text-green-700' : 'bg-primary/10 text-primary'}`}>
        {complete ? <CheckCircle2 className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">Mes documents</span>
          <span className="text-sm font-medium text-muted-foreground">{approved}/{total}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {complete ? 'Dossier complet — merci !' : 'Dossier en cours — envoyez vos documents'}
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full transition-all ${complete ? 'bg-green-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  )
}
