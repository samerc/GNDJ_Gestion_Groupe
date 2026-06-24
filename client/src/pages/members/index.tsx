import { parseApiError } from '@/lib/error-utils'
import { useState, useRef, useCallback, type ReactNode, type ComponentType } from 'react'
import { useParams } from 'react-router'
import { useDebounce } from '@/hooks/use-debounce'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { useFormValidation } from '@/hooks/use-form-validation'
import { useMembers, useMember, useCreateMember, useUpdateMember, type MemberFormData } from '@/services/member-service'
import { MemberPhoto } from '@/components/shared/member-photo'
import { useUnits } from '@/services/unit-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { useSettingArray, useSettingValue, matchSchool } from '@/services/settings-service'
import { MemberAssignments } from '@/components/members/member-assignments'
import { MemberGuardians } from '@/components/members/member-guardians'
import { MemberDocuments } from '@/components/members/member-documents'
import { MemberCotisations } from '@/components/members/member-cotisations'
import { MemberProgression } from '@/components/members/member-progression'
import { MemberCustomFields } from '@/components/members/member-custom-fields'
import { generateMemberCard } from '@/services/report-service'
import { ExportDialog } from '@/components/shared/export-dialog'
import { GENDER_OPTIONS, BLOOD_TYPE_OPTIONS, NATIONALITY_OPTIONS } from '@/lib/options'
import { cn } from '@/lib/utils'
import { Plus, Search, GripVertical, ArrowUpDown, ArrowUp, ArrowDown, Phone, Mail, MapPin, Copy, X, CreditCard, FileSpreadsheet, User, GraduationCap, Contact, Cake, Flag, Droplet, Pencil } from 'lucide-react'
import { toast } from 'sonner'

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value || '—'}</dd>
    </div>
  )
}

function computeAge(dob: string | null | undefined): number | null {
  if (!dob) return null
  const b = new Date(dob)
  if (isNaN(b.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age >= 0 && age < 130 ? age : null
}

function Section({ icon: Icon, title, children }: { icon: ComponentType<{ className?: string }>; title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4 text-primary/70" />{title}
      </h4>
      {children}
    </div>
  )
}

function Chip({ icon: Icon, children }: { icon?: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium shadow-2xs">
      {Icon && <Icon className="h-3.5 w-3.5 text-primary/70" />}{children}
    </span>
  )
}

// ─── Member detail panel ─────────────────
function MemberDetailPanel({ memberId }: { memberId: string }) {
  const { data: member, isLoading } = useMember(memberId)
  const updateMember = useUpdateMember()
  const [cardEditOpen, setCardEditOpen] = useState(false)
  const [cardDraft, setCardDraft] = useState('')

  if (isLoading) return <div className="flex items-center justify-center h-full"><LoadingSpinner /></div>
  if (!member) return null

  const age = computeAge(member.dateOfBirth)

  const saveExternalCard = async () => {
    try {
      await updateMember.mutateAsync({
        id: memberId,
        firstName: member.firstName, lastName: member.lastName,
        dateOfBirth: member.dateOfBirth, gender: member.gender,
        cardNumber: member.cardNumber, externalCardNumber: cardDraft.trim() || null,
        bloodType: member.bloodType, nationality: member.nationality,
        school: member.school, classe: member.classe, section: member.section,
        medicalNotes: member.medicalNotes, allergies: member.allergies, notes: member.notes,
      })
      toast.success('Numéro de carte enregistré')
      setCardEditOpen(false)
    } catch (err) { toast.error(parseApiError(err)) }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <MemberPhoto
            memberId={memberId}
            name={`${member.firstName} ${member.lastName}`}
            photoPath={member.photoPath}
            size={48}
            editable
          />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold">{member.firstName} {member.lastName}</h2>
            <p className="text-xs text-muted-foreground">
              {member.cardNumber && `N° ${member.cardNumber}`}
              {member.cardNumber && member.gender && ' — '}
              {member.gender}
              {member.dateOfBirth && ` — Né(e) le ${new Date(member.dateOfBirth).toLocaleDateString('fr-FR')}`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              const response = await generateMemberCard(memberId)
              const blob = new Blob([response.data], { type: 'application/pdf' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `Carte_${member.firstName}_${member.lastName}.pdf`
              a.click()
              URL.revokeObjectURL(url)
            } catch (err) { toast.error(parseApiError(err)) }
          }} title="Télécharger la carte">
            <CreditCard className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="info" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-4 mt-3 shrink-0 justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="info">Informations</TabsTrigger>
          <TabsTrigger value="famille">Famille</TabsTrigger>
          <TabsTrigger value="unites">Unités / Fonctions</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="cotisations">Cotisations</TabsTrigger>
          <TabsTrigger value="progression">Progression</TabsTrigger>
          <TabsTrigger value="custom">Infos complémentaires</TabsTrigger>
          <TabsTrigger value="medical">Médical</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto p-4">
          <TabsContent value="info" className="mt-0 space-y-6">
            {/* Hero: portrait + quick facts */}
            <div className="flex flex-col gap-4 rounded-xl border bg-gradient-to-br from-muted/50 to-transparent p-4 sm:flex-row sm:items-center">
              <MemberPhoto
                memberId={memberId}
                name={`${member.firstName} ${member.lastName}`}
                photoPath={member.photoPath}
                size={132}
                height={176}
                rounded="rounded-xl"
                editable
                className="shadow-sm ring-1 ring-border"
              />
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="text-xl font-bold leading-tight">{member.firstName} {member.lastName}</h3>
                  <p className="text-sm text-muted-foreground">
                    {member.cardNumber && <span>Matricule {member.cardNumber}</span>}
                    {member.externalCardNumber && <span> · Carte {member.externalCardNumber}</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {age != null && <Chip icon={Cake}>{age} ans</Chip>}
                  {member.gender && <Chip icon={User}>{member.gender}</Chip>}
                  {member.nationality && <Chip icon={Flag}>{member.nationality}</Chip>}
                  {member.bloodType && <Chip icon={Droplet}>{member.bloodType}</Chip>}
                </div>
              </div>
            </div>

            <Section icon={User} title="Identité">
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                <Field label="Prénom" value={member.firstName} />
                <Field label="Nom" value={member.lastName} />
                <Field label="Date de naissance" value={member.dateOfBirth ? `${new Date(member.dateOfBirth).toLocaleDateString('fr-FR')}${age != null ? ` (${age} ans)` : ''}` : null} />
                <Field label="Sexe" value={member.gender} />
                <Field label="Nationalité" value={member.nationality} />
                <Field label="Matricule" value={member.cardNumber} />
                <div>
                  <dt className="text-xs text-muted-foreground">Numéro de carte (SDL/GDL)</dt>
                  <dd className="flex items-center gap-1.5 text-sm font-medium">
                    {member.externalCardNumber || '—'}
                    <button type="button" className="text-muted-foreground hover:text-foreground"
                      title="Modifier le numéro de carte"
                      onClick={() => { setCardDraft(member.externalCardNumber ?? ''); setCardEditOpen(true) }}>
                      <Pencil className="h-3 w-3" />
                    </button>
                  </dd>
                </div>
              </div>
            </Section>

            <Section icon={GraduationCap} title="Scolarité">
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                <Field label="École" value={member.school} />
                <Field label="Classe" value={member.classe} />
                <Field label="Section" value={member.section} />
              </div>
            </Section>

            <Section icon={Contact} title="Coordonnées">
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                <div>
                  <h5 className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Phone className="h-3.5 w-3.5 text-muted-foreground" />Téléphones</h5>
                  {member.phones.length === 0 ? <p className="text-sm text-muted-foreground">Aucun</p> : (
                    <div className="space-y-1.5">{member.phones.map(p => (
                      <p key={p.id} className="text-sm">{p.countryCode} {p.number} <span className="text-muted-foreground">({p.type})</span></p>
                    ))}</div>
                  )}
                </div>
                <div>
                  <h5 className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Mail className="h-3.5 w-3.5 text-muted-foreground" />Courriels</h5>
                  {member.emails.length === 0 ? <p className="text-sm text-muted-foreground">Aucun</p> : (
                    <div className="space-y-1.5">{member.emails.map(e => (
                      <p key={e.id} className="text-sm break-all">{e.address} <span className="text-muted-foreground">({e.type})</span></p>
                    ))}</div>
                  )}
                </div>
                <div>
                  <h5 className="mb-2 flex items-center gap-1.5 text-sm font-medium"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />Adresses</h5>
                  {member.addresses.length === 0 ? <p className="text-sm text-muted-foreground">Aucune</p> : (
                    <div className="space-y-1.5">{member.addresses.map(a => (
                      <p key={a.id} className="text-sm">{a.city}, {a.country} <span className="text-muted-foreground">({a.type})</span></p>
                    ))}</div>
                  )}
                </div>
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="famille" className="mt-0">
            <MemberGuardians memberId={memberId} />
          </TabsContent>

          <TabsContent value="unites" className="mt-0">
            <MemberAssignments memberId={memberId} memberName="" />
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

          <TabsContent value="medical" className="mt-0">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Groupe sanguin" value={member.bloodType} />
              <Field label="Allergies" value={member.allergies} />
              <Field label="Notes médicales" value={member.medicalNotes} />
              <Field label="Notes générales" value={member.notes} />
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Edit external card number */}
      <Dialog open={cardEditOpen} onOpenChange={setCardEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Numéro de carte (SDL/GDL)</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Le numéro de carte officiel délivré par le SDL/GDL. Laisser vide si inconnu. (Le matricule interne {member.cardNumber} ne change pas.)</p>
            <Input value={cardDraft} onChange={(e) => setCardDraft(e.target.value)} placeholder="Ex: 20184180" maxLength={50}
              onKeyDown={(e) => { if (e.key === 'Enter') saveExternalCard() }} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setCardEditOpen(false)}>Annuler</Button>
            <Button type="button" onClick={saveExternalCard} disabled={updateMember.isPending}>{updateMember.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Drag handle ─────────────────────────
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
  const pinnedNationalities = useSettingArray('pinned_nationalities')
  const schools = useSettingArray('member.schools')
  const defaultSchool = useSettingValue('member.default_school')
  const classes = useSettingArray('member.classes')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [page, setPage] = useState(1)
  const [unitFilter, setUnitFilter] = useState<string>('all')
  const [showAlumni, setShowAlumni] = useState(false)
  const [sortBy, setSortBy] = useState('lastname')
  const [sortDir, setSortDir] = useState('asc')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(routeMemberId ?? null)
  const [leftWidth, setLeftWidth] = useState(340)

  // Export dialog
  const [exportOpen, setExportOpen] = useState(false)

  // Create dialog
  const [formOpen, setFormOpen] = useState(false)
  const [credentialsDialog, setCredentialsDialog] = useState<{ username: string; password: string; memberId: string } | null>(null)
  const [form, setForm] = useState<MemberFormData>({ firstName: '', lastName: '' })
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

  const unitId = unitFilter === 'all' || unitFilter === 'none' ? undefined : unitFilter
  const noUnit = unitFilter === 'none' ? true : undefined

  const { data: units } = useUnits({ pageSize: 100 })
  const { data, isLoading } = useMembers({
    search: debouncedSearch || undefined,
    unitId, noUnit,
    alumni: showAlumni || undefined,
    sortBy, sortDir,
    page, pageSize: 50,
  })

  const createMutation = useCreateMember()

  const openCreate = () => {
    setForm({ firstName: '', lastName: '', dateOfBirth: '', gender: '', bloodType: '', nationality: '', school: defaultSchool ?? '', classe: '', section: '', externalCardNumber: '' })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ firstName: !form.firstName, lastName: !form.lastName })) return
    try {
      const payload = { ...form, dateOfBirth: form.dateOfBirth || null, gender: form.gender || null, bloodType: form.bloodType || null, nationality: form.nationality || null, school: form.school || null, classe: form.classe || null, section: form.section || null }
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
      {/* Top bar */}
      <div className="shrink-0 space-y-3 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Membres</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} disabled={!unitFilter || unitFilter === 'all' || unitFilter === 'none'}>
              <FileSpreadsheet className="mr-1 h-4 w-4" />
              Exporter
            </Button>
            <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />Nouveau membre</Button>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Rechercher par nom, prénom ou carte..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="pl-8 pr-8 h-8 text-sm" />
            {search && (
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setSearch(''); setPage(1) }}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={unitFilter} onValueChange={(v) => { setUnitFilter(v); setPage(1) }}>
            <SelectTrigger className="w-52 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les unités</SelectItem>
              {units?.items.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              <SelectItem value="none">Sans unité</SelectItem>
            </SelectContent>
          </Select>
          {/* Actifs / Anciens toggle */}
          <div className="flex h-8 shrink-0 items-center rounded-md border p-0.5 text-xs">
            <button
              type="button"
              className={cn('h-full rounded px-2.5 font-medium transition-colors', !showAlumni ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => { setShowAlumni(false); setPage(1) }}
            >
              Actifs
            </button>
            <button
              type="button"
              className={cn('h-full rounded px-2.5 font-medium transition-colors', showAlumni ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => { setShowAlumni(true); setPage(1) }}
            >
              Anciens
            </button>
          </div>
          {data && <span className="flex items-center text-xs text-muted-foreground">{data.totalCount} membre{data.totalCount > 1 ? 's' : ''}</span>}
        </div>
      </div>

      {/* 2-column layout */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 rounded-lg border overflow-hidden">
        {/* Left: member list */}
        <div className="flex flex-col shrink-0 overflow-hidden max-h-72 md:max-h-full border-b md:border-b-0" style={{ width: leftWidth }}>
          {/* Sortable header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40 text-muted-foreground shrink-0">
            <div className="w-8" />
            <div className="flex-1 min-w-0">
              <SortHeader label="Nom" field="lastname" current={sortBy} dir={sortDir} onSort={handleSort} />
            </div>
            <div className="w-12 shrink-0 text-xs">Unité</div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto bg-muted/20">
            {isLoading ? <div className="flex items-center justify-center h-full"><LoadingSpinner /></div> :
             !data || data.items.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4">Aucun membre trouvé</div>
            ) : (
              <>
                {data.items.map(m => (
                  <div
                    key={m.id}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-border/40 transition-colors',
                      selectedMemberId === m.id ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-muted/60'
                    )}
                    onClick={() => setSelectedMemberId(m.id)}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
                      {m.firstName[0]}{m.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.lastName} {m.firstName}</p>
                      {m.dateOfBirth && <p className="text-[11px] text-muted-foreground">{new Date(m.dateOfBirth).toLocaleDateString('fr-FR')}</p>}
                    </div>
                    <div className="w-12 shrink-0 text-[11px] text-muted-foreground text-center">{m.unitName ?? '—'}</div>
                  </div>
                ))}
                {/* Pagination */}
                {data.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 p-2 border-t bg-muted/30">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={!data.hasPreviousPage} onClick={() => setPage(p => p - 1)}>Préc.</Button>
                    <span className="text-xs text-muted-foreground">{data.page}/{data.totalPages}</span>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={!data.hasNextPage} onClick={() => setPage(p => p + 1)}>Suiv.</Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Drag handle: desktop only */}
        <div className="hidden md:flex">
          <DragHandle onDrag={handleDrag} />
        </div>

        {/* Right: member detail */}
        <div className="flex-1 min-w-0 overflow-hidden bg-background">
          {selectedMemberId ? (
            <MemberDetailPanel memberId={selectedMemberId} />
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel htmlFor="firstName" required>Prénom</RequiredLabel>
                <Input id="firstName" className={fieldClass('firstName')} value={form.firstName} onChange={(e) => { setForm(f => ({ ...f, firstName: e.target.value })); clearField('firstName') }} required />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="lastName" required>Nom</RequiredLabel>
                <Input id="lastName" className={fieldClass('lastName')} value={form.lastName} onChange={(e) => { setForm(f => ({ ...f, lastName: e.target.value.toUpperCase() })); clearField('lastName') }} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel required>Nationalité</RequiredLabel>
                <div className="flex items-center gap-1">
                  <div className="flex-1">
                    <SearchableSelect value={form.nationality ?? ''} onValueChange={(v) => setForm(f => ({ ...f, nationality: v || null }))} options={NATIONALITY_OPTIONS} pinnedValues={pinnedNationalities} searchPlaceholder="Rechercher une nationalité..." />
                  </div>
                  {form.nationality && (
                    <Button variant="ghost" size="icon" type="button" className="h-7 w-7 shrink-0" onClick={() => setForm(f => ({ ...f, nationality: '' }))}>
                      <X className="h-3 w-3" />
                    </Button>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel required>École</RequiredLabel>
                {(() => {
                  const isOtherSchool = form.school ? !schools.includes(form.school) : false
                  return (
                    <>
                      <Select
                        value={isOtherSchool ? '__other__' : (form.school || '')}
                        onValueChange={(v) => {
                          if (v === '__other__') setForm(f => ({ ...f, school: '' }))
                          else setForm(f => ({ ...f, school: v }))
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                        <SelectContent>
                          {schools.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          <SelectItem value="__other__">Autre...</SelectItem>
                        </SelectContent>
                      </Select>
                      {isOtherSchool && (
                        <Input value={form.school || ''} onChange={(e) => setForm(f => ({ ...f, school: e.target.value }))} onBlur={(e) => setForm(f => ({ ...f, school: matchSchool(e.target.value, schools) }))} placeholder="Nom de l'école..." />
                      )}
                    </>
                  )
                })()}
              </div>
              <div className="space-y-2">
                <RequiredLabel required>Classe</RequiredLabel>
                <Select value={form.classe || ''} onValueChange={(v) => setForm(f => ({ ...f, classe: v }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    {classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel>Section</RequiredLabel>
                <Input value={form.section || ''} onChange={(e) => setForm(f => ({ ...f, section: e.target.value.slice(0, 5) }))} placeholder="Ex: SV, SE..." maxLength={5} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Numéro de carte (SDL/GDL)</RequiredLabel>
                <Input value={form.externalCardNumber || ''} onChange={(e) => setForm(f => ({ ...f, externalCardNumber: e.target.value }))} placeholder="Optionnel" maxLength={50} />
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
      {unitFilter && unitFilter !== 'all' && unitFilter !== 'none' && (
        <ExportDialog
          unitId={unitFilter}
          unitName={units?.items.find(u => u.id === unitFilter)?.name ?? ''}
          open={exportOpen}
          onOpenChange={setExportOpen}
        />
      )}

      {/* Credentials dialog */}
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
                  <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(credentialsDialog?.username ?? ''); toast.success('Copié !') }}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Mot de passe :</span>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 rounded bg-muted px-2 py-1 text-sm font-bold">{credentialsDialog?.password}</code>
                  <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(credentialsDialog?.password ?? ''); toast.success('Copié !') }}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { if (credentialsDialog) setSelectedMemberId(credentialsDialog.memberId); setCredentialsDialog(null) }}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
