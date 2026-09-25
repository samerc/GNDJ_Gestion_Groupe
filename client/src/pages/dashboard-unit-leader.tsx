import { useState, useRef, useCallback, useMemo } from 'react'
import { saveBlob } from '@/lib/download'
import { useNavigate } from 'react-router'
import { useUnitDashboard, useUnitDashboardPrefs, type RosterMemberDto } from '@/services/dashboard-service'
import { useDebounce } from '@/hooks/use-debounce'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { MemberPhoto } from '@/components/shared/member-photo'
import { TrombinoscoreDialog } from '@/components/shared/trombinoscope-dialog'
import { MemberDetailPanel } from '@/components/members/member-detail-panel'
import { UnitDashboardCustomizeDialog } from '@/components/dashboard/unit-dashboard-customize'
import { mergeUnitPrefs, type UnitButtonId } from '@/lib/unit-dashboard-prefs'
import { RosterDialog } from '@/components/shared/roster-dialog'
import { ExportDialog } from '@/components/shared/export-dialog'
import { cn, computeAge } from '@/lib/utils'
import { generateBulkCards } from '@/services/report-service'
import { parseBlobError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { calendarScoutYear } from '@/hooks/use-scout-year'
import { useSettingValue } from '@/services/settings-service'
import { useUnitAbsenceCounts } from '@/services/meeting-service'
import { Users, Search, GripVertical, FileDown, List, CreditCard, FileSpreadsheet, Camera, CalendarCheck, UsersRound, SlidersHorizontal, CheckCircle2, AlertTriangle } from 'lucide-react'
import { BirthdaysButton } from '@/components/shared/birthdays-card'

interface Props { unitId: string }

// Dossier status for a roster row (optional, "État du dossier"): green check when all documents are approved AND
// the current-year cotisation is paid/exempt, else an amber warning whose tooltip says what's missing.
function DossierIcon({ docsComplete, cotisationOk }: { docsComplete: boolean; cotisationOk: boolean | null }) {
  const issues: string[] = []
  if (!docsComplete) issues.push('Documents incomplets')
  if (cotisationOk === false) issues.push('Cotisation non payée') // null = not tracked -> not an issue
  if (issues.length === 0)
    return <Tip content="Dossier complet"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /></Tip>
  return <Tip content={issues.join(' · ')}><AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" /></Tip>
}

// Draggable divider
function DragHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const dragging = useRef(false)
  const lastX = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    lastX.current = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientX - lastX.current
      lastX.current = e.clientX
      onDrag(delta)
    }
    const onMouseUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [onDrag])

  return (
    <div
      className="w-2 shrink-0 cursor-col-resize flex items-center justify-center bg-border/50 hover:bg-border transition-colors"
      onMouseDown={onMouseDown}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground/50" />
    </div>
  )
}

// Chef d'unité's home screen: a master/detail roster of one unit. Left = searchable member list
// grouped by team; right = the selected member's full file. Top action bar exports the roster as
// trombinoscope / list / cards / spreadsheet / custom report templates, and links to the photo session.
export default function UnitLeaderDashboard({ unitId }: Props) {
  const navigate = useNavigate()
  const { data, isLoading } = useUnitDashboard(unitId)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [teamFilter, setTeamFilter] = useState<string>('')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [leftWidth, setLeftWidth] = useState(320)
  const [trombiOpen, setTrombiOpen] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(false)
  const [bulkCardsLoading, setBulkCardsLoading] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  // Member-card generation is a group-wide toggle (Paramètres → Rapports). Off => hide the "Cartes" button.
  const cardsEnabled = useSettingValue('reports.cards_enabled') !== 'false'
  // The CU's own "Mon unité" preferences (button bar, roster row fields, grouping), saved on their account.
  const { data: prefsJson } = useUnitDashboardPrefs()
  const prefs = useMemo(() => mergeUnitPrefs(prefsJson), [prefsJson])
  const [customizeOpen, setCustomizeOpen] = useState(false)

  // Per-member absence counts (the running calendar scout year, so pre-season réunions count) → roster badge.
  const { data: absenceCountsRaw } = useUnitAbsenceCounts(unitId, calendarScoutYear())
  const absenceCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of absenceCountsRaw ?? []) m.set(a.memberId, a.count)
    return m
  }, [absenceCountsRaw])

  const handleBulkCards = async () => {
    setBulkCardsLoading(true)
    try {
      const response = await generateBulkCards(unitId)
      saveBlob(response.data, `Cartes_${data?.unitName?.replace(/\s+/g, '_') ?? 'Unite'}.pdf`, 'application/pdf')
      toast.success('Cartes générées')
    } catch (err) {
      toast.error(await parseBlobError(err))
    } finally {
      setBulkCardsLoading(false)
    }
  }

  const handleDrag = useCallback((deltaX: number) => {
    setLeftWidth(w => Math.max(220, Math.min(500, w + deltaX)))
  }, [])

  if (isLoading) return <LoadingSpinner variant="page" />
  if (!data) return <p className="text-muted-foreground">Unité introuvable.</p>

  // Flatten the team-grouped dashboard payload into one list, stamping each member with its team
  // name/color (null for unassigned) so search/filter can work over a single array.
  const allMembers: (RosterMemberDto & { teamName: string | null; teamColor1: string | null })[] = [
    ...data.teams.flatMap(t => t.members.map(m => ({ ...m, teamName: t.teamName, teamColor1: t.color1 }))),
    ...data.unassignedMembers.map(m => ({ ...m, teamName: null, teamColor1: null })),
  ]

  // Apply the debounced name/card search, then the team filter ('none' = members with no team).
  let filtered = allMembers
  if (debouncedSearch) {
    const s = debouncedSearch.toLowerCase()
    filtered = filtered.filter(m => m.firstName.toLowerCase().includes(s) || m.lastName.toLowerCase().includes(s) || (m.cardNumber?.toLowerCase().includes(s)))
  }
  if (teamFilter && teamFilter !== 'all') {
    if (teamFilter.startsWith('grp:')) {
      // Filter to a rule-based member group (Haute Patrouille, …) — member ids resolved server-side for this unit.
      const ids = new Set(data.groups.find(g => g.id === teamFilter.slice(4))?.memberIds ?? [])
      filtered = filtered.filter(m => ids.has(m.memberId))
    } else if (teamFilter === 'none') {
      filtered = filtered.filter(m => !m.teamName)
    } else {
      filtered = filtered.filter(m => m.teamName === teamFilter)
    }
  }

  // Re-group the filtered list: by team (default, first-seen team order) or, per the CU's preference, one
  // alphabetical list by family name.
  const grouped: { key: string; label: string; teamColor1: string | null; members: typeof filtered }[] = []
  if (prefs.grouping === 'alpha') {
    const sorted = [...filtered].sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr'))
    if (sorted.length) grouped.push({ key: '__all', label: 'Membres (A–Z)', teamColor1: null, members: sorted })
  } else {
    const seen = new Set<string | null>()
    for (const m of filtered) {
      if (!seen.has(m.teamName)) {
        seen.add(m.teamName)
        grouped.push({ key: m.teamName ?? '__none', label: m.teamName ?? 'Sans équipe', teamColor1: m.teamColor1, members: filtered.filter(f => f.teamName === m.teamName) })
      }
    }
  }

  const rowDetail = (m: (typeof filtered)[number]) => {
    const age = prefs.row.age ? computeAge(m.dateOfBirth) : null
    return [
      prefs.row.fonction ? m.functionalRoleName : null,
      prefs.row.team ? (m.teamName ?? 'Sans équipe') : null,
      prefs.row.matricule ? m.cardNumber : null,
      age != null ? `${age} ans` : null,
    ].filter(Boolean).join(' · ')
  }

  // Action-bar buttons by id, rendered in the CU's chosen order (hidden ones skipped).
  const buttonNodes: Record<UnitButtonId, React.ReactNode> = {
    // Upcoming birthdays of this unit's members (hidden when none).
    birthdays: <BirthdaysButton />,
    roster: (
      <Tip content="Liste des membres (PDF)">
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => setRosterOpen(true)}>
          <List className="mr-1 h-4 w-4" />Liste
        </Button>
      </Tip>
    ),
    trombi: (
      <Tip content="Trombinoscope (PDF avec photos)">
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => setTrombiOpen(true)}>
          <FileDown className="mr-1 h-4 w-4" />Trombinoscope
        </Button>
      </Tip>
    ),
    export: (
      <Tip content="Exporter en Excel ou CSV">
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => setExportOpen(true)}>
          <FileSpreadsheet className="mr-1 h-4 w-4" />Exporter
        </Button>
      </Tip>
    ),
    cards: cardsEnabled ? (
      <Tip content="Imprimer les cartes de membre">
        <Button variant="outline" size="sm" className="shrink-0" onClick={handleBulkCards} disabled={bulkCardsLoading}>
          <CreditCard className="mr-1 h-4 w-4" />{bulkCardsLoading ? 'Génération...' : 'Cartes'}
        </Button>
      </Tip>
    ) : null,
    photos: (
      <Tip content="Session photo de l'unité">
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate('/photo-session')}>
          <Camera className="mr-1 h-4 w-4" />Photos
        </Button>
      </Tip>
    ),
    // Opens the unit detail page (unit info + teams), where the CU edits équipes and their foulard colours.
    teams: (
      <Tip content="Gérer les équipes de l'unité (noms, couleurs des foulards…)">
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate(`/units/${unitId}`)}>
          <UsersRound className="mr-1 h-4 w-4" />Équipes
        </Button>
      </Tip>
    ),
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Top bar */}
      <div className="shrink-0 space-y-3 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{data.unitName}</h1>
            <p className="text-xs text-muted-foreground truncate">{data.unitTypeName}</p>
          </div>
          <div className="flex gap-4 text-center shrink-0">
            <div><p className="text-lg font-bold leading-none">{data.totalMembers}</p><p className="text-xs text-muted-foreground">Membres</p></div>
            <div><p className="text-lg font-bold leading-none">{data.totalTeams}</p><p className="text-xs text-muted-foreground">Équipes</p></div>
          </div>
        </div>
        {/* Action bar: a single horizontally-scrollable row so it never wraps into a pile on mobile. */}
        <div className="flex items-center gap-2 overflow-x-auto flex-nowrap pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {prefs.buttons.filter(b => b.visible).map(b => <span key={b.id} className="contents">{buttonNodes[b.id]}</span>)}
          <Tip content="Personnaliser cette page (boutons, liste des membres)">
            <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={() => setCustomizeOpen(true)} aria-label="Personnaliser">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </Tip>
          {/* Custom reports live in their own "Rapports" sidebar section now (was a dropdown here). */}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
          </div>
          <Select value={teamFilter || 'all'} onValueChange={(v) => setTeamFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-44 h-8 text-sm"><SelectValue placeholder="Toutes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les équipes</SelectItem>
              <SelectGroup>
                <SelectLabel>Équipes</SelectLabel>
                {data.teams.map(t => <SelectItem key={t.teamId} value={t.teamName}>{t.teamName}</SelectItem>)}
                <SelectItem value="none">Sans équipe</SelectItem>
              </SelectGroup>
              {data.groups.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Groupes</SelectLabel>
                  {data.groups.map(g => <SelectItem key={g.id} value={`grp:${g.id}`}>{g.name}</SelectItem>)}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 2-column layout. On mobile it's a one-pane-at-a-time master/detail (list, then full-screen
          detail with a back button); on md+ it's the resizable split pane. */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 rounded-lg border overflow-hidden">
        {/* Left: member list — full width on mobile, fixed (drag-resizable) width on desktop. Hidden on
            mobile once a member is selected so the detail gets the whole screen. */}
        <div
          className={cn(
            'overflow-y-auto bg-muted/30 w-full md:w-[var(--left-w)] md:shrink-0 md:max-h-full md:flex-none md:block',
            selectedMemberId ? 'hidden' : 'flex-1 min-h-0',
          )}
          style={{ '--left-w': `${leftWidth}px` } as React.CSSProperties}
        >
          {grouped.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4">Aucun membre trouvé</div>
          ) : (
            grouped.map(group => (
              <div key={group.key}>
                <div className="sticky top-0 z-10 flex items-center gap-2 bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground border-b">
                  {group.teamColor1 && <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: group.teamColor1 }} />}
                  <span className="truncate">{group.label}</span>
                  <span className="ml-auto shrink-0">{group.members.length}</span>
                </div>
                {group.members.map(m => (
                  <div
                    key={m.memberId}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2.5 cursor-pointer border-b border-border/40 transition-colors',
                      selectedMemberId === m.memberId
                        ? 'bg-primary/10 border-l-2 border-l-primary'
                        : 'hover:bg-muted/60'
                    )}
                    onClick={() => setSelectedMemberId(m.memberId)}
                  >
                    {prefs.row.photo && (
                      <MemberPhoto
                        memberId={m.memberId}
                        name={`${m.firstName} ${m.lastName}`}
                        photoPath={m.photoPath}
                        size={32}
                        className="shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{m.lastName} {m.firstName}</p>
                      {rowDetail(m) && <p className="text-xs text-muted-foreground truncate">{rowDetail(m)}</p>}
                    </div>
                    {prefs.row.dossier && <DossierIcon docsComplete={m.docsComplete} cotisationOk={m.cotisationOk} />}
                    {prefs.row.absences && absenceCounts.get(m.memberId) ? (
                      <Tip content="Absences aux réunions cette année">
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                          <CalendarCheck className="h-3 w-3" />{absenceCounts.get(m.memberId)}
                        </span>
                      </Tip>
                    ) : null}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Drag handle: desktop only */}
        <div className="hidden md:flex">
          <DragHandle onDrag={handleDrag} />
        </div>

        {/* Right: member detail — full screen on mobile when a member is selected; placeholder only on desktop. */}
        <div
          className={cn(
            'flex-1 min-w-0 min-h-0 overflow-hidden',
            selectedMemberId ? 'flex flex-col' : 'hidden md:block',
          )}
        >
          {selectedMemberId ? (
            <MemberDetailPanel key={selectedMemberId} memberId={selectedMemberId} onBack={() => setSelectedMemberId(null)} onDeleted={() => setSelectedMemberId(null)} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Sélectionnez un membre dans la liste</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <TrombinoscoreDialog unitId={unitId} unitName={data?.unitName ?? ''} open={trombiOpen} onOpenChange={setTrombiOpen} />
      <RosterDialog unitId={unitId} unitName={data?.unitName ?? ''} open={rosterOpen} onOpenChange={setRosterOpen} />
      <ExportDialog unitId={unitId} unitName={data?.unitName ?? ''} open={exportOpen} onOpenChange={setExportOpen} />
      <UnitDashboardCustomizeDialog open={customizeOpen} onOpenChange={setCustomizeOpen} prefs={prefs} cardsEnabled={cardsEnabled} />
    </div>
  )
}
