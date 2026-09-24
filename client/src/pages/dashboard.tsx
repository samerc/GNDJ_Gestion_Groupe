import { useMemo, useState, lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Link } from 'react-router'
import { PwaInstallCard } from '@/components/shared/pwa-install'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import type { UnitAccess } from '@/types/auth'
import { useAdminDashboard, useDashboardOverview, useDashboardLayout, useUpdateDashboardLayout, type DashboardOverviewDto, type AdminDashboardDto } from '@/services/dashboard-service'
import { useCurrentScoutYear } from '@/hooks/use-scout-year'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { BirthdaysCard } from '@/components/shared/birthdays-card'
import { EmptyState } from '@/components/shared/empty-state'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { useUpcomingBirthdays } from '@/services/member-service'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { DEFAULT_LAYOUT, WIDGET_META, WIDTH_COLSPAN, mergeLayout, serializeLayout, type WidgetConfig, type WidgetId, type WidgetWidth } from '@/lib/dashboard-layout'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
// Lazy-loaded: the unit-leader dashboard pulls in the whole member-detail panel + trombinoscope/roster/export
// dialogs + report-service. Loading it eagerly would bundle all of that into the dashboard LANDING chunk — dead
// weight for a super-admin/CG who only sees the group overview. Split it out so it loads only when a unit leader
// actually opens their roster.
const UnitLeaderDashboard = lazy(() => import('@/pages/dashboard-unit-leader'))
import {
  Users, UserCheck, FileX, Receipt, UserMinus, Calendar,
  Inbox, ClipboardCheck, ArrowRightLeft, FileClock, PauseCircle, UserPlus,
  TrendingUp, TrendingDown, Minus, ChevronRight, CheckCircle2, ListChecks,
  GripVertical, Eye, EyeOff, SlidersHorizontal, RotateCcw, Check, LayoutDashboard,
} from 'lucide-react'

// ─── Horizontal bar chart ──────────────────
// One labelled row: a slim rounded gradient bar (width = value/max) with the value aligned to the right, so it's
// always readable regardless of bar length. `color` supplies the gradient stops (e.g. "from-primary to-primary/70").
// An optional `suffix` (e.g. doc compliance) sits at the far right and hides on a very narrow card.
function ChartBar({ value, max, color, label, suffix }: { value: number; max: number; color: string; label: string; suffix?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="group flex items-center gap-2.5 py-1">
      <span className="w-16 shrink-0 text-right text-xs font-medium text-muted-foreground">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted/60">
        <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-[width] duration-700 ease-out`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-sm font-semibold tabular-nums">{value}</span>
      {suffix !== undefined && <span className="w-20 shrink-0 text-right text-[10px] text-muted-foreground @max-xs:hidden">{suffix}</span>}
    </div>
  )
}

// ─── Small progress bar (done / total) ──────────────
function MiniProgress({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${total > 0 ? Math.max(pct, 2) : 0}%` }} />
    </div>
  )
}

// ─── "À traiter" action strip ──────────────
// Only surfaces items that actually need the CG's attention (count > 0); each is a one-click link to its page.
// When everything is clear, shows a reassuring "tout est à jour" note instead of empty cards.
function ActionHub({ o }: { o: DashboardOverviewDto }) {
  const items = [
    { key: 'demandes', label: 'Demandes en attente', count: o.pendingDemandes, icon: Inbox, to: '/admin/demandes', tone: 'amber' },
    { key: 'changes', label: 'Modifications à valider', count: o.pendingChangeRequests, icon: ClipboardCheck, to: '/change-requests', tone: 'amber' },
    { key: 'passages', label: 'Passages à finaliser', count: o.passagesToFinalize, icon: ArrowRightLeft, to: '/admin/passage-validation', tone: 'amber' },
    { key: 'docs', label: 'Documents à vérifier', count: o.pendingDocuments, icon: FileClock, to: '/admin/documents-suivi', tone: 'amber' },
    { key: 'hold', label: 'Membres suspendus', count: o.membersOnHold, icon: PauseCircle, to: '/admin/documents-suivi', tone: 'red' },
  ].filter((i) => i.count > 0)

  if (items.length === 0) {
    return (
      <Card className="border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/30">
        <CardContent className="flex items-center gap-3 py-4">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
          <p className="text-sm font-medium text-green-800 dark:text-green-300">Tout est à jour — rien en attente de votre part.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Inbox className="h-4 w-4 text-primary" />À traiter</CardTitle></CardHeader>
      <CardContent>
        {/* @container + @md/@2xl breakpoints respond to the CARD's width (not the viewport), so the tiles stay
            readable whatever width the user gives this widget or however small the screen is: 1 column when
            narrow, 2 then 3 as the card widens. Labels wrap (no truncate) so they never disappear. */}
        <div className="@container">
          <div className="grid gap-2.5 @md:grid-cols-2 @2xl:grid-cols-3">
            {items.map((i) => {
              const Icon = i.icon
              const red = i.tone === 'red'
              return (
                <Link key={i.key} to={i.to} className={`group flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors ${red ? 'border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/30 hover:bg-red-50 dark:hover:bg-red-950/40' : 'border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 hover:bg-amber-50 dark:hover:bg-amber-950/40'}`}>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${red ? 'bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xl font-bold leading-none ${red ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>{i.count}</p>
                    <p className="mt-0.5 text-xs font-medium leading-tight text-foreground/80">{i.label}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
                </Link>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Individual overview widgets (each placeable/hideable on the customizable dashboard) ──────────────
// Each returns a self-contained Card (h-full so it fills its grid cell); the grid cell controls the width.

function CampaignPanel({ o }: { o: DashboardOverviewDto }) {
  const c = o.campaign
  return (
    <Link to="/admin/demandes" className="group block h-full">
      <Card className="h-full transition-all duration-200 group-hover:border-primary/40 group-hover:shadow-lg motion-safe:group-hover:-translate-y-0.5">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" />Campagne d'inscription</CardTitle>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${c.enabled ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300' : 'bg-muted text-muted-foreground'}`}>{c.enabled ? 'Inscriptions ouvertes' : 'Fermées'}</span>
        </CardHeader>
        <CardContent>
          {c.total === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Aucune demande {c.enabled ? 'pour le moment' : 'cette année'}.</p>
          ) : (
            <>
              {/* @container: 6 across only when the card is wide enough (full width); otherwise 3×2 — so the
                  numbers never cram together at half/third width or on a small screen. */}
              <div className="@container">
                <div className="grid grid-cols-3 gap-x-2 gap-y-3 @xl:grid-cols-6">
                  {[
                    { label: 'Reçues', value: c.total, cls: '' },
                    { label: 'À traiter', value: c.pending, cls: c.pending > 0 ? 'text-amber-600 dark:text-amber-400' : '' },
                    { label: 'Acceptées', value: c.approved, cls: 'text-green-600 dark:text-green-400' },
                    { label: 'Refusées', value: c.declined, cls: 'text-red-600 dark:text-red-400' },
                    { label: 'Envoyées', value: c.responsesSent, cls: 'text-blue-600 dark:text-blue-400' },
                    { label: "Taux d'accept.", value: `${c.acceptanceRate}%`, cls: '' },
                  ].map((s) => (
                    <div key={s.label} className="min-w-0">
                      <p className={`text-2xl font-bold leading-none ${s.cls}`}>{s.value}</p>
                      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <MiniProgress value={c.decided} total={c.total} color="bg-primary" />
                <p className="mt-1 text-[11px] text-muted-foreground">{c.decided} / {c.total} décidées</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

function EffectifPanel({ o }: { o: DashboardOverviewDto }) {
  const delta = o.membersThisYear - o.membersLastYear
  const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  return (
    <Link to="/members" className="group block h-full">
      <Card className="h-full transition-all duration-200 group-hover:border-primary/40 group-hover:shadow-lg motion-safe:group-hover:-translate-y-0.5">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Effectif</CardTitle></CardHeader>
        <CardContent>
          <p className="text-3xl font-bold leading-none">{o.membersThisYear}</p>
          <p className="mt-1 text-xs text-muted-foreground">membres actifs — {o.thisYear}</p>
          <div className={`mt-3 flex items-center gap-1.5 text-sm font-medium ${delta > 0 ? 'text-green-600 dark:text-green-400' : delta < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
            <TrendIcon className="h-4 w-4" />
            <span>{delta > 0 ? '+' : ''}{delta}</span>
            <span className="font-normal text-muted-foreground">vs {o.lastYear} ({o.membersLastYear})</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function RentreePanel({ o }: { o: DashboardOverviewDto }) {
  return (
    <Link to="/rentree" className="group block h-full">
      <Card className="h-full transition-all duration-200 group-hover:border-primary/40 group-hover:shadow-lg motion-safe:group-hover:-translate-y-0.5">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" />Rentrée scoute</CardTitle></CardHeader>
        <CardContent>
          {o.rentree ? (
            <>
              <p className="text-2xl font-bold leading-none">{o.rentree.done}<span className="text-base font-normal text-muted-foreground"> / {o.rentree.total}</span></p>
              <p className="mt-1 text-xs text-muted-foreground">tâches terminées</p>
              <div className="mt-3"><MiniProgress value={o.rentree.done} total={o.rentree.total} color="bg-teal-500" /></div>
            </>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">Aucune liste générée pour {o.thisYear}.</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

function CotisationsPanel({ o }: { o: DashboardOverviewDto }) {
  const cot = o.cotisations
  return (
    <Link to="/admin/cotisations" className="group block h-full">
      <Card className="h-full transition-all duration-200 group-hover:border-primary/40 group-hover:shadow-lg motion-safe:group-hover:-translate-y-0.5">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" />Cotisations</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <div>
              <p className="text-2xl font-bold leading-none text-green-600 dark:text-green-400">{cot.paid}<span className="text-base font-normal text-muted-foreground"> / {cot.total}</span></p>
              <p className="mt-1 text-xs text-muted-foreground">membres à jour</p>
            </div>
            {cot.unpaid > 0 && <div className="text-sm text-red-600 dark:text-red-400"><span className="font-bold">{cot.unpaid}</span> à relancer</div>}
            {cot.exempt > 0 && <div className="text-sm text-muted-foreground"><span className="font-bold">{cot.exempt}</span> exemptés</div>}
          </div>
          <div className="mt-3"><MiniProgress value={cot.paid} total={cot.total} color="bg-green-500" /></div>
        </CardContent>
      </Card>
    </Link>
  )
}

// ─── Year-scoped widgets (driven by the year selector) ──────────────
function KeyNumbers({ data }: { data: AdminDashboardDto }) {
  return (
    // @container: 1 col when very narrow, 2, then 4 as the card widens — respects the card's chosen width
    // instead of the viewport, so the four numbers never crush together at half/third width.
    <div className="@container">
    <div className="grid gap-3 grid-cols-1 @xs:grid-cols-2 @2xl:grid-cols-4">
      <Card>
        <CardContent className="flex items-center gap-3 pt-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400"><Users className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{data.totalMembers}</p><p className="text-xs text-muted-foreground">Membres</p></div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center gap-3 pt-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 shrink-0"><UserCheck className="h-5 w-5" /></div>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <div><p className="text-2xl font-bold">{data.boys}</p><p className="text-xs text-muted-foreground">Garçons</p></div>
            <span className="text-muted-foreground/50">/</span>
            <div><p className="text-2xl font-bold">{data.girls}</p><p className="text-xs text-muted-foreground">Filles</p></div>
            {data.ungendered > 0 && (<><span className="text-muted-foreground/50">/</span><div><p className="text-2xl font-bold text-muted-foreground">{data.ungendered}</p><p className="text-xs text-muted-foreground">N.R.</p></div></>)}
          </div>
        </CardContent>
      </Card>
      <Card className={data.missingDocuments > 0 ? 'border-orange-200 dark:border-orange-900' : ''}>
        <CardContent className="flex items-center gap-3 pt-6">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${data.missingDocuments > 0 ? 'bg-orange-100 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400' : 'bg-green-100 dark:bg-green-950/50 text-green-600 dark:text-green-400'}`}><FileX className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{data.missingDocuments}</p><p className="text-xs text-muted-foreground">Docs manquants</p></div>
        </CardContent>
      </Card>
      <Card className={data.unpaidCotisations > 0 ? 'border-red-200 dark:border-red-900' : ''}>
        <CardContent className="flex items-center gap-3 pt-6">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${data.unpaidCotisations > 0 ? 'bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400' : 'bg-green-100 dark:bg-green-950/50 text-green-600 dark:text-green-400'}`}><Receipt className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{data.unpaidCotisations}</p><p className="text-xs text-muted-foreground">Cotis. impayées</p></div>
        </CardContent>
      </Card>
    </div>
    </div>
  )
}

function UnitChart({ data, max }: { data: AdminDashboardDto; max: number }) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3"><CardTitle className="text-base">Membres par unité</CardTitle></CardHeader>
      <CardContent className="@container space-y-1">
        {data.unitBreakdown.map(u => (
          <ChartBar key={u.unitCode} value={u.memberCount} max={max} color="from-primary to-primary/70" label={u.unitCode} suffix={`${u.docCompliance}% complets`} />
        ))}
        {data.membersWithoutUnit > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t text-sm text-muted-foreground">
            <UserMinus className="h-3.5 w-3.5" />
            <span>{data.membersWithoutUnit} membre{data.membersWithoutUnit > 1 ? 's' : ''} sans unité</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AgeChart({ data, max }: { data: AdminDashboardDto; max: number }) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3"><CardTitle className="text-base">Répartition par âge</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        {data.ageGroups.map(g => (
          <ChartBar key={g.label} value={g.count} max={max} color="from-indigo-500 to-violet-500" label={g.label} />
        ))}
      </CardContent>
    </Card>
  )
}

// Renders one widget by id. `o` (overview) may still be loading → those widgets render nothing until it arrives;
// `data` (year stats) is guaranteed by the page-level guard before the grid renders.
function renderWidget(id: WidgetId, o: DashboardOverviewDto | undefined, data: AdminDashboardDto, maxUnit: number, maxAge: number) {
  switch (id) {
    case 'actions': return o ? <ActionHub o={o} /> : null
    case 'campaign': return o ? <CampaignPanel o={o} /> : null
    case 'effectif': return o ? <EffectifPanel o={o} /> : null
    case 'rentree': return o ? <RentreePanel o={o} /> : null
    case 'cotisations': return o ? <CotisationsPanel o={o} /> : null
    case 'birthdays': return <BirthdaysCard />
    case 'keyNumbers': return <KeyNumbers data={data} />
    case 'unitChart': return <UnitChart data={data} max={maxUnit} />
    case 'ageChart': return <AgeChart data={data} max={maxAge} />
    default: return null
  }
}

// ─── Customize mode: a sortable list of ALL widgets (drag to reorder · show/hide · width) ──────────────
const WIDTH_LABELS: { value: WidgetWidth; label: string }[] = [
  { value: 'full', label: 'Pleine largeur' },
  { value: 'half', label: 'Moitié' },
  { value: 'third', label: 'Tiers' },
]

function SortableWidgetRow({ w, onToggle, onWidth }: { w: WidgetConfig; onToggle: () => void; onWidth: (width: WidgetWidth) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style} className={cn('flex items-center gap-2 rounded-lg border bg-card p-2.5', !w.visible && 'opacity-60')}>
      <button type="button" className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing" {...attributes} {...listeners} aria-label="Déplacer">
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 min-w-0 truncate text-sm font-medium">{WIDGET_META[w.id].label}</span>
      <Select value={w.width} onValueChange={(v) => onWidth(v as WidgetWidth)}>
        <SelectTrigger className="h-8 w-32 text-xs" disabled={!w.visible}><SelectValue /></SelectTrigger>
        <SelectContent>
          {WIDTH_LABELS.map(x => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={onToggle}>
        {w.visible ? <Eye className="h-4 w-4 text-primary" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
        <span className="hidden sm:inline text-xs">{w.visible ? 'Affiché' : 'Masqué'}</span>
      </Button>
    </div>
  )
}

function DashboardEditor({ layout, setLayout, onDone, onCancel, onReset, saving }: {
  layout: WidgetConfig[]; setLayout: (l: WidgetConfig[]) => void
  onDone: () => void; onCancel: () => void; onReset: () => void; saving: boolean
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = layout.findIndex(w => w.id === active.id)
    const to = layout.findIndex(w => w.id === over.id)
    if (from >= 0 && to >= 0) setLayout(arrayMove(layout, from, to))
  }
  const update = (id: WidgetId, patch: Partial<WidgetConfig>) => setLayout(layout.map(w => w.id === id ? { ...w, ...patch } : w))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Personnaliser le tableau de bord</h1>
          <p className="text-sm text-muted-foreground">Glissez pour réorganiser · affichez/masquez · choisissez la largeur.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={onReset}><RotateCcw className="h-4 w-4" />Réinitialiser</Button>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Annuler</Button>
          <Button size="sm" className="gap-1.5" onClick={onDone} disabled={saving}><Check className="h-4 w-4" />{saving ? 'Enregistrement…' : 'Terminé'}</Button>
        </div>
      </div>
      <Card>
        <CardContent className="space-y-2 pt-6">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={layout.map(w => w.id)} strategy={verticalListSortingStrategy}>
              {layout.map(w => (
                <SortableWidgetRow key={w.id} w={w} onToggle={() => update(w.id, { visible: !w.visible })} onWidth={(width) => update(w.id, { width })} />
              ))}
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>
    </div>
  )
}

// Group-wide overview shown to super-admins and Chefs de Groupe: key counts, members-by-unit
// and age-distribution charts, all scoped to the selected scout year (every tile is year-aware).
function AdminDashboard() {
  // Default the year selector to the active scout year (follows the passage year).
  const currentScoutYear = useCurrentScoutYear()
  const [scoutYear, setScoutYear] = useState(currentScoutYear)
  const { data, isLoading } = useAdminDashboard(scoutYear)
  // Timely/actionable content — fetched once, independent of the year selector.
  const { data: overview } = useDashboardOverview()
  // Deduped with BirthdaysCard's own query — used only to skip the birthdays grid cell when there are none
  // (so it doesn't leave an empty column).
  const { data: birthdays } = useUpcomingBirthdays(30)

  // Per-user widget layout (order + visibility + width), saved on the account. mergeLayout keeps it forward-
  // compatible if a widget is added later. `layout` is the working copy (edited in customize mode).
  const { data: savedLayout } = useDashboardLayout()
  const saveLayout = useUpdateDashboardLayout()
  const [editing, setEditing] = useState(false)
  const [layout, setLayout] = useState<WidgetConfig[]>(() => mergeLayout(savedLayout))
  // Re-sync the working copy when the saved layout loads/changes — but never while editing (it would discard
  // in-progress changes). Render-phase reset (same idiom used elsewhere; converges, can't loop).
  const [syncedFrom, setSyncedFrom] = useState(savedLayout)
  if (!editing && savedLayout !== syncedFrom) {
    setSyncedFrom(savedLayout)
    setLayout(mergeLayout(savedLayout))
  }

  // Year options: the current scout year (labelled "en cours") + the previous 4 — built from the current year
  // so the list is never stale and the selected value is always present. If the selected year predates the
  // window, it's added too.
  const years = useMemo(() => {
    const start = parseInt(currentScoutYear.slice(0, 4), 10)
    const list = Number.isNaN(start)
      ? [currentScoutYear]
      : Array.from({ length: 5 }, (_, i) => `${start - i}-${start - i + 1}`)
    return list.includes(scoutYear) ? list : [scoutYear, ...list]
  }, [currentScoutYear, scoutYear])

  if (isLoading) return <LoadingSpinner variant="page" />
  if (!data) return (
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-2">
      <p className="text-lg font-medium">Impossible de charger le tableau de bord</p>
      <p className="text-sm">Veuillez réessayer ultérieurement.</p>
    </div>
  )

  // ── Customize mode ──
  if (editing) {
    return (
      <DashboardEditor
        layout={layout}
        setLayout={setLayout}
        saving={saveLayout.isPending}
        onReset={() => setLayout(DEFAULT_LAYOUT.map(w => ({ ...w })))}
        onCancel={() => { setLayout(mergeLayout(savedLayout)); setEditing(false) }}
        onDone={() => saveLayout.mutate(serializeLayout(layout), {
          onSuccess: () => { toast.success('Tableau de bord enregistré'); setEditing(false) },
          onError: () => toast.error("Échec de l'enregistrement"),
        })}
      />
    )
  }

  // Bar-scale denominators (the largest bucket = 100% width); floor at 1 to avoid divide-by-zero.
  const maxUnitMembers = Math.max(...data.unitBreakdown.map(u => u.memberCount), 1)
  const maxAgeGroup = Math.max(...data.ageGroups.map(g => g.count), 1)

  const visible = layout.filter(w => w.visible)
  const anyYearScoped = visible.some(w => WIDGET_META[w.id].yearScoped)
  const hasBirthdays = !!birthdays && birthdays.length > 0

  return (
    <Page>
      <PageHeader
        title="Accueil"
        icon={LayoutDashboard}
        description="Vue d'ensemble du groupe"
        actions={
          <>
            {anyYearScoped && (
              <Select value={scoutYear} onValueChange={setScoutYear}>
                <SelectTrigger className="w-full sm:w-56 gap-2"><Calendar className="h-4 w-4 shrink-0 text-muted-foreground" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={y}>{y}{y === currentScoutYear ? ' — année en cours' : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}><SlidersHorizontal className="h-4 w-4" />Personnaliser</Button>
          </>
        }
      />

      {visible.length === 0 ? (
        <Card><CardContent className="py-4">
          <EmptyState
            icon={LayoutDashboard}
            title="Aucune carte affichée"
            description="Personnalisez votre tableau de bord pour afficher des cartes."
            action={<Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}><SlidersHorizontal className="h-4 w-4" />Personnaliser</Button>}
          />
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-start">
          {/* items-start (above): cards keep their natural height instead of stretching to the tallest card in
              the row, so a short "À traiter" next to a tall "Anniversaires" isn't padded with whitespace. */}
          {visible.map(w => {
            // Birthdays self-hides when empty — skip its cell so it doesn't leave an empty column.
            if (w.id === 'birthdays' && !hasBirthdays) return null
            const node = renderWidget(w.id, overview, data, maxUnitMembers, maxAgeGroup)
            if (!node) return null
            return <div key={w.id} className={WIDTH_COLSPAN[w.width]}>{node}</div>
          })}
        </div>
      )}
    </Page>
  )
}

// Distinct units (by id) — a member can hold several roles in the same unit.
function dedupeByUnit(units: UnitAccess[]): UnitAccess[] {
  const seen = new Set<string>()
  const out: UnitAccess[] = []
  for (const u of units) if (!seen.has(u.unitId)) { seen.add(u.unitId); out.push(u) }
  return out
}

// Renders a unit leader's roster: a picker above it when they lead more than one unit.
function UnitRoster({ units, selectedUnit, setSelectedUnit }: { units: UnitAccess[]; selectedUnit: string; setSelectedUnit: (v: string) => void }) {
  const unitId = selectedUnit || units[0]?.unitId
  if (!unitId) return <Navigate to="/my-profile" replace />
  return (
    <Suspense fallback={<LoadingSpinner variant="page" />}>
      {units.length === 1 ? (
        <UnitLeaderDashboard unitId={units[0].unitId} />
      ) : (
        <div className="space-y-4">
          <Select value={unitId} onValueChange={setSelectedUnit}>
            <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Sélectionner une unité" /></SelectTrigger>
            <SelectContent>
              {units.map(u => <SelectItem key={u.unitId} value={u.unitId}>{u.unitName} — {u.roleName}</SelectItem>)}
            </SelectContent>
          </Select>
          <UnitLeaderDashboard unitId={unitId} />
        </div>
      )}
    </Suspense>
  )
}

// Landing page after login. Routes each user to the right dashboard by role:
// super-admin/CG/ACG → group overview, unit leader → their unit roster, everyone else → Ma fiche. Someone
// who is BOTH a group leader (CG/ACG) AND a unit leader (CU/ACU) gets a Groupe | Mon unité toggle.
export default function DashboardPage() {
  const { user, hasPermission } = useAuthStore()
  const [selectedUnit, setSelectedUnit] = useState<string>('')
  const [view, setView] = useState<'groupe' | 'unite'>('groupe')

  if (!user) return <LoadingSpinner />

  // Group-level = super-admin, Chef de Groupe (maitrise.manage), or Assistant Chef de Groupe (a group-level role).
  const isGroupLevel = user.isSuperAdmin || hasPermission(PERMISSIONS.MAITRISE_MANAGE) || user.unitAccess.some(u => u.isGroupLevel)
  // Units the member personally LEADS as a CU/ACU — real unit-leadership only, EXCLUDING the group Maîtrise
  // assignment (a group-level role grants all-units access but isn't a "unit I run").
  const myLeaderUnits = dedupeByUnit(user.unitAccess.filter(u => u.isLeader && !u.isGroupLevel))
  const isUnitLeader = hasPermission(PERMISSIONS.MEMBERS_EDIT)

  // Regular members (neither a group nor a unit leader) go straight to profile.
  if (!isGroupLevel && !isUnitLeader) return <Navigate to="/my-profile" replace />

  // Pick the dashboard variant, then render the (maîtrise-pilot) install card above it.
  let content: ReactNode
  if (isGroupLevel && myLeaderUnits.length > 0) {
    // Both a group leader AND a unit leader → toggle between the group overview and their own unit(s).
    content = (
      <div className="space-y-4">
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-sm">
          <button onClick={() => setView('groupe')} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${view === 'groupe' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Groupe</button>
          <button onClick={() => setView('unite')} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${view === 'unite' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Mon unité</button>
        </div>
        {view === 'groupe' ? <AdminDashboard /> : <UnitRoster units={myLeaderUnits} selectedUnit={selectedUnit} setSelectedUnit={setSelectedUnit} />}
      </div>
    )
  } else if (isGroupLevel) {
    // Group leader only (CG/ACG/super-admin without a unit role) → group overview.
    content = <AdminDashboard />
  } else {
    // Unit leader only (e.g. a CU who is a youth elsewhere) → the unit(s) they lead (fallback: all their units).
    content = <UnitRoster units={myLeaderUnits.length > 0 ? myLeaderUnits : dedupeByUnit(user.unitAccess)} selectedUnit={selectedUnit} setSelectedUnit={setSelectedUnit} />
  }

  return (
    <div className="space-y-4">
      <PwaInstallCard />
      {content}
    </div>
  )
}
