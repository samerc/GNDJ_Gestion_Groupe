import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router'
import {
  useCamp, useUpdateCamp, useArchiveCamp, useDeleteCamp,
  useCampFamilles, useRunDraft, useMoveParticipant, useSwapParticipants, useSetLeaders, useLeaderCandidates,
  useCampGames, useCreateGame, useDeleteGame, useSetEtapistes, useEtapisteCandidates,
  type CampFamilleDto, type CampGameDto,
} from '@/services/camp-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DndContext, DragOverlay, useDraggable, useDroppable, pointerWithin, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { RequiredLabel } from '@/components/shared/required-label'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { cn } from '@/lib/utils'
import { Tent, ArrowLeft, Shuffle, Save, Trash2, Crown, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'

export default function CampDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { data: camp, isLoading } = useCamp(id)

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner /></div>
  if (!camp) return <p className="p-8 text-center text-sm text-muted-foreground">Camp introuvable.</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/admin/camps" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" />Tous les camps</Link>
          <h1 className="flex items-center gap-2 text-xl font-bold"><Tent className="h-5 w-5 text-primary" />{camp.name}</h1>
          <p className="text-sm text-muted-foreground">{camp.scoutYear} · {camp.participantCount} membres · {camp.gradedCount} notés · {camp.assignedCount} affectés</p>
        </div>
      </div>

      <Tabs defaultValue="familles">
        <TabsList>
          <TabsTrigger value="familles">Familles</TabsTrigger>
          <TabsTrigger value="jeux">Jeux</TabsTrigger>
          <TabsTrigger value="parametres">Paramètres</TabsTrigger>
        </TabsList>
        <TabsContent value="familles" className="mt-4"><FamillesTab campId={id} /></TabsContent>
        <TabsContent value="jeux" className="mt-4"><GamesTab campId={id} /></TabsContent>
        <TabsContent value="parametres" className="mt-4"><SettingsTab campId={id} /></TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Paramètres (formula) ────────────────────────────────────────────────────
function SettingsTab({ campId }: { campId: string }) {
  const { data: camp } = useCamp(campId)
  const update = useUpdateCamp(campId)
  const archive = useArchiveCamp()
  const del = useDeleteCamp()
  const [form, setForm] = useState({ name: '', scoutYear: '', famillesCount: 0, noteForceCoef: 1, noteOffset: -4 })
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!camp) return
    setForm({ name: camp.name, scoutYear: camp.scoutYear, famillesCount: camp.famillesCount, noteForceCoef: camp.noteForceCoef, noteOffset: camp.noteOffset })
  }, [camp])

  if (!camp) return null
  const save = async () => {
    try {
      await update.mutateAsync(form)
      toast.success('Paramètres enregistrés')
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2"><RequiredLabel required>Nom</RequiredLabel><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
        <div className="space-y-1"><RequiredLabel required>Année scoute</RequiredLabel><Input value={form.scoutYear} onChange={e => setForm(f => ({ ...f, scoutYear: e.target.value }))} /></div>
        <div className="space-y-1"><RequiredLabel>Nombre de familles</RequiredLabel><Input type="number" min={1} value={form.famillesCount} onChange={e => setForm(f => ({ ...f, famillesCount: Number(e.target.value) }))} /></div>
      </div>

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

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={update.isPending}><Save className="mr-1 h-4 w-4" />Enregistrer</Button>
        <Button variant="outline" onClick={() => archive.mutate({ id: campId, archive: !camp.isArchived })}>{camp.isArchived ? 'Désarchiver' : 'Archiver'}</Button>
        <Button variant="ghost" className="text-destructive" onClick={() => setDeleting(true)}><Trash2 className="mr-1 h-4 w-4" />Supprimer</Button>
      </div>

      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Supprimer le camp" variant="destructive"
        description={`Supprimer « ${camp.name} » et toutes ses données (familles, notes, jeux) ? Irréversible.`} confirmLabel="Supprimer"
        onConfirm={async () => { try { await del.mutateAsync(campId); toast.success('Camp supprimé'); window.location.href = '/admin/camps' } catch (e) { toast.error(parseApiError(e)) } }} />
    </div>
  )
}

// ─── Familles board: famille table + two-pane drag & drop ────────────────────
type DragData = { participantId: string; familleId: string; name: string }

function FamillesTab({ campId }: { campId: string }) {
  const { data: familles, isLoading } = useCampFamilles(campId)
  const draft = useRunDraft(campId)
  const move = useMoveParticipant(campId)
  const swap = useSwapParticipants(campId)
  const [confirmDraft, setConfirmDraft] = useState(false)
  const [slotA, setSlotA] = useState<string | null>(null)
  const [slotB, setSlotB] = useState<string | null>(null)
  const [leaderDialog, setLeaderDialog] = useState<CampFamilleDto | null>(null)
  const [drag, setDrag] = useState<DragData | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    if (!familles || familles.length === 0) return
    if (!slotA || !familles.some(f => f.id === slotA)) setSlotA(familles[0].id)
    if ((!slotB || !familles.some(f => f.id === slotB)) && familles.length > 1) setSlotB(familles[1].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familles])

  if (isLoading) return <div className="flex h-40 items-center justify-center"><LoadingSpinner /></div>
  if ((familles ?? []).length === 0) return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button onClick={() => setConfirmDraft(true)} disabled={draft.isPending}><Shuffle className="mr-1 h-4 w-4" />Lancer le tirage</Button></div>
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Aucune famille. Lancez le tirage pour les créer et répartir les membres.</p>
      <ConfirmDialog open={confirmDraft} onOpenChange={setConfirmDraft} title="Lancer le tirage" confirmLabel="Lancer"
        description="Répartit tous les membres notés dans les familles (équilibre note/effectif/branche/genre)."
        onConfirm={async () => { try { await draft.mutateAsync(); toast.success('Tirage effectué') } catch (e) { toast.error(parseApiError(e)) } }} />
    </div>
  )

  const fl = familles!
  const avgs = fl.filter(f => f.size > 0).map(f => f.avgNote)
  const minA = avgs.length ? Math.min(...avgs) : 0
  const maxA = avgs.length ? Math.max(...avgs) : 1
  const famA = fl.find(f => f.id === slotA) ?? null
  const famB = fl.find(f => f.id === slotB) ?? null

  const pickFamille = (id: string) => {
    if (id === slotA) setSlotA(null)
    else if (id === slotB) setSlotB(null)
    else if (!slotA) setSlotA(id)
    else if (!slotB) setSlotB(id)
    else { setSlotA(id); setSlotB(null) }
  }

  const onDragEnd = async (e: DragEndEvent) => {
    setDrag(null)
    const a = e.active.data.current as DragData | undefined
    const o = e.over?.data.current as ({ type: string; familleId: string; participantId?: string }) | undefined
    if (!a || !o || o.familleId === a.familleId) return
    try {
      if (o.type === 'member' && o.participantId) { await swap.mutateAsync({ participantAId: a.participantId, participantBId: o.participantId }); toast.success('Échangés') }
      else { await move.mutateAsync({ participantId: a.participantId, familleId: o.familleId }); toast.success('Déplacé') }
    } catch (err) { toast.error(parseApiError(err)) }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Choisissez deux familles (<b>A</b> et <b>B</b>) dans le tableau, puis glissez-déposez un membre d'une famille à l'autre (ou sur un membre pour échanger).</p>
        <Button onClick={() => setConfirmDraft(true)} disabled={draft.isPending}><Shuffle className="mr-1 h-4 w-4" />{draft.isPending ? 'Tirage…' : 'Lancer le tirage'}</Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        {/* Left: famille table */}
        <div className="lg:w-72 lg:shrink-0">
          <div className="max-h-[72vh] overflow-y-auto rounded-lg border">
            <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span className="w-14">Famille</span><span className="w-8 text-right">Eff.</span><span className="flex-1">Moyenne</span>
            </div>
            {fl.map(f => {
              const pct = maxA > minA ? Math.round(((f.avgNote - minA) / (maxA - minA)) * 100) : 50
              const low = f.size > 0 && f.avgNote === minA, high = f.size > 0 && f.avgNote === maxA && minA !== maxA
              const isA = slotA === f.id, isB = slotB === f.id
              return (
                <button key={f.id} type="button" onClick={() => pickFamille(f.id)}
                  className={cn('flex w-full items-center gap-2 border-b px-3 py-2 text-left last:border-b-0', (isA || isB) ? 'bg-primary/10' : 'hover:bg-muted/40')}>
                  <span className="flex w-14 items-center gap-1.5">
                    {(isA || isB) && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{isA ? 'A' : 'B'}</span>}
                    <span className="text-base font-semibold">F{f.number}</span>
                  </span>
                  <span className="w-8 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{f.size}</span>
                  <span className="flex flex-1 items-center gap-2">
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className={cn('block h-full rounded-full', low ? 'bg-blue-500' : high ? 'bg-amber-500' : 'bg-primary/60')} style={{ width: `${Math.max(6, pct)}%` }} />
                    </span>
                    <span className={cn('w-8 shrink-0 text-right text-sm font-medium tabular-nums', low && 'text-blue-600', high && 'text-amber-600')}>{f.avgNote}</span>
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
                ? <FamilleColumn key={f.id} f={f} label={i === 0 ? 'A' : 'B'} onEditLeaders={() => setLeaderDialog(f)} />
                : <div key={i} className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Sélectionnez une famille <b className="mx-1">{i === 0 ? 'A' : 'B'}</b> dans le tableau.
                  </div>)}
            </div>
            <DragOverlay>{drag ? <div className="rounded border bg-background px-2 py-1 text-sm font-medium shadow-lg">{drag.name}</div> : null}</DragOverlay>
          </DndContext>
        </div>
      </div>

      <ConfirmDialog open={confirmDraft} onOpenChange={setConfirmDraft} title="Lancer le tirage"
        description="Cela répartit (ou re-répartit) tous les membres notés dans les familles, en équilibrant note, effectif, branche et genre. Les Pères/Mères restent en place. Les déplacements manuels seront écrasés. Continuer ?"
        confirmLabel="Lancer" onConfirm={async () => { try { await draft.mutateAsync(); toast.success('Tirage effectué') } catch (e) { toast.error(parseApiError(e)) } }} />

      {leaderDialog && <LeaderDialog campId={campId} famille={leaderDialog} onClose={() => setLeaderDialog(null)} />}
    </div>
  )
}

function FamilleColumn({ f, label, onEditLeaders }: { f: CampFamilleDto; label: string; onEditLeaders: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${f.id}`, data: { type: 'col', familleId: f.id } })
  return (
    <div ref={setNodeRef} className={cn('rounded-lg border transition-colors', isOver && 'ring-2 ring-primary')}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{label}</span>
          <div>
            <h3 className="font-semibold">Famille {f.number}</h3>
            <p className="text-sm text-muted-foreground">{f.size} membres · moy. {f.avgNote} · {f.boys}♂ {f.girls}♀</p>
          </div>
        </div>
        <button type="button" onClick={onEditLeaders} className="flex items-center gap-1.5 rounded border px-2 py-1 text-xs hover:bg-muted/40">
          <Crown className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-muted-foreground">P:</span> <b>{f.pereName ?? '—'}</b>
          <span className="ml-1 text-muted-foreground">M:</span> <b>{f.mereName ?? '—'}</b>
        </button>
      </div>
      <div className="max-h-[60vh] space-y-1 overflow-y-auto p-2">
        {f.members.length === 0 ? <p className="p-4 text-center text-sm text-muted-foreground">Famille vide — déposez des membres ici.</p> :
          [...f.members].sort((a, b) => (b.note ?? 0) - (a.note ?? 0)).map(m => <MemberCard key={m.participantId} m={m} familleId={f.id} />)}
      </div>
    </div>
  )
}

function MemberCard({ m, familleId }: { m: CampFamilleDto['members'][number]; familleId: string }) {
  const name = `${m.firstName} ${m.lastName}`
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({ id: `drag-${m.participantId}`, data: { participantId: m.participantId, familleId, name } })
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `drop-${m.participantId}`, data: { type: 'member', familleId, participantId: m.participantId } })
  return (
    <div ref={el => { dragRef(el); dropRef(el) }} {...listeners} {...attributes}
      className={cn('flex cursor-grab items-center gap-2 rounded border px-2 py-1.5 text-sm active:cursor-grabbing',
        isDragging && 'opacity-40', isOver && 'ring-2 ring-primary',
        m.gender === 'Féminin' ? 'border-l-2 border-l-pink-300' : 'border-l-2 border-l-blue-300')}>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{name} <span className="text-muted-foreground">{m.gender === 'Féminin' ? '♀' : '♂'}</span></div>
        <div className="truncate text-xs text-muted-foreground">{m.branche} · {m.unitName ?? '—'}</div>
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
    try { await setLeaders.mutateAsync({ familleId: famille.id, pereMemberId: pere, mereMemberId: mere }); toast.success('Enregistré'); onClose() }
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
          <Input placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="max-h-[40vh] space-y-1 overflow-y-auto">
            {filtered.map(c => {
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
        <DialogFooter><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={save} disabled={setLeaders.isPending}>Enregistrer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Jeux ────────────────────────────────────────────────────────────────────
function GamesTab({ campId }: { campId: string }) {
  const { data: games, isLoading } = useCampGames(campId)
  const create = useCreateGame(campId)
  const del = useDeleteGame(campId)
  const [name, setName] = useState('')
  const [etapisteFor, setEtapisteFor] = useState<CampGameDto | null>(null)

  const add = async () => {
    if (!name.trim()) return
    try { await create.mutateAsync({ name, description: null }); setName(''); toast.success('Jeu ajouté') }
    catch (e) { toast.error(parseApiError(e)) }
  }

  if (isLoading) return <div className="flex h-40 items-center justify-center"><LoadingSpinner /></div>
  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex gap-2">
        <Input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="Nom du jeu / étape…" />
        <Button onClick={add}><Plus className="h-4 w-4" /></Button>
      </div>
      {(games ?? []).length === 0 ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Aucun jeu.</p> :
        <div className="space-y-2">{games!.map(g => (
          <div key={g.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{g.name}</p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setEtapisteFor(g)}><Users className="mr-1 h-3.5 w-3.5" />Étapistes ({g.etapistes.length})</Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => del.mutate(g.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            {g.etapistes.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{g.etapistes.map(e => `${e.firstName} ${e.lastName}`).join(', ')}</p>}
          </div>
        ))}</div>}
      {etapisteFor && <EtapisteDialog campId={campId} game={etapisteFor} onClose={() => setEtapisteFor(null)} />}
    </div>
  )
}

function EtapisteDialog({ campId, game, onClose }: { campId: string; game: CampGameDto; onClose: () => void }) {
  const { data: candidates } = useEtapisteCandidates(campId)
  const setEtapistes = useSetEtapistes(campId)
  const [selected, setSelected] = useState<Set<string>>(new Set(game.etapistes.map(e => e.memberId)))
  const [search, setSearch] = useState('')
  const filtered = (candidates ?? []).filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(search.toLowerCase()))

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const save = async () => {
    try { await setEtapistes.mutateAsync({ gameId: game.id, memberIds: [...selected] }); toast.success('Étapistes enregistrés'); onClose() }
    catch (e) { toast.error(parseApiError(e)) }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Étapistes — {game.name}</DialogTitle></DialogHeader>
        <Input placeholder="Rechercher un chef…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {filtered.map(c => (
            <label key={c.memberId} className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm">
              <input type="checkbox" checked={selected.has(c.memberId)} onChange={() => toggle(c.memberId)} />
              <span className="flex-1">{c.firstName} {c.lastName}</span>
              <span className="text-xs text-muted-foreground">{c.unitName}</span>
            </label>
          ))}
          {filtered.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Aucun chef trouvé.</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={save} disabled={setEtapistes.isPending}>Enregistrer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
