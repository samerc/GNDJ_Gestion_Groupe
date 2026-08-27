import { useState, useRef, useCallback, useMemo } from 'react'
import { saveBlob } from '@/lib/download'
import { useNavigate } from 'react-router'
import { useUnitDashboard, type RosterMemberDto } from '@/services/dashboard-service'
import { useMember } from '@/services/member-service'
import { useDebounce } from '@/hooks/use-debounce'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { MemberPhoto } from '@/components/shared/member-photo'
import { TrombinoscoreDialog } from '@/components/shared/trombinoscope-dialog'
import { MemberAssignments } from '@/components/members/member-assignments'
import { MemberGuardians } from '@/components/members/member-guardians'
import { MemberDocuments } from '@/components/members/member-documents'
import { MemberCotisations } from '@/components/members/member-cotisations'
import { MemberProgression } from '@/components/members/member-progression'
import { MemberCustomFields } from '@/components/members/member-custom-fields'
import { RosterDialog } from '@/components/shared/roster-dialog'
import { ExportDialog } from '@/components/shared/export-dialog'
import { cn } from '@/lib/utils'
import { generateBulkCards } from '@/services/report-service'
import { parseBlobError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { useReportTemplates } from '@/services/report-template-service'
import { generateRoster, generateExport } from '@/services/report-service'
import { useCurrentScoutYear, calendarScoutYear } from '@/hooks/use-scout-year'
import { useUnitAbsenceCounts } from '@/services/meeting-service'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Users, Search, Phone, Mail, MapPin, GripVertical, FileDown, List, CreditCard, FileSpreadsheet, Camera, FileText, ArrowLeft, CalendarCheck, UsersRound } from 'lucide-react'

interface Props { unitId: string }

// Small labelled read-only value (dash placeholder when empty), used throughout the detail panel.
function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value || '—'}</dd>
    </div>
  )
}

// Right-pane member file: header + tabbed sections (info/contact/family/units/medical/docs/
// cotisations/progression/custom). `onBack` is the mobile-only return-to-list arrow.
function MemberDetailPanel({ memberId, onBack }: { memberId: string; onBack?: () => void }) {
  const { data: member, isLoading } = useMember(memberId)

  if (isLoading) return <div className="flex items-center justify-center h-full"><LoadingSpinner /></div>
  if (!member) return null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 border-b px-4 py-3 shrink-0 bg-card">
        {onBack && (
          <Tip content="Retour à la liste">
            <Button variant="ghost" size="icon" className="md:hidden shrink-0 -ml-2" onClick={onBack} aria-label="Retour à la liste">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Tip>
        )}
        <MemberPhoto
          memberId={memberId}
          name={`${member.firstName} ${member.lastName}`}
          photoPath={member.photoPath}
          size={48}
          editable
        />
        <div className="min-w-0">
          <h3 className="font-bold text-lg truncate">{member.firstName} {member.lastName}</h3>
          <p className="text-xs text-muted-foreground truncate">
            {member.cardNumber && `N° ${member.cardNumber}`}
            {member.cardNumber && member.gender && ' — '}
            {member.gender}
            {(member.cardNumber || member.gender) && member.dateOfBirth && ' — '}
            {member.dateOfBirth && `Né(e) le ${new Date(member.dateOfBirth).toLocaleDateString('fr-FR')}`}
          </p>
        </div>
      </div>

      <Tabs defaultValue="info" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-4 mt-3 shrink-0 justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="info">Informations</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
          <TabsTrigger value="famille">Famille</TabsTrigger>
          <TabsTrigger value="unites">Unités / Fonctions</TabsTrigger>
          <TabsTrigger value="medical">Médical</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="cotisations">Cotisations</TabsTrigger>
          <TabsTrigger value="progression">Progression</TabsTrigger>
          <TabsTrigger value="custom">Infos complémentaires</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto p-4">
          <TabsContent value="info" className="mt-0">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Prénom" value={member.firstName} />
              <Field label="Nom" value={member.lastName} />
              <Field label="Date de naissance" value={member.dateOfBirth ? new Date(member.dateOfBirth).toLocaleDateString('fr-FR') : null} />
              <Field label="Sexe" value={member.gender} />
              <Field label="N° Carte" value={member.cardNumber} />
              <Field label="Nationalité" value={member.nationality} />
              <Field label="Groupe sanguin" value={member.bloodType} />
              <Field label="École" value={member.school} />
            </div>
          </TabsContent>

          <TabsContent value="contact" className="mt-0">
            <div className="grid gap-6 xl:grid-cols-3">
              <div>
                <h4 className="font-medium flex items-center gap-1.5 mb-2 text-sm"><Phone className="h-3.5 w-3.5" />Téléphones</h4>
                {member.phones.length === 0 ? <p className="text-sm text-muted-foreground">Aucun</p> : (
                  <div className="space-y-1.5">{member.phones.map(p => (
                    <div key={p.id} className="text-sm flex items-center gap-2">
                      <span>{p.countryCode} {p.number}</span>
                      <span className="text-muted-foreground text-xs">{p.type}</span>
                      {p.isPrimary && <Badge variant="outline" className="text-xs h-4">P</Badge>}
                      {p.isEmergency && <Badge variant="destructive" className="text-xs h-4">U</Badge>}
                    </div>
                  ))}</div>
                )}
              </div>
              <div>
                <h4 className="font-medium flex items-center gap-1.5 mb-2 text-sm"><Mail className="h-3.5 w-3.5" />Courriels</h4>
                {member.emails.length === 0 ? <p className="text-sm text-muted-foreground">Aucun</p> : (
                  <div className="space-y-1.5">{member.emails.map(e => (
                    <div key={e.id} className="text-sm flex items-center gap-2">
                      <span className="truncate">{e.address}</span>
                      <span className="text-muted-foreground text-xs shrink-0">{e.type}</span>
                    </div>
                  ))}</div>
                )}
              </div>
              <div>
                <h4 className="font-medium flex items-center gap-1.5 mb-2 text-sm"><MapPin className="h-3.5 w-3.5" />Adresses</h4>
                {member.addresses.length === 0 ? <p className="text-sm text-muted-foreground">Aucune</p> : (
                  <div className="space-y-1.5">{member.addresses.map(a => (
                    <div key={a.id} className="text-sm">
                      <span>{a.city}, {a.country}</span>
                      {a.details && <span className="text-muted-foreground"> — {a.details}</span>}
                    </div>
                  ))}</div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="famille" className="mt-0">
            <MemberGuardians memberId={memberId} />
          </TabsContent>

          <TabsContent value="unites" className="mt-0">
            <MemberAssignments memberId={memberId} memberName={`${member.firstName} ${member.lastName}`} />
          </TabsContent>

          <TabsContent value="medical" className="mt-0">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Groupe sanguin" value={member.bloodType} />
              <Field label="Allergies" value={member.allergies} />
              <Field label="Notes médicales" value={member.medicalNotes} />
              <Field label="Notes générales" value={member.notes} />
            </div>
          </TabsContent>

          <TabsContent value="documents" className="mt-0">
            <MemberDocuments memberId={memberId} />
          </TabsContent>

          <TabsContent value="cotisations" className="mt-0">
            <MemberCotisations memberId={memberId} />
          </TabsContent>

          <TabsContent value="progression" className="mt-0">
            <MemberProgression memberId={memberId} />
          </TabsContent>

          <TabsContent value="custom" className="mt-0">
            <MemberCustomFields memberId={memberId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
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
  const { data: reportTemplates } = useReportTemplates(true)
  const currentScoutYear = useCurrentScoutYear()
  const [generatingReport, setGeneratingReport] = useState<string | null>(null)

  // Per-member absence counts (the running calendar scout year, so pre-season réunions count) → roster badge.
  const { data: absenceCountsRaw } = useUnitAbsenceCounts(unitId, calendarScoutYear())
  const absenceCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of absenceCountsRaw ?? []) m.set(a.memberId, a.count)
    return m
  }, [absenceCountsRaw])

  // Run a CG-defined report template (roster PDF or data export) for this unit and trigger a download.
  const handleCustomReport = async (template: { id: string; name: string; reportType: string; format: string; columnsJson: string }) => {
    setGeneratingReport(template.id)
    try {
      const columns: string[] = JSON.parse(template.columnsJson)
      let response
      if (template.reportType === 'roster') {
        response = await generateRoster({ unitId, scoutYear: currentScoutYear, columns })
      } else {
        response = await generateExport({ unitId, scoutYear: currentScoutYear, columns, format: template.format })
      }
      const ext = template.format === 'xlsx' ? 'xlsx' : template.format === 'csv' ? 'csv' : 'pdf'
      const mimeType = ext === 'pdf' ? 'application/pdf' : ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv'
      saveBlob(response.data, `${template.name.replace(/\s+/g, '_')}.${ext}`, mimeType)
      toast.success('Rapport généré')
    } catch (err) {
      // Responses are blobs, so a backend JSON error (e.g. "aucun membre") is unreadable via parseApiError.
      toast.error(await parseBlobError(err))
    } finally {
      setGeneratingReport(null)
    }
  }

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
    filtered = teamFilter === 'none' ? filtered.filter(m => !m.teamName) : filtered.filter(m => m.teamName === teamFilter)
  }

  // Re-group the filtered list back into team sections, preserving first-seen team order.
  const grouped: { teamName: string | null; teamColor1: string | null; members: typeof filtered }[] = []
  const seen = new Set<string | null>()
  for (const m of filtered) {
    if (!seen.has(m.teamName)) {
      seen.add(m.teamName)
      grouped.push({ teamName: m.teamName, teamColor1: m.teamColor1, members: filtered.filter(f => f.teamName === m.teamName) })
    }
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
          <Tip content="Liste des membres (PDF)">
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setRosterOpen(true)}>
              <List className="mr-1 h-4 w-4" />Liste
            </Button>
          </Tip>
          <Tip content="Trombinoscope (PDF avec photos)">
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setTrombiOpen(true)}>
              <FileDown className="mr-1 h-4 w-4" />Trombinoscope
            </Button>
          </Tip>
          <Tip content="Exporter en Excel ou CSV">
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setExportOpen(true)}>
              <FileSpreadsheet className="mr-1 h-4 w-4" />
              Exporter
            </Button>
          </Tip>
          <Tip content="Imprimer les cartes de membre">
            <Button variant="outline" size="sm" className="shrink-0" onClick={handleBulkCards} disabled={bulkCardsLoading}>
              <CreditCard className="mr-1 h-4 w-4" />
              {bulkCardsLoading ? 'Génération...' : 'Cartes'}
            </Button>
          </Tip>
          <Tip content="Session photo de l'unité">
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate('/photo-session')}>
              <Camera className="mr-1 h-4 w-4" />
              Photos
            </Button>
          </Tip>
          {/* Opens the unit detail page (unit info + teams) — where the CU edits équipes and their foulard
              colours. The dashboard has no other path to it, so this is the CU's way in. */}
          <Tip content="Gérer les équipes de l'unité (noms, couleurs des foulards…)">
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate(`/units/${unitId}`)}>
              <UsersRound className="mr-1 h-4 w-4" />
              Équipes
            </Button>
          </Tip>
          {reportTemplates && reportTemplates.length > 0 && (
            <DropdownMenu>
              {/* Tip must wrap the trigger from the OUTSIDE: DropdownMenuTrigger asChild uses a Radix Slot
                  that clones its onClick/ref onto its single child. If that child is <Tip>, those props are
                  swallowed (Tip doesn't forward them) and the menu never opens. So nest Tip > Trigger > Button. */}
              <Tip content="Rapports personnalisés">
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="shrink-0">
                    <FileText className="mr-1 h-4 w-4" />
                    Rapports
                  </Button>
                </DropdownMenuTrigger>
              </Tip>
              <DropdownMenuContent align="end">
                {reportTemplates.map(t => (
                  <DropdownMenuItem
                    key={t.id}
                    onClick={() => handleCustomReport(t)}
                    disabled={generatingReport === t.id}
                  >
                    {generatingReport === t.id ? 'Génération...' : t.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
              {data.teams.map(t => <SelectItem key={t.teamId} value={t.teamName}>{t.teamName}</SelectItem>)}
              <SelectItem value="none">Sans équipe</SelectItem>
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
              <div key={group.teamName ?? '__none'}>
                <div className="sticky top-0 z-10 flex items-center gap-2 bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground border-b">
                  {group.teamColor1 && <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: group.teamColor1 }} />}
                  <span className="truncate">{group.teamName ?? 'Sans équipe'}</span>
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
                    <MemberPhoto
                      memberId={m.memberId}
                      name={`${m.firstName} ${m.lastName}`}
                      photoPath={m.photoPath}
                      size={32}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{m.lastName} {m.firstName}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.functionalRoleName}</p>
                    </div>
                    {absenceCounts.get(m.memberId) ? (
                      <Tip content="Absences aux réunions cette année">
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
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
            <MemberDetailPanel memberId={selectedMemberId} onBack={() => setSelectedMemberId(null)} />
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
    </div>
  )
}
