import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useUnitDashboard, type RosterMemberDto } from '@/services/dashboard-service'
import { useMember } from '@/services/member-service'
import { useDebounce } from '@/hooks/use-debounce'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { Users, Search, Phone, Mail, MapPin, GripVertical, FileDown, List, CreditCard, FileSpreadsheet, Camera } from 'lucide-react'

interface Props { unitId: string }

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value || '—'}</dd>
    </div>
  )
}

function MemberDetailPanel({ memberId }: { memberId: string }) {
  const { data: member, isLoading } = useMember(memberId)

  if (isLoading) return <div className="flex items-center justify-center h-full"><LoadingSpinner /></div>
  if (!member) return null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 border-b px-4 py-3 shrink-0 bg-card">
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

  const handleBulkCards = async () => {
    setBulkCardsLoading(true)
    try {
      const response = await generateBulkCards(unitId)
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Cartes_${data?.unitName?.replace(/\s+/g, '_') ?? 'Unite'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Cartes générées')
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setBulkCardsLoading(false)
    }
  }

  const handleDrag = useCallback((deltaX: number) => {
    setLeftWidth(w => Math.max(220, Math.min(500, w + deltaX)))
  }, [])

  if (isLoading) return <LoadingSpinner />
  if (!data) return <p className="text-muted-foreground">Unité introuvable.</p>

  const allMembers: (RosterMemberDto & { teamName: string | null; teamColor1: string | null })[] = [
    ...data.teams.flatMap(t => t.members.map(m => ({ ...m, teamName: t.teamName, teamColor1: t.color1 }))),
    ...data.unassignedMembers.map(m => ({ ...m, teamName: null, teamColor1: null })),
  ]

  let filtered = allMembers
  if (debouncedSearch) {
    const s = debouncedSearch.toLowerCase()
    filtered = filtered.filter(m => m.firstName.toLowerCase().includes(s) || m.lastName.toLowerCase().includes(s) || (m.cardNumber?.toLowerCase().includes(s)))
  }
  if (teamFilter && teamFilter !== 'all') {
    filtered = teamFilter === 'none' ? filtered.filter(m => !m.teamName) : filtered.filter(m => m.teamName === teamFilter)
  }

  // Group by team
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{data.unitName}</h1>
            <p className="text-xs text-muted-foreground">{data.unitTypeName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-4 text-center">
              <div><p className="text-lg font-bold">{data.totalMembers}</p><p className="text-xs text-muted-foreground">Membres</p></div>
              <div><p className="text-lg font-bold">{data.totalTeams}</p><p className="text-xs text-muted-foreground">Équipes</p></div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setRosterOpen(true)}>
              <List className="mr-1 h-4 w-4" />Liste
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTrombiOpen(true)}>
              <FileDown className="mr-1 h-4 w-4" />Trombinoscope
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
              <FileSpreadsheet className="mr-1 h-4 w-4" />
              Exporter
            </Button>
            <Button variant="outline" size="sm" onClick={handleBulkCards} disabled={bulkCardsLoading}>
              <CreditCard className="mr-1 h-4 w-4" />
              {bulkCardsLoading ? 'Génération...' : 'Cartes'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/photo-session')}>
              <Camera className="mr-1 h-4 w-4" />
              Photos
            </Button>
          </div>
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

      {/* 2-column layout */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 rounded-lg border overflow-hidden">
        {/* Left: member list */}
        <div className="overflow-y-auto bg-muted/30 shrink-0 max-h-64 md:max-h-full border-b md:border-b-0" style={{ width: leftWidth }}>
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
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
                      {m.firstName[0]}{m.lastName[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{m.lastName} {m.firstName}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.functionalRoleName}</p>
                    </div>
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

        {/* Right: member detail */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {selectedMemberId ? (
            <MemberDetailPanel memberId={selectedMemberId} />
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
