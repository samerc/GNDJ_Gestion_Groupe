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
  // Per required document type, the status of its latest upload (or "missing" if none).
  const statuses = docTypes.map((dt) => latestForType(dt.id)?.status ?? 'Missing')
  const approved = statuses.filter((s) => s === 'Approved').length
  const pending = statuses.filter((s) => s === 'Pending').length
  const rejected = statuses.filter((s) => s === 'Rejected').length
  const missing = statuses.filter((s) => s === 'Missing').length
  const complete = approved === total

  // Sub-label reflects what the member should DO next, so uploaded-but-unapproved docs don't read as "à envoyer".
  const label = complete
    ? 'Dossier complet — merci !'
    : rejected > 0
      ? `${rejected} document(s) à corriger` + (missing > 0 ? ` · ${missing} à envoyer` : '')
      : missing > 0
        ? 'Dossier en cours — envoyez vos documents'
        : 'Documents envoyés — en attente de validation'

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
          {/* Show approved/total, plus a pending hint so "0/2" doesn't look like nothing was submitted. */}
          <span className="text-sm font-medium text-muted-foreground">
            {approved}/{total}{pending > 0 && <span className="text-amber-600"> · {pending} en attente</span>}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
        {/* Two-segment bar: green = accepted, amber = uploaded & awaiting validation; grey = missing/à corriger. */}
        <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${(approved / total) * 100}%` }} />
          <div className="h-full bg-amber-400 transition-all" style={{ width: `${(pending / total) * 100}%` }} />
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  )
}
