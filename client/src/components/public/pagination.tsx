// Previous / "Page x / y" / Next bar shared by the public list pages (actualités, agenda, ressources).
// Renders nothing when everything fits on one page.
export function PublicPagination({
  page,
  totalPages,
  hasPreviousPage,
  hasNextPage,
  onPageChange,
}: {
  page: number
  totalPages: number
  hasPreviousPage: boolean
  hasNextPage: boolean
  onPageChange: (page: number) => void
}) {
  if (totalPages <= 1) return null
  const btn = 'min-h-11 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent/10 disabled:opacity-40'
  return (
    <div className="mt-10 flex items-center justify-center gap-3">
      <button type="button" disabled={!hasPreviousPage} onClick={() => onPageChange(page - 1)} className={btn}>Précédent</button>
      <span className="text-sm text-muted-foreground">Page {page} / {totalPages}</span>
      <button type="button" disabled={!hasNextPage} onClick={() => onPageChange(page + 1)} className={btn}>Suivant</button>
    </div>
  )
}
