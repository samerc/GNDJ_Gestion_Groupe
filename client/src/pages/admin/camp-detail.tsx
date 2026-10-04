// Camp BP detail / management page ("/admin/camps/:id" — CG / ACG, or a Commission BP member). The tabs shown
// come from camp.myAccess (server-computed): an area at "view" is read-only, at "none" it is hidden; the
// Commission tab shows to everyone on the commission. Tabs:
//  - FamillesTab: the familles board. CG runs the balanced randomized draft (useRunDraft), then fine-tunes by
//    picking two familles (slots A/B) and drag-dropping members between the two columns (a drop = one-way move);
//    assigns Père/Mère per famille (gender-restricted).
//  - GamesTab: define jeux/étapes (with their number 1–25 in the rotation grid) and pick their étapiste sets.
//  - Rotation / Pointage / Recherche (components/camp): the grand jeu — fixed rotation grid (dates, hours, rain
//    plan, printouts), score entry + ranking, and "where is this famille now".
//  - SettingsTab: edit camp metadata + the Note formula coefficients (the per-branch multiplier is read-only,
//    sourced from each unit type's NumberOfYears).
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import {
  useCamp, useUpdateCamp, useArchiveCamp, useDeleteCamp,
  useCampFamilles, useRunDraft, useMoveParticipant, useSetLeaders, useLeaderCandidates,
  useCampGames, useCreateGame, useUpdateGame, printGame, useDeleteGame, useSetEtapistes, useEtapisteCandidates,
  printFamille, printAllFamilles, printUnitList, downloadPresenceList,
  type CampFamilleDto, type CampGameDto, useAutoAssignPlaces, type CampPlacesAssignResult,
  useCamps,
} from '@/services/camp-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CampMap } from '@/components/camp/camp-map'
import { DndContext, DragOverlay, useDraggable, useDroppable, pointerWithin, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { RequiredLabel } from '@/components/shared/required-label'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { BackLink } from '@/components/shared/back-link'
import { Callout } from '@/components/shared/callout'
import { EmptyState } from '@/components/shared/empty-state'
import { SearchInput } from '@/components/shared/search-input'
import { SegmentedToggle } from '@/components/shared/segmented-toggle'
import { Badge } from '@/components/ui/badge'
import { rotationProblem } from '@/lib/camp-rotation'
import { GameCard } from '@/components/camp/game-card'
import { parseApiError, parseBlobError } from '@/lib/error-utils'
import { cn } from '@/lib/utils'
import { Tent, Shuffle, Save, Trash2, Crown, Plus, Printer, Pencil, Archive, Wand2, CheckCircle2, FileSpreadsheet, Users, Lock, Gamepad2, SearchX } from 'lucide-react'
import { RichTextEditor } from '@/components/shared/rich-text-editor'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSetting } from '@/services/settings-service'
import { parsePlaces, PLACES_SETTING, type CampPlace } from '@/lib/camp-places'
import { optionsWithCurrent } from '@/lib/options'
import { Tip } from '@/components/ui/tooltip'
import { CampCommissionTab } from '@/components/camp/camp-commission-tab'
import { useIsCampCg } from '@/components/camp/use-is-camp-cg'
import { CampRotationTab } from '@/components/camp/camp-rotation-tab'
import { CampScoringTab } from '@/components/camp/camp-scoring'
import { CampLookup } from '@/components/camp/camp-lookup'
import { FamilleInfoDialog, SuperFamillesDialog } from '@/components/camp/camp-familles-extras'
import { toast } from 'sonner'

export default function CampDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { data: camp, isLoading } = useCamp(id)
  const { data: camps } = useCamps()
  const navigate = useNavigate()
  const hasActive = !!camps?.some(c => !c.isArchived)

  // With no active camp, the list page offers "Nouveau camp" — keep a way back to it.
  const backLink = !hasActive && <BackLink to="/admin/camps" label="Tous les camps" />
  if (isLoading) return (
    <Page>
      {backLink}
      <PageHeader icon={Tent} title="Camp BP" />
      <LoadingSpinner variant="detail" />
    </Page>
  )
  if (!camp) return (
    <Page>
      {backLink}
      <PageHeader icon={Tent} title="Camp BP" />
      <EmptyState icon={SearchX} title="Camp introuvable." />
    </Page>
  )

  // Tabs this user may open (areas at "view" or "edit"; Commission for admins + commission members).
  const access = camp.myAccess
  const tabs = [
    access.familles !== 'none' && 'familles',
    access.jeux !== 'none' && 'jeux',
    access.jeux !== 'none' && 'rotation',
    access.jeux !== 'none' && 'pointage',
    (access.isAdmin || access.isCommissionMember) && 'recherche',
    // The carte is for anyone who can open some part of the camp.
    (access.isAdmin || access.isCommissionMember || access.familles !== 'none' || access.jeux !== 'none' || access.parametres !== 'none') && 'carte',
    access.parametres !== 'none' && 'parametres',
    (access.isAdmin || access.isCommissionMember) && 'commission',
  ].filter(Boolean) as string[]

  return (
    <Page>
      {backLink}
      <PageHeader
        icon={Tent}
        title={<span className="inline-flex flex-wrap items-center gap-2">{camp.name}{camp.isArchived && <Badge variant="secondary">Archivé</Badge>}</span>}
        description={<>
          {camp.theme && <span className="italic text-foreground">Thème : « {camp.theme} » · </span>}
          {camp.scoutYear} · {camp.participantCount} membres · {camp.gradedCount} notés · {camp.assignedCount} dans une famille ·{' '}
          <Tip content={`${camp.pereCount} Père(s) et ${camp.mereCount} Mère(s) choisis`}><span>Père/Mère : {camp.leadersCompleteCount}/{camp.famillesCount}</span></Tip>
        </>}
        actions={(camps ?? []).length > 1 && (
          // Switch to another camp (the active one first, then the old ones) — like the dashboard year picker.
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Camp</span>
            <Select value={id} onValueChange={v => navigate(`/admin/camps/${v}`)}>
              <SelectTrigger className="w-80 max-w-[70vw]" aria-label="Changer de camp"><SelectValue /></SelectTrigger>
              <SelectContent>
                {camps!.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name} · {c.scoutYear}{c.isArchived ? '' : ' — en cours'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      />

      {tabs.length === 0 ? (
        <EmptyState icon={Lock} title="Vous n'avez accès à aucune partie de ce camp."
          description="Les chefs de commission choisissent ce que chaque membre peut voir." />
      ) : (
        <Tabs defaultValue={tabs[0]}>
          <TabsList>
            {tabs.includes('familles') && <TabsTrigger value="familles">Familles</TabsTrigger>}
            {tabs.includes('jeux') && <TabsTrigger value="jeux">Jeux</TabsTrigger>}
            {tabs.includes('rotation') && <TabsTrigger value="rotation">Rotation</TabsTrigger>}
            {tabs.includes('pointage') && <TabsTrigger value="pointage">Pointage</TabsTrigger>}
            {tabs.includes('recherche') && <TabsTrigger value="recherche">Où est… ?</TabsTrigger>}
            {tabs.includes('carte') && <TabsTrigger value="carte">Carte</TabsTrigger>}
            {tabs.includes('parametres') && <TabsTrigger value="parametres">Paramètres</TabsTrigger>}
            {tabs.includes('commission') && <TabsTrigger value="commission">Commission</TabsTrigger>}
          </TabsList>
          {tabs.includes('familles') && <TabsContent value="familles" className="mt-4"><FamillesTab campId={id} readOnly={access.familles !== 'edit'} /></TabsContent>}
          {tabs.includes('jeux') && <TabsContent value="jeux" className="mt-4"><GamesTab campId={id} readOnly={access.jeux !== 'edit'} /></TabsContent>}
          {tabs.includes('rotation') && <TabsContent value="rotation" className="mt-4"><CampRotationTab campId={id} readOnly={access.jeux !== 'edit' || camp.isArchived} /></TabsContent>}
          {tabs.includes('pointage') && <TabsContent value="pointage" className="mt-4"><CampScoringTab campId={id} /></TabsContent>}
          {tabs.includes('recherche') && <TabsContent value="recherche" className="mt-4"><CampLookup campId={id} /></TabsContent>}
          {tabs.includes('carte') && <TabsContent value="carte" className="mt-4"><CampMap /></TabsContent>}
          {tabs.includes('parametres') && <TabsContent value="parametres" className="mt-4"><SettingsTab campId={id} readOnly={access.parametres !== 'edit'} /></TabsContent>}
          {tabs.includes('commission') && <TabsContent value="commission" className="mt-4"><CampCommissionTab campId={id} access={access} /></TabsContent>}
        </Tabs>
      )}
    </Page>
  )
}

// ─── Paramètres (formula) ────────────────────────────────────────────────────
function SettingsTab({ campId, readOnly }: { campId: string; readOnly: boolean }) {
  const { data: camp } = useCamp(campId)
  const navigate = useNavigate()
  const update = useUpdateCamp(campId)
  const archive = useArchiveCamp()
  const del = useDeleteCamp()
  const isCg = useIsCampCg() // archive / delete are Chef-de-Groupe-only (not Commission BP)
  const [form, setForm] = useState({ theme: '', famillesCount: 0, noteForceCoef: 1, noteOffset: -4 })
  const [deleting, setDeleting] = useState(false)
  const [archiving, setArchiving] = useState(false) // confirm first: archiving is final (a camp is never re-opened)

  // Hydrate the settings form when the camp (re)loads — render-phase reset.
  // Start from undefined so the form is filled on the FIRST render too (the camp is usually already cached).
  const [prevCamp, setPrevCamp] = useState<typeof camp>(undefined)
  if (camp && camp !== prevCamp) {
    setPrevCamp(camp)
    setForm({ theme: camp.theme ?? '', famillesCount: camp.famillesCount, noteForceCoef: camp.noteForceCoef, noteOffset: camp.noteOffset })
  }

  if (!camp) return null
  const save = async () => {
    try {
      await update.mutateAsync({ ...form, theme: form.theme.trim() || null })
      toast.success('Paramètres enregistrés')
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <div className="max-w-2xl space-y-5">
      {readOnly && <Callout tone="muted">Lecture seule : les chefs de commission ne vous ont pas donné le droit de modifier les paramètres.</Callout>}
      <fieldset disabled={readOnly} className="space-y-5">
      {/* Name + scout year are fixed at creation (Camp BP <year>); only the theme and the count are edited. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2"><RequiredLabel>Nom</RequiredLabel><Input value={camp.name} disabled readOnly /></div>
        <div className="space-y-1"><RequiredLabel>Année scoute</RequiredLabel><Input value={camp.scoutYear} disabled readOnly /></div>
        <div className="space-y-1 sm:col-span-2"><RequiredLabel>Thème</RequiredLabel><Input value={form.theme} maxLength={200} placeholder="Le thème du camp" onChange={e => setForm(f => ({ ...f, theme: e.target.value }))} /></div>
        <div className="space-y-1"><RequiredLabel>Nombre de familles</RequiredLabel><Input type="number" min={1} value={form.famillesCount} onChange={e => setForm(f => ({ ...f, famillesCount: Number(e.target.value) }))} />
          {/* The grand-jeu rotation needs an even count (2 familles per game), not 4 or 6, at most 100. */}
          {rotationProblem(Number(form.famillesCount)) && <p className="text-xs text-amber-700 dark:text-amber-400">{rotationProblem(Number(form.famillesCount))}</p>}
          {!rotationProblem(form.famillesCount) && <p className="text-xs text-muted-foreground">{form.famillesCount / 2} jeux dans la rotation.</p>}</div>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">Le nom et l'année scoute sont fixés automatiquement à la création du camp.</p>

      <div className="rounded-lg border p-4">
        <h3 className="mb-1 text-sm font-semibold">Formule de la Note</h3>
        <p className="mb-3 text-xs text-muted-foreground">Note = (coef × Force) + (multiplicateur de la branche × Année) + décalage. Le multiplicateur par défaut = nombre d'années de la branche.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><RequiredLabel>Coefficient Force</RequiredLabel><Input type="number" step="0.1" value={form.noteForceCoef} onChange={e => setForm(f => ({ ...f, noteForceCoef: Number(e.target.value) }))} /></div>
          <div className="space-y-1"><RequiredLabel>Décalage (constante)</RequiredLabel><Input type="number" step="1" value={form.noteOffset} onChange={e => setForm(f => ({ ...f, noteOffset: Number(e.target.value) }))} /></div>
        </div>
        {camp.branchMultipliers.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Multiplicateur par branche <span className="font-normal">(= nombre d'années de la branche, défini sur le type d'unité)</span></p>
            <div className="flex flex-wrap gap-2">
              {camp.branchMultipliers.map(b => (
                <span key={b.unitTypeId} className="rounded border bg-muted/40 px-2 py-1 text-sm">{b.unitTypeName}: <b>×{b.multiplier}</b></span>
              ))}
            </div>
          </div>
        )}
      </div>

      </fieldset>

      {/* Save belongs to the form (right-aligned under it); the irreversible camp actions sit apart below. */}
      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={update.isPending}><Save className="mr-1.5 h-4 w-4" />{update.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </div>
      )}

      {isCg && (
        <div className="rounded-lg border border-destructive/30 p-4">
          <h3 className="text-sm font-semibold">Clôture du camp</h3>
          <div className="mt-3 divide-y">
            {!camp.isArchived && (
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
                <p className="min-w-0 flex-1 text-sm text-muted-foreground"><b className="text-foreground">Archiver</b> — à la fin du camp. Il reste consultable, ne peut plus être réouvert, et un nouveau camp pourra être créé.</p>
                <Button variant="outline" onClick={() => setArchiving(true)}><Archive className="mr-1.5 h-4 w-4" />Archiver</Button>
              </div>
            )}
            <div className={cn('flex flex-wrap items-center justify-between gap-3', !camp.isArchived && 'pt-3')}>
              <p className="min-w-0 flex-1 text-sm text-muted-foreground"><b className="text-foreground">Supprimer</b> — efface le camp et toutes ses données (familles, notes, jeux). Irréversible.</p>
              <Button variant="destructive" onClick={() => setDeleting(true)}><Trash2 className="mr-1.5 h-4 w-4" />Supprimer</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={archiving} onOpenChange={setArchiving} title="Archiver le camp ?" variant="destructive"
        description={`Archiver « ${camp.name} » ? Le camp sera clôturé et ne pourra plus être réouvert. Il restera consultable dans la liste des anciens camps, et vous pourrez ensuite créer un nouveau camp.`}
        confirmLabel="Archiver" loading={archive.isPending}
        onConfirm={async () => { try { await archive.mutateAsync({ id: campId, archive: true }); toast.success('Camp archivé'); setArchiving(false) } catch (e) { toast.error(parseApiError(e)) } }} />

      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Supprimer le camp ?" variant="destructive"
        description={`Supprimer « ${camp.name} » et toutes ses données (familles, notes, jeux) ? Irréversible.`} confirmLabel="Supprimer" loading={del.isPending}
        onConfirm={async () => { try { await del.mutateAsync(campId); toast.success('Camp supprimé'); navigate('/admin/camps') } catch (e) { toast.error(parseApiError(e)) } }} />
    </div>
  )
}

// ─── Familles board: famille table + two-pane drag & drop ────────────────────
type DragData = { participantId: string; familleId: string; name: string }

function FamillesTab({ campId, readOnly }: { campId: string; readOnly: boolean }) {
  const { data: familles, isLoading } = useCampFamilles(campId)
  const draft = useRunDraft(campId)
  const move = useMoveParticipant(campId)
  const [confirmDraft, setConfirmDraft] = useState(false)
  // « Inclure les Pères / Mères »: the draft also picks them among the campers ticked Père/Mère (off = members only).
  const [includeLeaders, setIncludeLeaders] = useState(false)
  const runDraft = async () => {
    try {
      const r = await draft.mutateAsync(includeLeaders)
      if (!includeLeaders) toast.success('Tirage effectué')
      else if (r.pereCount < r.familles || r.mereCount < r.familles)
        toast.warning(`Tirage effectué — pas assez de candidats : ${r.pereCount} Père(s) et ${r.mereCount} Mère(s) pour ${r.familles} familles.`)
      else toast.success(`Tirage effectué avec ${r.pereCount} Pères et ${r.mereCount} Mères`)
    } catch (e) { toast.error(parseApiError(e)) } finally { setConfirmDraft(false) }
  }
  const leadersBox = (
    <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4" checked={includeLeaders} onChange={e => setIncludeLeaders(e.target.checked)} />
      <span>
        <span className="font-medium">Inclure les Pères / Mères</span>
        <span className="block text-xs text-muted-foreground">
          Le tirage choisit aussi un Père et une Mère par famille, au hasard parmi les membres cochés « Père/Mère » dans la notation
          (les Pères / Mères actuels sont remplacés). Décoché : les familles sont créées sans eux, vous les choisissez ensuite.
        </span>
      </span>
    </label>
  )
  const [slotA, setSlotA] = useState<string | null>(null)
  const [slotB, setSlotB] = useState<string | null>(null)
  const [leaderDialog, setLeaderDialog] = useState<CampFamilleDto | null>(null)
  const [infoDialog, setInfoDialog] = useState<CampFamilleDto | null>(null)
  const [supersOpen, setSupersOpen] = useState(false)
  const [drag, setDrag] = useState<DragData | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Default the two compared slots to the first two familles (and re-seed if a selected one disappears).
  // Render-phase reset, keyed on the familles list.
  const [prevFamilles, setPrevFamilles] = useState(familles)
  if (familles !== prevFamilles) {
    setPrevFamilles(familles)
    if (familles && familles.length > 0) {
      if (!slotA || !familles.some(f => f.id === slotA)) setSlotA(familles[0].id)
      if ((!slotB || !familles.some(f => f.id === slotB)) && familles.length > 1) setSlotB(familles[1].id)
    }
  }

  if (isLoading) return <LoadingSpinner variant="cards" />
  if ((familles ?? []).length === 0) return (
    <div className="space-y-3">
      {!readOnly && <div className="flex justify-end"><Button onClick={() => setConfirmDraft(true)} disabled={draft.isPending}><Shuffle className="mr-1 h-4 w-4" />{draft.isPending ? 'Tirage…' : 'Lancer le tirage'}</Button></div>}
      <EmptyState icon={Users} title={readOnly ? "Aucune famille pour l'instant." : 'Aucune famille.'}
        description={readOnly ? undefined : 'Lancez le tirage pour les créer et répartir les membres.'} />
      <ConfirmDialog open={confirmDraft} onOpenChange={setConfirmDraft} title="Lancer le tirage" confirmLabel="Lancer"
        description="Répartit tous les membres notés dans les familles (équilibre note/effectif/branche/genre)."
        loading={draft.isPending} onConfirm={runDraft}>{leadersBox}</ConfirmDialog>
    </div>
  )

  const fl = familles!
  // Balance view on the famille TOTAL note (what the draft balances; a move always raises the receiving
  // famille's total). Target = the ideal total = all notes ÷ number of familles. Each row's bar grows from
  // the centre line: left (blue) when the famille is below the target, right (amber) when above; within
  // ±2 % of the target it's "équilibrée" (green). The bar length is scaled on the largest gap on the board.
  const tot = (f: { noteSum: number }) => Math.round(f.noteSum * 10) / 10
  const target = fl.length ? Math.round((fl.reduce((s, f) => s + f.noteSum, 0) / fl.length) * 10) / 10 : 0
  const tolerance = Math.max(1, target * 0.02)
  const maxGap = Math.max(tolerance, ...fl.map(f => Math.abs(tot(f) - target)))
  const famA = fl.find(f => f.id === slotA) ?? null
  const famB = fl.find(f => f.id === slotB) ?? null

  // Toggle a famille into slot A/B: re-clicking clears it; both full → reset to A only.
  const pickFamille = (id: string) => {
    if (id === slotA) setSlotA(null)
    else if (id === slotB) setSlotB(null)
    else if (!slotA) setSlotA(id)
    else if (!slotB) setSlotB(id)
    else { setSlotA(id); setSlotB(null) }
  }

  // Drop resolution: anywhere on the other famille's column = MOVE the member there (one way — nobody comes
  // back). No-op when dropped back on the same famille. (Swapping on a member card was removed: the columns
  // are full of cards, so nearly every drop turned into an unintended swap.)
  const onDragEnd = async (e: DragEndEvent) => {
    setDrag(null)
    const a = e.active.data.current as DragData | undefined
    const o = e.over?.data.current as ({ type: string; familleId: string; participantId?: string }) | undefined
    if (!a || !o || o.familleId === a.familleId) return
    try {
      await move.mutateAsync({ participantId: a.participantId, familleId: o.familleId }); toast.success('Membre déplacé')
    } catch (err) { toast.error(parseApiError(err)) }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{readOnly
          ? <>Choisissez deux familles (<b>A</b> et <b>B</b>) dans le tableau pour les comparer. Lecture seule.</>
          : <>Choisissez deux familles (<b>A</b> et <b>B</b>) dans le tableau, puis glissez-déposez un membre d'une famille à l'autre pour l'y déplacer.</>}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => printAllFamilles(campId).catch(async e => toast.error(await parseBlobError(e)))}><Printer className="mr-1 h-4 w-4" />Toutes les familles</Button>
          <Button variant="outline" size="sm" onClick={() => printUnitList(campId).catch(async e => toast.error(await parseBlobError(e)))}><Printer className="mr-1 h-4 w-4" />Liste par unité</Button>
          <Button variant="outline" size="sm" onClick={() => downloadPresenceList(campId).catch(async e => toast.error(await parseBlobError(e)))}><FileSpreadsheet className="mr-1 h-4 w-4" />Liste de présence</Button>
          <Button variant="outline" size="sm" onClick={() => setSupersOpen(true)}>Superfamilles</Button>
          {!readOnly && <Button onClick={() => setConfirmDraft(true)} disabled={draft.isPending}><Shuffle className="mr-1 h-4 w-4" />{draft.isPending ? 'Tirage…' : 'Lancer le tirage'}</Button>}
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        {/* Left: famille table */}
        <div className="lg:w-72 lg:shrink-0">
          <div className="max-h-[72vh] overflow-y-auto rounded-lg border">
            <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span className="w-14">Famille</span><span className="w-8 text-right">Eff.</span><span className="flex-1">Total des notes <span className="font-normal">· cible {target}</span></span>
            </div>
            {fl.map(f => {
              const gap = Math.round((tot(f) - target) * 10) / 10
              const low = gap < -tolerance, high = gap > tolerance
              const half = Math.min(50, (Math.abs(gap) / maxGap) * 50) // % of the whole track, on one side
              const isA = slotA === f.id, isB = slotB === f.id
              return (
                <button key={f.id} type="button" onClick={() => pickFamille(f.id)}
                  className={cn('flex w-full items-center gap-2 border-b px-3 py-2 text-left last:border-b-0', (isA || isB) ? 'bg-primary/10' : 'hover:bg-muted/40')}>
                  <span className="flex w-14 items-center gap-1.5">
                    {(isA || isB) && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{isA ? 'A' : 'B'}</span>}
                    <span className="min-w-0">
                      <span className="block text-base font-semibold leading-tight">F{f.number}</span>
                      {f.name && <span className="block truncate text-[11px] leading-tight text-muted-foreground">{f.name}</span>}
                    </span>
                  </span>
                  <span className="w-8 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{f.size}</span>
                  <span className="flex flex-1 items-center gap-2">
                    <span className="relative h-2.5 flex-1 rounded-full bg-muted">
                      <span className="absolute inset-y-[-3px] left-1/2 w-px bg-foreground/40" />
                      <span className={cn('absolute inset-y-0 rounded-full', low ? 'bg-blue-500' : high ? 'bg-amber-500' : 'bg-emerald-500')}
                        style={gap < 0 ? { right: '50%', width: `${Math.max(2, half)}%` } : { left: '50%', width: `${Math.max(2, half)}%` }} />
                    </span>
                    <Tip content={`${gap === 0 ? 'Pile sur la cible' : `${gap > 0 ? '+' : ''}${gap} par rapport à la cible (${target})`} · moyenne ${f.avgNote}`}>
                      <span className={cn('w-10 shrink-0 text-right text-sm font-medium tabular-nums', low && 'text-blue-600 dark:text-blue-400', high && 'text-amber-600 dark:text-amber-400')}>{tot(f)}</span>
                    </Tip>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: two columns with drag & drop */}
        <div className="min-w-0 flex-1">
          <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={e => setDrag(e.active.data.current as DragData)} onDragEnd={onDragEnd}>
            <div className="grid gap-3 md:grid-cols-2">
              {[famA, famB].map((f, i) => f
                ? <FamilleColumn key={f.id} campId={campId} f={f} label={i === 0 ? 'A' : 'B'} readOnly={readOnly} onEditLeaders={() => setLeaderDialog(f)} onEditInfo={() => setInfoDialog(f)} />
                : <div key={i} className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Sélectionnez une famille <b className="mx-1">{i === 0 ? 'A' : 'B'}</b> dans le tableau.
                  </div>)}
            </div>
            <DragOverlay>{drag ? <div className="rounded border bg-background px-2 py-1 text-sm font-medium shadow-lg">{drag.name}</div> : null}</DragOverlay>
          </DndContext>
        </div>
      </div>

      <ConfirmDialog open={confirmDraft} onOpenChange={setConfirmDraft} title="Lancer le tirage"
        description="Cela répartit (ou re-répartit) tous les membres notés dans les familles, en équilibrant note, effectif, branche et genre. Les déplacements manuels seront écrasés. Sans la case ci-dessous, les Pères/Mères déjà choisis restent en place."
        confirmLabel="Lancer" loading={draft.isPending} onConfirm={runDraft}>{leadersBox}</ConfirmDialog>

      {leaderDialog && <LeaderDialog campId={campId} famille={leaderDialog} onClose={() => setLeaderDialog(null)} />}
      {infoDialog && <FamilleInfoDialog campId={campId} famille={infoDialog} onClose={() => setInfoDialog(null)} />}
      {supersOpen && <SuperFamillesDialog campId={campId} readOnly={readOnly} onClose={() => setSupersOpen(false)} />}
    </div>
  )
}

function FamilleColumn({ campId, f, label, readOnly, onEditLeaders, onEditInfo }: { campId: string; f: CampFamilleDto; label: string; readOnly: boolean; onEditLeaders: () => void; onEditInfo: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${f.id}`, data: { type: 'col', familleId: f.id }, disabled: readOnly })
  return (
    <div ref={setNodeRef} className={cn('rounded-lg border transition-colors', isOver && 'ring-2 ring-primary')}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{label}</span>
          <div>
            <h3 className="flex items-center gap-1 font-semibold">
              Famille {f.number}{f.name && <span className="font-normal text-muted-foreground"> · {f.name}</span>}
              {!readOnly && <Tip content="Nom, description, superfamille"><Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEditInfo} aria-label="Modifier la famille"><Pencil className="h-3.5 w-3.5" /></Button></Tip>}
            </h3>
            {f.superFamilleName && <p className="text-xs text-muted-foreground">{f.superFamilleName}</p>}
            <p className="text-sm text-muted-foreground">{f.size} membres · total {Math.round(f.noteSum * 10) / 10} (moy. {f.avgNote}) · {f.boys}♂ {f.girls}♀</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={readOnly ? undefined : onEditLeaders} disabled={readOnly} className="flex items-center gap-1.5 rounded border px-2 py-1 text-xs enabled:hover:bg-muted/40 disabled:cursor-default">
            <Crown className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-muted-foreground">P:</span> <b>{f.pereName ?? '—'}</b>
            <span className="ml-1 text-muted-foreground">M:</span> <b>{f.mereName ?? '—'}</b>
          </button>
          <Tip content="Imprimer la famille (PDF)"><Button variant="outline" size="icon" className="h-7 w-7" aria-label="Imprimer la famille" onClick={() => printFamille(campId, f.number).catch(async e => toast.error(await parseBlobError(e)))}><Printer className="h-3.5 w-3.5" /></Button></Tip>
        </div>
      </div>
      <div className="max-h-[60vh] space-y-1 overflow-y-auto p-2">
        {f.members.length === 0 ? <p className="p-4 text-center text-sm text-muted-foreground">Famille vide — déposez des membres ici.</p> :
          [...f.members].sort((a, b) => (b.note ?? 0) - (a.note ?? 0)).map(m => <MemberCard key={m.participantId} m={m} familleId={f.id} readOnly={readOnly} />)}
      </div>
    </div>
  )
}

function MemberCard({ m, familleId, readOnly }: { m: CampFamilleDto['members'][number]; familleId: string; readOnly: boolean }) {
  const name = `${m.firstName} ${m.lastName}`
  // Draggable only — the drop target is the whole famille column (drop = move).
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `drag-${m.participantId}`, data: { participantId: m.participantId, familleId, name }, disabled: readOnly })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={cn('flex items-center gap-2 rounded border px-2 py-1.5 text-sm', !readOnly && 'touch-none cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40',
        m.gender === 'Féminin' ? 'border-l-2 border-l-pink-300 dark:border-l-pink-800' : 'border-l-2 border-l-blue-300 dark:border-l-blue-800')}>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{name} <span className="text-muted-foreground">{m.gender === 'Féminin' ? '♀' : '♂'}</span></div>
        <div className="truncate text-xs text-muted-foreground">{m.branche} · {m.unitCode ?? '—'}</div>
      </div>
      <span className="shrink-0 font-semibold tabular-nums">{m.note ?? '—'}</span>
    </div>
  )
}

function LeaderDialog({ campId, famille, onClose }: { campId: string; famille: CampFamilleDto; onClose: () => void }) {
  const { data: candidates } = useLeaderCandidates(campId)
  const setLeaders = useSetLeaders(campId)
  const [pere, setPere] = useState<string | null>(famille.pereMemberId)
  const [mere, setMere] = useState<string | null>(famille.mereMemberId)
  const [search, setSearch] = useState('')

  const filtered = (candidates ?? []).filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(search.toLowerCase()))
  const nameOf = (id: string) => { const c = (candidates ?? []).find(x => x.memberId === id); return c ? `${c.firstName} ${c.lastName}` : null }
  const save = async () => {
    try { await setLeaders.mutateAsync({ familleId: famille.id, pereMemberId: pere, mereMemberId: mere }); toast.success('Père / Mère enregistrés'); onClose() }
    catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Père / Mère — Famille {famille.number}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-muted px-2 py-1">Père : <b>{pere ? (nameOf(pere) ?? '✓') : '—'}</b></span>
            <span className="rounded bg-muted px-2 py-1">Mère : <b>{mere ? (nameOf(mere) ?? '✓') : '—'}</b></span>
            {(pere || mere) && <Button variant="ghost" size="sm" onClick={() => { setPere(null); setMere(null) }}>Effacer</Button>}
          </div>
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un membre…" />
          <div className="max-h-[40vh] space-y-1 overflow-y-auto">
            {filtered.map(c => {
              // Père = male only, Mère = female only — show just the gender-appropriate button (backend also enforces).
              const isMale = c.gender === 'Masculin', isFemale = c.gender === 'Féminin'
              return (
                <div key={c.memberId} className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm">
                  <span className="flex-1">{c.firstName} {c.lastName} <span className="text-xs text-muted-foreground">{c.gender === 'Masculin' ? '♂' : c.gender === 'Féminin' ? '♀' : ''} {c.branche}{c.flagged ? ' ★' : ''}</span></span>
                  {isMale && <Button size="sm" variant={pere === c.memberId ? 'default' : 'outline'} className="h-7" onClick={() => setPere(pere === c.memberId ? null : c.memberId)}>Père</Button>}
                  {isFemale && <Button size="sm" variant={mere === c.memberId ? 'default' : 'outline'} className="h-7" onClick={() => setMere(mere === c.memberId ? null : c.memberId)}>Mère</Button>}
                </div>
              )
            })}
            {filtered.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Aucun candidat.</p>}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={save} disabled={setLeaders.isPending}>{setLeaders.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Jeux ────────────────────────────────────────────────────────────────────
function GamesTab({ campId, readOnly }: { campId: string; readOnly: boolean }) {
  const { data: games, isLoading } = useCampGames(campId)
  const create = useCreateGame(campId)
  const del = useDeleteGame(campId)
  const [name, setName] = useState('')
  const [etapisteFor, setEtapisteFor] = useState<CampGameDto | null>(null)
  const [deletingGame, setDeletingGame] = useState<CampGameDto | null>(null)
  const [editingGame, setEditingGame] = useState<CampGameDto | null>(null)
  const [nameError, setNameError] = useState(false) // "Ajouter" clicked with an empty name
  const [autoOpen, setAutoOpen] = useState(false)

  const add = async () => {
    if (!name.trim()) { setNameError(true); return }
    try { await create.mutateAsync({ name, description: null }); setName(''); toast.success('Jeu ajouté') }
    catch (e) { toast.error(parseApiError(e)) }
  }

  if (isLoading) return <LoadingSpinner variant="cards" />
  return (
    <div className="max-w-4xl space-y-3">
      {readOnly && <Callout tone="muted">Lecture seule : les chefs de commission ne vous ont pas donné le droit de modifier les jeux.</Callout>}
      {!readOnly && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <Input value={name} aria-invalid={nameError}
              className={cn(nameError && 'border-destructive focus-visible:ring-destructive/30')}
              onChange={e => { setName(e.target.value); if (nameError) setNameError(false) }}
              onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="Nom du jeu / étape…" />
            <Tip content="Ajouter le jeu"><Button onClick={add} disabled={create.isPending} aria-label="Ajouter le jeu"><Plus className="h-4 w-4" /></Button></Tip>
          </div>
          {nameError && <p className="text-xs text-destructive">Saisissez un nom pour le jeu.</p>}
        </div>
      )}
      {!readOnly && (games ?? []).length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setAutoOpen(true)}><Wand2 className="mr-1.5 h-4 w-4" />Attribuer les lieux</Button>
        </div>
      )}
      {(games ?? []).length === 0 ? (
        <EmptyState icon={Gamepad2} title="Aucun jeu."
          action={!readOnly ? <Button onClick={add} disabled={create.isPending}><Plus className="mr-1.5 h-4 w-4" />Ajouter un jeu</Button> : undefined} />
      ) :
        <div className="space-y-3">{games!.map(g => (
          <GameCard key={g.id} campId={campId} game={g} readOnly={readOnly}
            onEdit={() => setEditingGame(g)} onEtapistes={() => setEtapisteFor(g)} onDelete={() => setDeletingGame(g)}
            onPrint={() => printGame(g.id, g.name).catch(async e => toast.error(await parseBlobError(e)))} />
        ))}</div>}
      {editingGame && <GameEditDialog campId={campId} game={editingGame} taken={(games ?? []).filter(x => x.id !== editingGame.id && x.number != null).map(x => x.number!)} onClose={() => setEditingGame(null)} />}
      {etapisteFor && <EtapisteDialog campId={campId} game={etapisteFor} onClose={() => setEtapisteFor(null)} />}
      {autoOpen && <AutoPlacesDialog campId={campId} onClose={() => setAutoOpen(false)} />}

      <ConfirmDialog open={!!deletingGame} onOpenChange={() => setDeletingGame(null)} title="Supprimer le jeu ?" variant="destructive"
        description={`Supprimer « ${deletingGame?.name} » et ses étapistes ?`} confirmLabel="Supprimer" loading={del.isPending}
        onConfirm={async () => { if (!deletingGame) return; try { await del.mutateAsync(deletingGame.id); toast.success('Jeu supprimé'); setDeletingGame(null) } catch (e) { toast.error(parseApiError(e)) } }} />
    </div>
  )
}

// True when a (possibly rich-text) description has visible text — an emptied TipTap editor leaves "<p></p>".
function hasText(html: string | null) {
  return !!html && html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0
}

// Edit a game's name + its formatted description (TipTap; shown sanitized on the game card).
function GameEditDialog({ campId, game, taken, onClose }: { campId: string; game: CampGameDto; taken: number[]; onClose: () => void }) {
  const update = useUpdateGame(campId)
  const { data: camp } = useCamp(campId)
  // Numbers of this camp's grid: 1 … familles / 2 (plus the game's current number if the count was lowered).
  const gameCount = Math.max(Math.floor((camp?.famillesCount ?? 0) / 2), game.number ?? 0)
  const [number, setNumber] = useState<number | null>(game.number)
  const [name, setName] = useState(game.name)
  const [description, setDescription] = useState(game.description ?? '')
  const [mainLocation, setMainLocation] = useState(game.mainLocation ?? '')
  const [backupLocation, setBackupLocation] = useState(game.backupLocation ?? '')
  const [hasBackupGame, setHasBackupGame] = useState(!!game.backupGameName)
  const [backupGameName, setBackupGameName] = useState(game.backupGameName ?? '')
  const [backupGameDescription, setBackupGameDescription] = useState(game.backupGameDescription ?? '')
  // The places are managed in Paramètres → Camp BP (camp.places): lieu A list = places usable as A, lieu B list = as B.
  // A value no longer in the list stays selectable (optionsWithCurrent).
  const places = parsePlaces(useSetting(PLACES_SETTING).data?.value)
  const opt = (p: CampPlace) => ({ value: p.name, label: `${p.name}${p.capacity > 1 ? ` · ${p.capacity} jeux` : ''}` })
  const placesA = places.filter(p => p.a).map(opt)
  const placesB = places.filter(p => p.b).map(opt)
  // A place marked both lieu A and lieu B in Paramètres is used for both sides of the game when picked on either.
  const both = (name: string) => places.some(p => p.a && p.b && p.name === name)
  const pickMain = (v: string) => { setMainLocation(v); if (v && both(v)) setBackupLocation(v) }
  const pickBackup = (v: string) => { setBackupLocation(v); if (v && both(v)) setMainLocation(v) }
  const save = async () => {
    if (!name.trim()) { toast.error('Saisissez un nom pour le jeu.'); return }
    if (hasBackupGame && !backupGameName.trim()) { toast.error('Saisissez le nom du jeu de repli.'); return }
    try {
      await update.mutateAsync({
        id: game.id, number, name: name.trim(), description: hasText(description) ? description : null, mainLocation: mainLocation || null, backupLocation: backupLocation || null,
        backupGameName: hasBackupGame ? backupGameName.trim() : null,
        backupGameDescription: hasBackupGame && hasText(backupGameDescription) ? backupGameDescription : null,
      })
      toast.success('Jeu enregistré'); onClose()
    } catch (e) { toast.error(parseApiError(e)) }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl">
        <DialogHeader><DialogTitle>Modifier le jeu</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <div className="space-y-1">
              <p className="text-sm font-medium">Numéro (grille)</p>
              <Select value={number == null ? NO_PLACE : String(number)} onValueChange={v => setNumber(v === NO_PLACE ? null : Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PLACE}>Aucun</SelectItem>
                  {Array.from({ length: gameCount }, (_, i) => i + 1).map(n => (
                    <SelectItem key={n} value={String(n)} disabled={taken.includes(n)}>Jeu {n}{taken.includes(n) ? ' (pris)' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <RequiredLabel required>Nom</RequiredLabel>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">Le numéro place le jeu dans la grille de rotation (jeu 1 à {gameCount}) : c'est ce qui donne son lieu à chaque famille.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <LocationSelect label="Lieu A" value={mainLocation} onChange={pickMain} options={optionsWithCurrent(placesA, mainLocation)} />
            <LocationSelect label="Lieu B (mauvais temps)" value={backupLocation} onChange={pickBackup} options={optionsWithCurrent(placesB, backupLocation)} />
          </div>
          {places.length === 0 && (
            <p className="text-xs text-muted-foreground">Aucun lieu défini : ajoutez les lieux des jeux dans Paramètres → Camp BP.</p>
          )}
          <div className="rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="h-4 w-4" checked={hasBackupGame} onChange={e => setHasBackupGame(e.target.checked)} />
              Ce jeu ne peut pas se jouer au lieu B : prévoir un jeu de repli
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground">En plan B, cette étape joue le jeu de repli (au lieu B) à la place de ce jeu.</p>
            {hasBackupGame && (
              <div className="mt-3 space-y-2">
                <div className="space-y-1">
                  <RequiredLabel required>Nom du jeu de repli</RequiredLabel>
                  <Input value={backupGameName} maxLength={150} onChange={e => setBackupGameName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Description du jeu de repli</p>
                  <RichTextEditor content={backupGameDescription} onChange={setBackupGameDescription} placeholder="Déroulement, règles, matériel…" className="min-h-[140px]" />
                </div>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Description</p>
            <RichTextEditor content={description} onChange={setDescription} placeholder="Déroulement, règles, matériel…" className="min-h-[220px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={update.isPending}><Save className="mr-1.5 h-4 w-4" />{update.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Auto-assign the games' places from Paramètres → Camp BP: lieu A, lieu B or both. In game-number order, each game
// gets the first place of the list that still has room (each place's capacity = games it hosts at once).
function AutoPlacesDialog({ campId, onClose }: { campId: string; onClose: () => void }) {
  const run = useAutoAssignPlaces(campId)
  const [side, setSide] = useState<'main' | 'backup' | 'both'>('both')
  const [replace, setReplace] = useState(false)
  const [result, setResult] = useState<CampPlacesAssignResult | null>(null)
  const go = async () => {
    try { setResult(await run.mutateAsync({ main: side !== 'backup', backup: side !== 'main', replace })) }
    catch (e) { toast.error(parseApiError(e)) }
  }
  const SIDES: { value: 'main' | 'backup' | 'both'; label: string }[] = [{ value: 'main', label: 'Lieu A' }, { value: 'backup', label: 'Lieu B' }, { value: 'both', label: 'Les deux' }]
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Attribuer les lieux</DialogTitle></DialogHeader>
        {!result ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Dans l'ordre des numéros, chaque jeu reçoit le premier lieu de la liste (Paramètres → Camp BP) qui a encore de la place.</p>
            <SegmentedToggle options={SIDES} value={side} onChange={setSide} />
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={replace} onChange={e => setReplace(e.target.checked)} />
              <span>Remplacer les lieux déjà choisis<span className="block text-xs text-muted-foreground">Sinon, seuls les jeux sans lieu en reçoivent un.</span></span>
            </label>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" />
              {side !== 'backup' && `${result.assignedMain} lieu(x) A`}{side === 'both' && ' · '}{side !== 'main' && `${result.assignedBackup} lieu(x) B`} attribué(s).</p>
            {result.noPlace.length > 0 && (
              <Callout tone="danger" title="Plus aucun lieu libre pour :">
                <ul className="list-disc pl-5 text-xs">{result.noPlace.map(t => <li key={t}>{t}</li>)}</ul>
                <p className="mt-1 text-xs">Ajoutez des lieux ou augmentez le nombre de jeux qu'un lieu accueille (Paramètres → Camp BP).</p>
              </Callout>
            )}
          </div>
        )}
        <DialogFooter>
          {!result
            ? <><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={go} disabled={run.isPending}>{run.isPending ? 'Attribution…' : 'Attribuer'}</Button></>
            : <Button onClick={onClose}>Fermer</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// One location picker ("Aucun" = not set). Radix Select can't hold an empty value, hence the sentinel.
const NO_PLACE = '__none__'
function LocationSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <Select value={value || NO_PLACE} onValueChange={v => onChange(v === NO_PLACE ? '' : v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PLACE}>Aucun</SelectItem>
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function EtapisteDialog({ campId, game, onClose }: { campId: string; game: CampGameDto; onClose: () => void }) {
  const { data: candidates } = useEtapisteCandidates(campId)
  const setEtapistes = useSetEtapistes(campId)
  const [selected, setSelected] = useState<Set<string>>(new Set(game.etapistes.map(e => e.memberId)))
  const [search, setSearch] = useState('')
  const filtered = (candidates ?? []).filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(search.toLowerCase()))

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const save = async () => {
    try { await setEtapistes.mutateAsync({ gameId: game.id, memberIds: [...selected] }); toast.success('Étapistes enregistrés'); onClose() }
    catch (e) { toast.error(parseApiError(e)) }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Étapistes — {game.name}</DialogTitle></DialogHeader>
        <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un membre…" />
        <div className="max-h-[50vh] space-y-3 overflow-y-auto">
          {/* Maîtrise first; the older youth (routiers / caravelles / JEM, only when the setting allows them) in their
              own section, each with an amber branch badge so they can't be mistaken for a chef. */}
          {[
            { key: 'maitrise', label: 'Maîtrise', items: filtered.filter(c => !c.isAine) },
            { key: 'aines', label: 'Aînés (routiers, caravelles, JEM)', items: filtered.filter(c => c.isAine) },
          ].filter(g => g.items.length > 0).map(g => (
            <div key={g.key} className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label} ({g.items.length})</p>
              {g.items.map(c => (
                <label key={c.memberId} className={cn('flex items-center gap-2 rounded border px-2 py-1.5 text-sm',
                  c.isAine && 'border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30')}>
                  <input type="checkbox" checked={selected.has(c.memberId)} onChange={() => toggle(c.memberId)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{c.firstName} {c.lastName}</span>
                    {c.roleName && <span className="block truncate text-xs text-muted-foreground">{c.roleName}</span>}
                  </span>
                  {c.isAine && <Badge variant="warning" className="shrink-0">{c.branch}</Badge>}
                  <span className="shrink-0 text-xs text-muted-foreground">{c.unitCode}</span>
                </label>
              ))}
            </div>
          ))}
          {filtered.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Aucun membre trouvé.</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={save} disabled={setEtapistes.isPending}>{setEtapistes.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
