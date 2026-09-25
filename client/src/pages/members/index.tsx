// Members master/detail screen (admin + CG + CU).
// Left: searchable, paginated member list (accent-insensitive search server-side) with an
// Actifs/Anciens (alumni) toggle and unit filter. Right: the selected member's full detail panel
// (tabbed Informations/Famille/Unités/Documents/Cotisations/Progression/Infos compl./Médical) with
// inline editing, photo, card PDF, and the SDL/GDL external-card-number editor.
// The split is drag-resizable on desktop. A create dialog returns auto-generated login credentials.
// Route param :id deep-links a member into the right panel.
import { parseApiError } from '@/lib/error-utils'
import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useParams, useSearchParams, useLocation, useNavigate } from 'react-router'
import { useMobileDetail } from '@/hooks/use-mobile-detail'
import { useDebounce } from '@/hooks/use-debounce'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { useFormValidation } from '@/hooks/use-form-validation'
import { useMembers, useMember, useMemberUnitOptions, useCreateMember,
  type MemberFormData } from '@/services/member-service'
import { useUnits } from '@/services/unit-service'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { useSettingArray, useSettingValue } from '@/services/settings-service'
import { SchoolSelect } from '@/components/shared/school-select'
import { ExportDialog } from '@/components/shared/export-dialog'
import { MemberImportDialog } from '@/components/admin/member-import-dialog'
import { GENDER_OPTIONS, BLOOD_TYPE_OPTIONS, NATIONALITY_OPTIONS } from '@/lib/options'
import { calendarScoutYear } from '@/hooks/use-scout-year'
import { useUnitAbsenceCounts } from '@/services/meeting-service'
import { cn } from '@/lib/utils'
import { Plus, Search, GripVertical, ArrowUpDown, ArrowUp, ArrowDown, ArrowLeft, Copy, X, FileSpreadsheet, User, CheckCircle2, AlertTriangle, CalendarCheck, ChevronDown, SlidersHorizontal, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { MemberDetailPanel } from '@/components/members/member-detail-panel'
import { credentialsMessage } from '@/lib/credentials'



// Youth (school-age) branches: a member here fills Classe/Section, never a profession. Used to hide the
// "En activité" option in the create dialog (the panel/Ma fiche use the server-computed member.showProfession).
const YOUTH_BRANCH_CODES = ['MEU', 'RON', 'COM', 'TRO']

// Family-name A–Z quick index for the members list.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

// Vertical A–Z rail attached to the right edge of the member list (desktop) — the familiar contacts index.
// Spreads over the full list height; "•" clears the filter (and clicking the active letter toggles it off),
// so the alphabet no longer needs a full horizontal row in the header. Hidden on mobile (a horizontal A–Z
// lives in the collapsible "Filtres" section there).
function AlphaRail({ letter, onPick }: { letter: string; onPick: (l: string) => void }) {
  // Each item flexes to fill the rail height (flex-1), so the 27 letters always fit without overlap or clipping,
  // whatever the viewport height.
  const cls = (active: boolean) =>
    cn('flex flex-1 min-h-[12px] w-4 items-center justify-center rounded text-[10px] font-medium leading-none transition-colors',
      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')
  return (
    <div className="hidden md:flex w-5 shrink-0 select-none flex-col items-center border-l bg-muted/20 py-1">
      <button type="button" title="Tous les noms" onClick={() => onPick('')} className={cls(letter === '')}>•</button>
      {ALPHABET.map((l) => (
        <button key={l} type="button" title={`Noms commençant par ${l}`}
          onClick={() => onPick(letter === l ? '' : l)} className={cls(letter === l)}>{l}</button>
      ))}
    </div>
  )
}


// Dossier-compliance indicator for a roster row: green check when documents are complete AND the
// current-year cotisation is paid/exempt, else an amber warning whose tooltip says what's missing.
// Renders nothing for the alumni view / when compliance wasn't computed (docsComplete null).
function ComplianceDot({ docsComplete, cotisationOk }: { docsComplete?: boolean | null; cotisationOk?: boolean | null }) {
  if (docsComplete === null || docsComplete === undefined) return null
  const issues: string[] = []
  if (docsComplete === false) issues.push('Documents incomplets')
  if (cotisationOk === false) issues.push('Cotisation non payée') // null = not tracked → not an issue
  if (issues.length === 0)
    return <Tip content="Dossier complet"><CheckCircle2 className="h-4 w-4 text-emerald-500" /></Tip>
  return <Tip content={issues.join(' · ')}><AlertTriangle className="h-4 w-4 text-amber-500" /></Tip>
}


// ─── Drag handle ─────────────────────────
// Resizes the master/detail split: tracks mouse delta on document (not the element) so the
// drag keeps working if the pointer leaves the thin handle; restores cursor/select on mouseup.
function DragHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const dragging = useRef(false)
  const lastX = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    lastX.current = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      onDrag(ev.clientX - lastX.current)
      lastX.current = ev.clientX
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
    <div className="w-2 shrink-0 cursor-col-resize flex items-center justify-center bg-border/50 hover:bg-border transition-colors" onMouseDown={onMouseDown}>
      <GripVertical className="h-4 w-4 text-muted-foreground/50" />
    </div>
  )
}

// ─── Sort header helper ──────────────────
function SortHeader({ label, field, current, dir, onSort }: { label: string; field: string; current: string; dir: string; onSort: (f: string) => void }) {
  const active = current === field
  return (
    <button className="flex items-center gap-1 text-xs font-medium hover:text-foreground transition-colors" onClick={() => onSort(field)}>
      {label}
      {active ? (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-50" />}
    </button>
  )
}

// ─── Main page ───────────────────────────
export default function MembersPage() {
  const { id: routeMemberId } = useParams<{ id: string }>()
  const [detailParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  // A deep link (e.g. the Fratries page) can request a specific tab (?tab=famille) and pass a `from` in the
  // navigation state so the fiche shows a "Retour" button back to where the user came from.
  const initialTab = detailParams.get('tab') ?? undefined
  const backTo = (location.state as { from?: string; fromLabel?: string } | null)?.from
  const backLabel = (location.state as { fromLabel?: string } | null)?.fromLabel
  const canCreate = useAuthStore((s) => s.hasPermission(PERMISSIONS.MEMBERS_CREATE)) // CG / super-admin only
  const pinnedNationalities = useSettingArray('pinned_nationalities')
  const schools = useSettingArray('member.schools')
  const defaultSchool = useSettingValue('member.default_school')
  const classes = useSettingArray('member.classes')
  const professionDomains = useSettingArray('member.profession_domains')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [page, setPage] = useState(1)
  // Remember the last view (unit filter + Actifs/Anciens) between visits — a CU almost always works one unit.
  const [unitFilter, setUnitFilter] = useState<string>(() => localStorage.getItem('members.unitFilter') ?? 'all')
  // View: Actifs (default) / Anciens / Tous (both, for searching across active + former at once).
  const [viewMode, setViewMode] = useState<'active' | 'alumni' | 'all'>(() => {
    const v = localStorage.getItem('members.viewMode')
    return v === 'alumni' || v === 'all' ? v : 'active'
  })
  const showAlumni = viewMode === 'alumni'
  const showAll = viewMode === 'all'
  useEffect(() => { localStorage.setItem('members.unitFilter', unitFilter) }, [unitFilter])
  useEffect(() => { localStorage.setItem('members.viewMode', viewMode) }, [viewMode])
  // Names per page (persisted) + family-name A–Z index (transient jump within the current view).
  const [pageSize, setPageSize] = useState<number>(() => {
    const v = Number(localStorage.getItem('members.pageSize'))
    return [25, 50, 100, 200].includes(v) ? v : 50
  })
  useEffect(() => { localStorage.setItem('members.pageSize', String(pageSize)) }, [pageSize])
  const [letter, setLetter] = useState('')
  // PWA install filter: all / installed (app détectée) / not (non détectée). Lets the CG pull "who installed".
  const [appFilter, setAppFilter] = useState<'all' | 'installed' | 'not'>('all')
  // Mobile: the secondary filters (page size, app filter, A–Z index) collapse behind a "Filtres" toggle so the
  // list header stays short on a phone. On desktop (md+) they're always shown inline.
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [sortBy, setSortBy] = useState('lastname')
  const [sortDir, setSortDir] = useState('asc')
  // Selected member. On a phone, opening one adds a history step so the back button closes it (useMobileDetail).
  const { selectedId: selectedMemberId, setSelectedId: setSelectedMemberId, open: openMember, close: closeMember } = useMobileDetail(routeMemberId ?? null)
  // If the URL /members/:id changes while this page stays mounted (a deep link / notification to another
  // member), follow it. Render-phase adjust (React's "reset state when a prop changes" pattern), no effect.
  const [prevRouteMemberId, setPrevRouteMemberId] = useState(routeMemberId)
  if (routeMemberId && routeMemberId !== prevRouteMemberId) {
    setPrevRouteMemberId(routeMemberId)
    setSelectedMemberId(routeMemberId)
  }
  const [leftWidth, setLeftWidth] = useState(340)

  // Export dialog
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  // Create dialog
  const [formOpen, setFormOpen] = useState(false)
  const [credentialsDialog, setCredentialsDialog] = useState<{ username: string; password: string; memberId: string } | null>(null)
  const [form, setForm] = useState<MemberFormData>({ firstName: '', lastName: '' })
  // Situation toggle (create): 'student' = Classe/Section, 'working' = Domaine/Profession.
  const [situation, setSituation] = useState<'student' | 'working'>('student')
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()

  const handleDrag = useCallback((deltaX: number) => {
    setLeftWidth(w => Math.max(300, Math.min(600, w + deltaX)))
  }, [])

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
    setPage(1)
  }

  // unitFilter is a single Select holding these kinds of value: 'all', 'maitrises' (all leaders), 'none'
  // (no unit), or a unit id.
  const isSpecialFilter = unitFilter === 'all' || unitFilter === 'none' || unitFilter === 'maitrises'
  const unitId = isSpecialFilter ? undefined : unitFilter
  const noUnit = unitFilter === 'none' ? true : undefined
  const maitrise = unitFilter === 'maitrises' ? true : undefined

  // Units shown in the filter depend on the view: only units that HAVE members in Actifs vs Anciens (so an
  // empty unit is hidden under Actifs but appears under Anciens if it still has former members). Re-fetched
  // when the toggle flips. `units` (all active units) is kept for the create form + resolving the selected name.
  const { data: unitOptions } = useMemberUnitOptions(showAlumni, showAll)
  const { data: units } = useUnits({ pageSize: 100 })

  // If the selected unit vanished from the options for the current view (e.g. it's empty under Actifs), fall
  // back to "Toutes les unités" so the list isn't stuck on a hidden unit. Render-phase reset (same idiom as the
  // route-member sync above); only fires while a real-but-missing unit is selected, so it can't loop.
  if (unitOptions && !isSpecialFilter && !unitOptions.some(u => u.id === unitFilter)) {
    setUnitFilter('all')
    setPage(1)
  }

  // Create form: hide the "En activité" option when the chosen unit is a youth branch (Meute/Ronde/Compagnie/
  // Troupe) — those members fill Classe/Section only. createSituation = effective situation (forced 'student').
  const createSelectedUnit = units?.items.find(u => u.id === form.unitId)
  const createIsYouthUnit = !!createSelectedUnit && YOUTH_BRANCH_CODES.includes(createSelectedUnit.unitTypeCode)
  const createSituation = createIsYouthUnit ? 'student' : situation

  const { data, isLoading } = useMembers({
    search: debouncedSearch || undefined,
    unitId, noUnit, maitrise,
    alumni: showAlumni || undefined,
    all: showAll || undefined,
    sortBy, sortDir,
    page, pageSize, letter: letter || undefined,
    appInstalled: appFilter === 'installed' ? true : appFilter === 'not' ? false : undefined,
  })

  // The selected member's detail (cached — the detail panel fetches the same ['members', id] key, so no extra
  // request). Used to PIN the selected member at the top of the list when they're not in the current filtered/
  // paged page (deep link from the birthdays card / a notification / the command palette) so they're always
  // visible + highlighted, without silently mutating the user's filters.
  const { data: selectedDetail } = useMember(selectedMemberId ?? '')
  const selectedInList = !!(selectedMemberId && data?.items.some(m => m.id === selectedMemberId))
  const pinnedMember = !selectedInList && selectedMemberId && selectedDetail?.id === selectedMemberId ? selectedDetail : null

  const createMutation = useCreateMember()

  // Absence counts for the selected unit (active view only, running calendar scout year) → a small badge per row.
  const { data: absenceCountsRaw } = useUnitAbsenceCounts(unitId, calendarScoutYear(), !!unitId && viewMode === 'active')
  const absenceCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of absenceCountsRaw ?? []) m.set(a.memberId, a.count)
    return m
  }, [absenceCountsRaw])

  const openCreate = () => {
    setForm({ firstName: '', lastName: '', dateOfBirth: '', gender: '', bloodType: '', nationality: '', school: defaultSchool ?? '', classe: '', professionDomain: '', profession: '', section: '', externalCardNumber: '', fatherName: '', motherName: '', motherMaidenName: '', unitId: '' })
    setSituation('student')
    setError(''); clearAll()
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ firstName: !form.firstName, lastName: !form.lastName })) return
    try {
      const payload = { ...form, dateOfBirth: form.dateOfBirth || null, gender: form.gender || null, bloodType: form.bloodType || null, nationality: form.nationality || null, school: form.school || null,
        // Mutually exclusive by situation (student keeps classe/section, working keeps domaine/profession).
        classe: createSituation === 'student' ? (form.classe || null) : null, section: createSituation === 'student' ? (form.section || null) : null,
        professionDomain: createSituation === 'working' ? (form.professionDomain || null) : null, profession: createSituation === 'working' ? (form.profession || null) : null,
        fatherName: form.fatherName || null, motherName: form.motherName || null, motherMaidenName: form.motherMaidenName || null, unitId: form.unitId || null }
      const result = await createMutation.mutateAsync(payload)
      toast.success('Membre créé')
      setFormOpen(false)
      setCredentialsDialog({ username: result.username, password: result.temporaryPassword, memberId: result.memberId })
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Top bar — all list chrome (title, actions, filters, A–Z). Hidden on mobile while a member's fiche is
          open so the detail panel gets the full screen (the fiche has its own "Retour à la liste" back button). */}
      <div className={cn('shrink-0 space-y-3 pb-3', selectedMemberId && 'max-md:hidden')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">Membres</h1>
          <div className="flex flex-wrap items-center gap-2">
            {/* Span wrapper so the tooltip still fires when the button is disabled (Radix skips disabled triggers). */}
            <Tip content={isSpecialFilter ? 'Sélectionnez une unité pour exporter' : "Exporter l'unité en Excel ou CSV"}>
              <span className="inline-flex">
                <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} disabled={isSpecialFilter}>
                  <FileSpreadsheet className="mr-1 h-4 w-4" />
                  Exporter
                </Button>
              </span>
            </Tip>
            {canCreate && <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="mr-1 h-4 w-4" />Importer</Button>}
            {canCreate && <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />Nouveau membre</Button>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search — full width on mobile, flexible beside the filters on ≥sm */}
          <div className="relative w-full sm:flex-1 sm:min-w-[10rem] sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Rechercher par nom, prénom ou carte..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="pl-8 pr-8 h-8 text-sm" />
            {search && (
              <Tip content="Effacer la recherche">
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setSearch(''); setPage(1) }}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </Tip>
            )}
          </div>
          {/* Unit filter — full width on mobile so it doesn't crowd the search */}
          <Select value={unitFilter} onValueChange={(v) => { setUnitFilter(v); setPage(1) }}>
            <SelectTrigger className="w-full sm:w-52 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les unités</SelectItem>
              <SelectItem value="maitrises">Maîtrises</SelectItem>
              {/* Only units that have members in the current view (Actifs / Anciens) — empty units are hidden. */}
              {unitOptions?.map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.count})</SelectItem>)}
              {/* Export is enabled only for a concrete unit (not 'all'/'maitrises'/'none') — unit-scoped report */}
              <SelectItem value="none">Sans unité</SelectItem>
            </SelectContent>
          </Select>
          {/* Actifs / Anciens / Tous toggle. "Tous" searches across active + former members at once. */}
          <div className="flex h-8 shrink-0 items-center rounded-md border p-0.5 text-xs">
            {([['active', 'Actifs'], ['alumni', 'Anciens'], ['all', 'Tous']] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={cn('h-full rounded px-2.5 font-medium transition-colors', viewMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                onClick={() => { setViewMode(mode); setPage(1) }}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Secondary filters (names-per-page + PWA app filter) live in a collapsible row to keep the header
              slim, on every screen size. A dot marks an active secondary filter. */}
          <button
            type="button"
            onClick={() => setShowMoreFilters(v => !v)}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />Filtres
            {(appFilter !== 'all' || letter) && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showMoreFilters && 'rotate-180')} />
          </button>
          {data && data.totalCount > 0 && (
            <span className="ml-auto flex items-center text-xs text-muted-foreground">
              {(data.page - 1) * pageSize + 1}–{Math.min(data.page * pageSize, data.totalCount)} sur {data.totalCount}
            </span>
          )}
        </div>

        {/* Collapsible secondary filters: names-per-page + app filter, plus (mobile only) the horizontal A–Z
            index. On desktop the A–Z lives in the vertical rail beside the list instead. */}
        {showMoreFilters && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Names per page */}
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[6.5rem] max-md:flex-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[25, 50, 100, 200].map(n => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
              </SelectContent>
            </Select>
            {/* PWA install filter — "app détectée" = ran the installed app at least once; "non détectée" is
                best-effort (no reliable "not installed" signal). Count via the range indicator. */}
            <Select value={appFilter} onValueChange={(v) => { setAppFilter(v as typeof appFilter); setPage(1) }}>
              <SelectTrigger className="h-8 w-40 max-md:flex-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">App : tous</SelectItem>
                <SelectItem value="installed">App installée</SelectItem>
                <SelectItem value="not">App non détectée</SelectItem>
              </SelectContent>
            </Select>
            {/* Mobile A–Z index (desktop uses the vertical rail on the list). */}
            <div className="flex w-full flex-wrap gap-0.5 md:hidden">
              <button type="button" onClick={() => { setLetter(''); setPage(1) }}
                className={cn('h-6 rounded px-1.5 text-[11px] font-medium transition-colors', letter === '' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>Tous</button>
              {ALPHABET.map(l => (
                <button key={l} type="button" onClick={() => { setLetter(l); setPage(1) }}
                  className={cn('h-6 min-w-[1.5rem] rounded px-1 text-[11px] font-medium transition-colors', letter === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>{l}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2-column layout — desktop: side-by-side split; mobile: master/detail (list OR detail, one at a time) */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 rounded-lg border overflow-hidden">
        {/* Left: member list — full width/height on mobile, fixed-width pane on desktop.
            max-md:!w-full overrides the inline pixel width below md; hidden on mobile once a member is picked. */}
        <div
          className={cn(
            'flex flex-1 md:flex-none md:shrink-0 overflow-hidden border-b md:border-b-0 max-md:!w-full',
            selectedMemberId && 'max-md:hidden'
          )}
          style={{ width: leftWidth }}
        >
         {/* header + scrollable list (the A–Z rail is a sibling to the right of this column) */}
         <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Sortable header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40 text-muted-foreground shrink-0">
            <div className="w-8" />
            <div className="flex-1 min-w-0">
              <SortHeader label="Nom" field="lastname" current={sortBy} dir={sortDir} onSort={handleSort} />
            </div>
            <div className="w-12 shrink-0 text-xs">
              <SortHeader label="Unité" field="unit" current={sortBy} dir={sortDir} onSort={handleSort} />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto bg-muted/20">
            {/* Deep-linked member (birthdays card / notification / command palette) who isn't on the current
                filtered/paged page: pin them at the top, highlighted, so the user always sees who's selected
                without silently changing their filters. Hidden once they appear in the list itself. */}
            {pinnedMember && (
              <div className="flex items-center gap-2 border-b-2 border-l-2 border-l-primary border-b-primary/30 bg-primary/10 px-3 py-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-medium shrink-0">
                  {pinnedMember.firstName[0]}{pinnedMember.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{pinnedMember.lastName} {pinnedMember.firstName}</p>
                  <p className="text-[11px] text-primary/70">Sélectionné · hors de la liste filtrée</p>
                </div>
              </div>
            )}
            {isLoading ? <div className="flex items-center justify-center h-full"><LoadingSpinner /></div> :
             !data || data.items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
                {debouncedSearch ? <Search className="h-8 w-8 opacity-40" /> : <User className="h-8 w-8 opacity-40" />}
                <p className="text-sm">{debouncedSearch ? `Aucun résultat pour « ${debouncedSearch} »` : letter ? `Aucun nom commençant par « ${letter} »` : 'Aucun membre trouvé'}</p>
              </div>
            ) : (
              <>
                {data.items.map(m => (
                  <div
                    key={m.id}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-border/40 transition-colors',
                      selectedMemberId === m.id ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-muted/60'
                    )}
                    onClick={() => openMember(m.id)}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
                      {m.firstName[0]}{m.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.lastName} {m.firstName}</p>
                      {m.dateOfBirth && <p className="text-[11px] text-muted-foreground">{new Date(m.dateOfBirth).toLocaleDateString('fr-FR')}</p>}
                    </div>
                    {absenceCounts.get(m.id) ? (
                      <Tip content="Absences aux réunions cette année">
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                          <CalendarCheck className="h-3 w-3" />{absenceCounts.get(m.id)}
                        </span>
                      </Tip>
                    ) : null}
                    <div className="shrink-0"><ComplianceDot docsComplete={m.docsComplete} cotisationOk={m.cotisationOk} /></div>
                    <div className="w-12 shrink-0 text-[11px] text-muted-foreground text-center">{m.unitName ?? '—'}</div>
                  </div>
                ))}
                {/* Pagination — Préc./Suiv. + a page picker to jump directly to any page. */}
                {data.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-1.5 p-2 border-t bg-muted/30">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={!data.hasPreviousPage} onClick={() => setPage(p => p - 1)}>Préc.</Button>
                    <Select value={String(data.page)} onValueChange={(v) => setPage(Number(v))}>
                      <SelectTrigger className="h-7 w-auto gap-1 px-2 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {Array.from({ length: data.totalPages }, (_, i) => i + 1).map(n => (
                          <SelectItem key={n} value={String(n)} className="text-xs">Page {n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">/ {data.totalPages}</span>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={!data.hasNextPage} onClick={() => setPage(p => p + 1)}>Suiv.</Button>
                  </div>
                )}
              </>
            )}
          </div>
         </div>
         {/* Vertical A–Z rail (desktop): click a letter to jump; "•" or the active letter clears it. */}
         <AlphaRail letter={letter} onPick={(l) => { setLetter(l); setPage(1) }} />
        </div>

        {/* Drag handle: desktop only */}
        <div className="hidden md:flex">
          <DragHandle onDrag={handleDrag} />
        </div>

        {/* Right: member detail — full screen on mobile (with a Retour button); hidden on mobile when nothing is selected. */}
        <div className={cn('flex flex-1 min-w-0 flex-col overflow-hidden bg-background', !selectedMemberId && 'max-md:hidden')}>
          {selectedMemberId ? (
            <>
              {/* When we arrived from another page (e.g. the Fratries page passes a `from`), a "Retour" button
                  takes the user back there (all screen sizes). */}
              {backTo && (
                <button
                  type="button"
                  onClick={() => navigate(backTo)}
                  className="flex shrink-0 items-center gap-1 border-b px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" /> {backLabel ? `Retour — ${backLabel}` : 'Retour'}
                </button>
              )}
              {/* Mobile-only: back to the list */}
              <button
                type="button"
                onClick={closeMember}
                className="flex shrink-0 items-center gap-1 border-b px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground md:hidden"
              >
                <ArrowLeft className="h-4 w-4" /> Retour à la liste
              </button>
              <div className="min-h-0 flex-1 overflow-hidden">
                <MemberDetailPanel key={selectedMemberId} memberId={selectedMemberId} onDeleted={closeMember} initialTab={selectedMemberId === routeMemberId ? initialTab : undefined} />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Sélectionnez un membre pour afficher sa fiche.
            </div>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nouveau membre</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <FormFieldErrors show={hasErrors} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <RequiredLabel htmlFor="firstName" required>Prénom</RequiredLabel>
                <Input id="firstName" className={fieldClass('firstName')} value={form.firstName} onChange={(e) => { setForm(f => ({ ...f, firstName: e.target.value })); clearField('firstName') }} required />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="lastName" required>Nom</RequiredLabel>
                <Input id="lastName" className={fieldClass('lastName')} value={form.lastName} onChange={(e) => { setForm(f => ({ ...f, lastName: e.target.value.toUpperCase() })); clearField('lastName') }} required />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <RequiredLabel htmlFor="dateOfBirth" required>Date de naissance</RequiredLabel>
                <Input id="dateOfBirth" type="date" value={form.dateOfBirth ?? ''} onChange={(e) => setForm(f => ({ ...f, dateOfBirth: e.target.value || null }))} />
              </div>
              <div className="space-y-2">
                <RequiredLabel required>Sexe</RequiredLabel>
                <Select value={form.gender ?? ''} onValueChange={(v) => setForm(f => ({ ...f, gender: v === '__clear__' ? '' : v || null }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__clear__">-- Aucun --</SelectItem>
                    {GENDER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <RequiredLabel required>Nationalité</RequiredLabel>
                <div className="flex items-center gap-1">
                  <div className="flex-1">
                    <SearchableSelect value={form.nationality ?? ''} onValueChange={(v) => setForm(f => ({ ...f, nationality: v || null }))} options={NATIONALITY_OPTIONS} pinnedValues={pinnedNationalities} searchPlaceholder="Rechercher une nationalité..." />
                  </div>
                  {form.nationality && (
                    <Tip content="Effacer la nationalité">
                      <Button variant="ghost" size="icon" type="button" className="h-7 w-7 shrink-0" onClick={() => setForm(f => ({ ...f, nationality: '' }))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </Tip>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <RequiredLabel>Groupe sanguin</RequiredLabel>
                <Select value={form.bloodType ?? ''} onValueChange={(v) => setForm(f => ({ ...f, bloodType: v === '__clear__' ? '' : v || null }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__clear__">-- Aucun --</SelectItem>
                    {BLOOD_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <RequiredLabel required>École</RequiredLabel>
                {/* Searchable dropdown + "Autre…" free-text (snaps typed variants onto the canonical school). */}
                <SchoolSelect value={form.school || ''} onChange={(v) => setForm(f => ({ ...f, school: v }))} schools={schools} />
              </div>
              {/* Situation toggle — hidden when a youth-branch unit is selected (Meute/Ronde/Compagnie/Troupe →
                  Classe/Section only). For older branches or no unit, the CG chooses. */}
              {!createIsYouthUnit && (
                <div className="space-y-2 sm:col-span-2">
                  <RequiredLabel>Situation</RequiredLabel>
                  <div className="inline-flex h-9 items-center rounded-md border p-0.5">
                    <button type="button" onClick={() => setSituation('student')}
                      className={cn('h-full rounded px-3 text-sm font-medium transition-colors', situation === 'student' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                      Scolarisé(e)
                    </button>
                    <button type="button" onClick={() => setSituation('working')}
                      className={cn('h-full rounded px-3 text-sm font-medium transition-colors', situation === 'working' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                      En activité
                    </button>
                  </div>
                </div>
              )}
              {createSituation === 'student' ? (
                <>
                  <div className="space-y-2">
                    <RequiredLabel>Classe</RequiredLabel>
                    <Select value={form.classe || ''} onValueChange={(v) => setForm(f => ({ ...f, classe: v === '__clear__' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__clear__">-- Aucune --</SelectItem>
                        {classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <RequiredLabel>Section</RequiredLabel>
                    <Input value={form.section || ''} onChange={(e) => setForm(f => ({ ...f, section: e.target.value.slice(0, 5) }))} placeholder="Ex: SV, SE..." maxLength={5} />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <RequiredLabel>Domaine</RequiredLabel>
                    <Select value={form.professionDomain || ''} onValueChange={(v) => setForm(f => ({ ...f, professionDomain: v === '__clear__' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__clear__">-- Aucun --</SelectItem>
                        {professionDomains.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <RequiredLabel>Profession</RequiredLabel>
                    <Input value={form.profession || ''} onChange={(e) => setForm(f => ({ ...f, profession: e.target.value }))} placeholder="Ex: Ingénieur, Médecin..." maxLength={150} />
                  </div>
                </>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <RequiredLabel>Numéro de carte (SDL/GDL)</RequiredLabel>
                <Input value={form.externalCardNumber || ''} onChange={(e) => setForm(f => ({ ...f, externalCardNumber: e.target.value }))} placeholder="Optionnel" maxLength={50} />
              </div>
            </div>
            {/* Optional unit placement: creates an active assignment (no team, default function) so the member
                shows on the CU's roster immediately. Options are the units the current user can access. */}
            <div className="space-y-2">
              <RequiredLabel>Unité</RequiredLabel>
              <Select value={form.unitId || ''} onValueChange={(v) => setForm(f => ({ ...f, unitId: v === '__clear__' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Aucune (à affecter plus tard)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear__">Aucune (à affecter plus tard)</SelectItem>
                  {units?.items.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Le membre sera placé dans l'unité (sans équipe, fonction par défaut) et visible par le chef d'unité.</p>
            </div>
            {/* Parents (optional): creates linked Père/Mère guardians. The father's initial also
                disambiguates a duplicate username. */}
            <div className="space-y-4 rounded-lg border border-border/60 bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Parents (facultatif)</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <RequiredLabel>Nom du père</RequiredLabel>
                  <Input value={form.fatherName || ''} onChange={(e) => setForm(f => ({ ...f, fatherName: e.target.value }))} placeholder="Prénom du père" maxLength={100} />
                </div>
                <div className="space-y-2">
                  <RequiredLabel>Nom de la mère</RequiredLabel>
                  <Input value={form.motherName || ''} onChange={(e) => setForm(f => ({ ...f, motherName: e.target.value }))} placeholder="Prénom de la mère" maxLength={100} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <RequiredLabel>Nom de jeune fille (mère)</RequiredLabel>
                  <Input value={form.motherMaidenName || ''} onChange={(e) => setForm(f => ({ ...f, motherMaidenName: e.target.value.toUpperCase() }))} placeholder="Nom de famille de la mère" maxLength={100} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Création...' : 'Créer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Export dialog */}
      {!isSpecialFilter && (
        <ExportDialog
          unitId={unitFilter}
          unitName={units?.items.find(u => u.id === unitFilter)?.name ?? ''}
          open={exportOpen}
          onOpenChange={setExportOpen}
        />
      )}

      {/* Bulk import dialog (Excel/CSV) */}
      <MemberImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Credentials dialog — one-time view of the new member's login; closing selects them in the detail panel */}
      <Dialog open={!!credentialsDialog} onOpenChange={() => { if (credentialsDialog) setSelectedMemberId(credentialsDialog.memberId); setCredentialsDialog(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Compte créé avec succès</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Un compte utilisateur a été créé automatiquement. Notez ces informations.</p>
            <div className="rounded-md bg-muted p-4 space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Nom d'utilisateur :</span>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 rounded bg-muted px-2 py-1 text-sm font-bold">{credentialsDialog?.username}</code>
                  <Tip content="Copier le nom d'utilisateur">
                    <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(credentialsDialog?.username ?? ''); toast.success('Copié !') }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </Tip>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Mot de passe :</span>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 rounded bg-muted px-2 py-1 text-sm font-bold">{credentialsDialog?.password}</code>
                  <Tip content="Copier le mot de passe">
                    <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(credentialsDialog?.password ?? ''); toast.success('Copié !') }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </Tip>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(credentialsMessage(credentialsDialog?.username ?? '', credentialsDialog?.password ?? '')); toast.success('Identifiants copiés !') }}>
              <Copy className="mr-1.5 h-4 w-4" />Copier le message
            </Button>
            <Button onClick={() => { if (credentialsDialog) setSelectedMemberId(credentialsDialog.memberId); setCredentialsDialog(null) }}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
