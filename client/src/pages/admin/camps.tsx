// Camp BP entry ("/admin/camps"). Only ONE camp is active at a time (the server refuses a second): when there is
// one, this page just opens it (the camp page has a dropdown to look at old camps). With no active camp it lists
// the old (archived) camps and offers "Nouveau camp" (CG only; famillesCount optional → backend default).
import { useState } from 'react'
import { ChefsPicker } from '@/components/camp/chefs-picker'
import { Link, Navigate } from 'react-router'
import { useCamps, useCreateCamp, type CampListDto } from '@/services/camp-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { RequiredLabel } from '@/components/shared/required-label'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { parseApiError } from '@/lib/error-utils'
import { cn } from '@/lib/utils'
import { useIsCampCg } from '@/components/camp/use-is-camp-cg'
import { Tent, Plus, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_LABEL: Record<string, string> = { Setup: 'Préparation', Assigned: 'Familles formées', Closed: 'Clôturé' }

export default function CampsAdminPage() {
  const { data: camps, isLoading } = useCamps()
  const create = useCreateCamp()
  const isCg = useIsCampCg() // creating a camp is Chef-de-Groupe-only (Commission BP members run existing camps)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', scoutYear: '2026-2027', famillesCount: '' })
  const [chefs, setChefs] = useState<string[]>([]) // ACG(s) leading the camp (full rights on it)

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Le nom est requis.'); return }
    try {
      await create.mutateAsync({ name: form.name, scoutYear: form.scoutYear, famillesCount: form.famillesCount ? Number(form.famillesCount) : null, chefMemberIds: chefs })
      toast.success('Camp créé'); setOpen(false); setForm({ name: '', scoutYear: '2026-2027', famillesCount: '' }); setChefs([])
    } catch (e) { toast.error(parseApiError(e)) }
  }

  // A camp is active → go straight to it (replace, so "back" doesn't bounce here again).
  const active = camps?.find(c => !c.isArchived)
  if (active) return <Navigate to={`/admin/camps/${active.id}`} replace />

  return (
    <Page>
      <PageHeader
        title="Camp BP"
        icon={Tent}
        description="Diviser le groupe en familles équilibrées."
        actions={isCg ? <Button onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Nouveau camp</Button> : undefined}
      />

      {isLoading ? <LoadingSpinner variant="table" /> :
       (camps ?? []).length === 0 ? (
         <EmptyState icon={Tent} title="Aucun camp" description="Créez-en un pour commencer."
           action={isCg ? <Button onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Nouveau camp</Button> : undefined} />
       ) :
       <div className="space-y-2">
         <p className="text-sm text-muted-foreground">Aucun camp n'est en cours. Camps précédents :</p>
         {camps!.map(c => <CampCard key={c.id} camp={c} />)}
       </div>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nouveau camp</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><RequiredLabel required>Nom</RequiredLabel><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Camp BP 2026" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><RequiredLabel required>Année scoute</RequiredLabel><Input value={form.scoutYear} onChange={e => setForm(f => ({ ...f, scoutYear: e.target.value }))} /></div>
              <div className="space-y-1"><RequiredLabel>Nb familles</RequiredLabel><Input type="number" min={1} value={form.famillesCount} onChange={e => setForm(f => ({ ...f, famillesCount: e.target.value }))} placeholder="défaut" /></div>
            </div>
            <div className="space-y-1">
              <RequiredLabel>Chefs de commission</RequiredLabel>
              <p className="text-xs text-muted-foreground">Les assistants chef de groupe qui dirigent ce camp : ils ont tous les droits sur ce camp (commission, familles, jeux, paramètres).</p>
              <ChefsPicker value={chefs} onChange={setChefs} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={submit} disabled={create.isPending}>Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  )
}

function CampCard({ camp }: { camp: CampListDto }) {
  return (
    <Link to={`/admin/camps/${camp.id}`} className={cn('flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/40', camp.isArchived && 'opacity-60')}>
      <div className="flex-1">
        <p className="font-medium">{camp.name} {camp.isArchived && <span className="text-xs text-muted-foreground">(archivé)</span>}</p>
        <p className="text-sm text-muted-foreground">{camp.scoutYear} · {camp.famillesCount} familles · <span className="font-medium">{STATUS_LABEL[camp.status] ?? camp.status}</span></p>
      </div>
      <div className="hidden text-right text-sm text-muted-foreground sm:block">
        <p>{camp.participantCount} membres · {camp.gradedCount} notés</p>
        <p>{camp.assignedCount} affectés</p>
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground" />
    </Link>
  )
}
