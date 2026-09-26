// Camp BP entry ("/admin/camps"). Only ONE camp is active at a time (the server refuses a second): when there is
// one, this page just opens it (the camp page has a dropdown to look at old camps). With no active camp it lists
// the old (archived) camps and offers "Nouveau camp" (CG only; famillesCount optional → backend default).
import { useState } from 'react'
import { ChefsPicker } from '@/components/camp/chefs-picker'
import { Link, Navigate } from 'react-router'
import { useCamps, useCreateCamp, type CampListDto } from '@/services/camp-service'
import { useSetting } from '@/services/settings-service'
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
  const [form, setForm] = useState({ theme: '', famillesCount: '' })
  // The camp takes the current scout year and is named after its second year (2026-2027 → Camp BP 2027).
  const scoutYear = useSetting('passage.scout_year').data?.value?.trim() ?? ''
  const campName = scoutYear ? `Camp BP ${scoutYear.split('-').pop()?.trim()}` : ''
  const yearTaken = !!scoutYear && !!camps?.some(c => c.scoutYear === scoutYear)
  const [chefs, setChefs] = useState<string[]>([]) // ACG(s) leading the camp (full rights on it)

  const submit = async () => {
    try {
      await create.mutateAsync({ theme: form.theme.trim() || null, famillesCount: form.famillesCount ? Number(form.famillesCount) : null, chefMemberIds: chefs })
      toast.success('Camp créé'); setOpen(false); setForm({ theme: '', famillesCount: '' }); setChefs([])
    } catch (e) { toast.error(parseApiError(e)) }
  }

  // A camp is active → go straight to it (replace, so "back" doesn't bounce here again).
  const active = camps?.find(c => !c.isArchived)
  // "Nouveau camp" only when it's actually possible: CG, list loaded (no flash), no active camp (redirected below)
  // and no camp yet for the current scout year — a closed (archived) camp still counts: one camp per scout year.
  const canCreate = isCg && !isLoading && !active && !yearTaken
  if (active) return <Navigate to={`/admin/camps/${active.id}`} replace />

  return (
    <Page>
      <PageHeader
        title="Camp BP"
        icon={Tent}
        description="Diviser le groupe en familles équilibrées."
        actions={canCreate ? <Button onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Nouveau camp</Button> : undefined}
      />

      {isLoading ? <LoadingSpinner variant="table" /> :
       (camps ?? []).length === 0 ? (
         <EmptyState icon={Tent} title="Aucun camp" description="Créez-en un pour commencer."
           action={canCreate ? <Button onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Nouveau camp</Button> : undefined} />
       ) :
       <div className="space-y-2">
         {isCg && yearTaken && (
           <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
             Le camp de l'année {scoutYear} est clôturé. Le prochain camp pourra être créé lors de la prochaine année scoute.
           </p>
         )}
         <p className="text-sm text-muted-foreground">Aucun camp n'est en cours. Camps précédents :</p>
         {camps!.map(c => <CampCard key={c.id} camp={c} />)}
       </div>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nouveau camp</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {/* Name + year are automatic (current scout year) and can't be changed. */}
            <div className="rounded-lg border bg-muted/40 px-3 py-2">
              {scoutYear
                ? <><p className="font-medium">{campName}</p><p className="text-xs text-muted-foreground">Année scoute {scoutYear} — nom et année sont fixés automatiquement.</p></>
                : <p className="text-sm text-destructive">L'année scoute n'est pas définie (Paramètres → Passage).</p>}
            </div>
            {yearTaken && <p className="text-sm text-destructive">Il existe déjà un camp pour l'année {scoutYear}.</p>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1 sm:col-span-2"><RequiredLabel>Thème</RequiredLabel><Input value={form.theme} maxLength={200} onChange={e => setForm(f => ({ ...f, theme: e.target.value }))} placeholder="Le thème du camp" /></div>
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
            <Button onClick={submit} disabled={create.isPending || !scoutYear || yearTaken}>Créer</Button>
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
        {camp.theme && <p className="text-sm italic text-muted-foreground">« {camp.theme} »</p>}
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
