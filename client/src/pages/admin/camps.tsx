// Camp BP list page ("/admin/camps", perm camp.manage — CG/super-admin). Lists camp editions (each splits the
// whole group into balanced "familles") with status (Setup→Assigned→Closed) and progress counts; "Nouveau camp"
// creates one (famillesCount optional → backend default). Each card links to camp-detail for the familles board.
import { useState } from 'react'
import { Link } from 'react-router'
import { useCamps, useCreateCamp, type CampListDto } from '@/services/camp-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { RequiredLabel } from '@/components/shared/required-label'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { cn } from '@/lib/utils'
import { Tent, Plus, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_LABEL: Record<string, string> = { Setup: 'Préparation', Assigned: 'Familles formées', Closed: 'Clôturé' }

export default function CampsAdminPage() {
  const { data: camps, isLoading } = useCamps()
  const create = useCreateCamp()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', scoutYear: '2026-2027', famillesCount: '' })

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Le nom est requis.'); return }
    try {
      await create.mutateAsync({ name: form.name, scoutYear: form.scoutYear, famillesCount: form.famillesCount ? Number(form.famillesCount) : null })
      toast.success('Camp créé'); setOpen(false); setForm({ name: '', scoutYear: '2026-2027', famillesCount: '' })
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><Tent className="h-5 w-5 text-primary" />Camp BP</h1>
          <p className="text-sm text-muted-foreground">Diviser le groupe en familles équilibrées.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Nouveau camp</Button>
      </div>

      {isLoading ? <div className="flex h-40 items-center justify-center"><LoadingSpinner /></div> :
       (camps ?? []).length === 0 ? <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Aucun camp. Créez-en un pour commencer.</p> :
       <div className="space-y-2">{camps!.map(c => <CampCard key={c.id} camp={c} />)}</div>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nouveau camp</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><RequiredLabel required>Nom</RequiredLabel><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Camp BP 2026" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><RequiredLabel required>Année scoute</RequiredLabel><Input value={form.scoutYear} onChange={e => setForm(f => ({ ...f, scoutYear: e.target.value }))} /></div>
              <div className="space-y-1"><RequiredLabel>Nb familles</RequiredLabel><Input type="number" min={1} value={form.famillesCount} onChange={e => setForm(f => ({ ...f, famillesCount: e.target.value }))} placeholder="défaut" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={submit} disabled={create.isPending}>Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
