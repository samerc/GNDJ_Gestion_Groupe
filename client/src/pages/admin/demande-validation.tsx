// CG enrollment-request (demande d'inscription) triage screen.
// Audience: Chef de Groupe (super-admin + association-admin via demande.manage).
// Excel-style sortable TABLE of all demandes for a scout year + a right-side detail
// drawer (Sheet) for the full applicant file. Supports per-row and bulk accept/decline
// (each with a unit picker), one-click "suggested unit" chips, sibling grouping/highlight,
// quota warnings, incomplete-dossier flags, and keyboard triage (A/R/arrows in the drawer).
// Decisions are staged (Approved/Declined) and only become final/emailed on "Envoyer les réponses",
// which is gated until every demande in scope is decided (no undecided 'Submitted' left).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSettingValue, useSchoolCode } from '@/services/settings-service'
import {
  useDemandesForReview, useUnitOccupancy, useDecideDemande, useBulkDecideDemande, useSetIntakeQuota, useSendResponses,
  type DemandeReview, type UnitOccupancy,
} from '@/services/demande-admin-service'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Tip } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { parseApiError } from '@/lib/error-utils'
import {
  Inbox, Check, X, Send, Users2, ChevronDown, ChevronRight, ChevronLeft, CheckCircle2, XCircle, Clock,
  AlertTriangle, User, Phone, Mail, MapPin, HeartPulse, GraduationCap, MessageSquare, Tent, ArrowUpDown,
  Search, Sparkles, Trash2, Link2,
} from 'lucide-react'

// ── helpers ────────────────────────────────────────────────────────────────
function eligible(u: UnitOccupancy, d: DemandeReview): boolean {
  const g = !u.gender || u.gender === 'Mixte' || u.gender === d.gender
  const a = d.age == null || ((u.ageMin == null || d.age >= u.ageMin) && (u.ageMax == null || d.age <= u.ageMax))
  return g && a
}

function unitFull(u: UnitOccupancy): boolean {
  return u.quota != null && u.accepted >= u.quota
}

// Eligible (gender + age fits the unit) AND not over quota, balanced by fewest accepted this round
// then lowest projected post-passage — spreads newcomers across units. Falls back to any eligible
// unit if every eligible one is already full.
function suggestUnit(d: DemandeReview, occupancy: UnitOccupancy[]): UnitOccupancy | null {
  const elig = occupancy.filter((u) => eligible(u, d))
  if (!elig.length) return null
  const notFull = elig.filter((u) => !unitFull(u))
  const pool = notFull.length ? notFull : elig
  return pool.slice().sort((a, b) => (a.accepted - b.accepted) || (a.projected - b.projected) || a.unitCode.localeCompare(b.unitCode))[0]
}

// What's missing in an application (for the data-quality flag).
function missingInfo(d: DemandeReview): string[] {
  const m: string[] = []
  if (!d.dateOfBirth) m.push('Date de naissance')
  if (!d.guardians || d.guardians.length === 0) m.push('Aucun parent/tuteur')
  else if (!d.guardians.some((g) => g.phoneNumber)) m.push('Aucun téléphone parent')
  return m
}

const RELATION_LABEL: Record<string, string> = {
  CurrentInGroup: 'Dans notre groupe', AncienInGroup: 'Ancien de notre groupe', OtherGroup: 'Autre groupe',
}

function genderShort(g: string | null): string {
  return g === 'Masculin' ? 'M' : g === 'Féminin' ? 'F' : (g ?? '')
}

// Left-border colour + label for a row: green=accepted, red=declined, blue=still to study.
// "(envoyée)" suffix once the response email has been sent (responseSentAt), which locks the row.
function statusInfo(d: DemandeReview): { border: string; label: string } {
  if (d.status === 'Approved') return { border: 'border-l-green-500', label: d.responseSentAt ? 'Acceptée (envoyée)' : 'Acceptée' }
  if (d.status === 'Declined') return { border: 'border-l-red-500', label: d.responseSentAt ? 'Refusée (envoyée)' : 'Refusée' }
  return { border: 'border-l-blue-500', label: 'À étudier' }
}

function relationsSummary(d: DemandeReview): string {
  return d.scoutRelations.map((r) => {
    const name = [r.firstName, r.lastName].filter(Boolean).join(' ') || '—'
    const where = r.otherGroupName || r.lastUnit || ''
    const lbl = RELATION_LABEL[r.status] ?? r.status
    return `• ${name} — ${lbl}${where ? ` (${where})` : ''}${r.relationship ? ` [${r.relationship}]` : ''}`
  }).join('\n')
}

type SortKey = 'name' | 'age' | 'classe'

export default function DemandeValidationPage() {
  const scoutYear = useSettingValue('demande.scout_year') ?? '2026-2027'
  const siblingsTogether = useSettingValue('demande.decide_siblings_together') === 'true'
  const schoolCode = useSchoolCode()

  // Server-side filters (status/gender/classe/age) vs client-side search box (handled in `rows`).
  const [status, setStatus] = useState('all')
  const [gender, setGender] = useState('all')
  const [classe, setClasse] = useState('')
  const [ageMin, setAgeMin] = useState('')
  const [ageMax, setAgeMax] = useState('')
  const [search, setSearch] = useState('')
  const [showOccupancy, setShowOccupancy] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const filters = useMemo(() => ({
    status: status === 'all' ? undefined : status,
    gender: gender === 'all' ? undefined : gender,
    classe: classe || undefined,
    ageMin: ageMin ? Number(ageMin) : undefined,
    ageMax: ageMax ? Number(ageMax) : undefined,
  }), [status, gender, classe, ageMin, ageMax])

  const { data: demandes, isLoading } = useDemandesForReview(scoutYear, filters)
  const { data: occupancy } = useUnitOccupancy(scoutYear)
  const decideMutation = useDecideDemande()
  const bulkMutation = useBulkDecideDemande()
  const sendMutation = useSendResponses()

  const [approveTarget, setApproveTarget] = useState<DemandeReview | null>(null)
  const [declineTarget, setDeclineTarget] = useState<DemandeReview | null>(null)
  const [pickUnit, setPickUnit] = useState('')
  const [decisionNote, setDecisionNote] = useState('')
  const [sendOpen, setSendOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkUnit, setBulkUnit] = useState('')
  const [bulkMotif, setBulkMotif] = useState('')

  // Memoized so the fallback [] is a stable reference (keeps the downstream useMemos from recomputing every render).
  const all = useMemo(() => demandes ?? [], [demandes])
  const occList = useMemo(() => occupancy ?? [], [occupancy])
  // Lookup maps for O(1) access by unit id / demande id (used by suggest, quota hints, bulk).
  const occByUnit = useMemo(() => Object.fromEntries(occList.map((u) => [u.unitId, u])), [occList])
  const byId = useMemo(() => Object.fromEntries(all.map((d) => [d.id, d])), [all])

  // Account → number of demandes (for sibling grouping/highlight, within the loaded set).
  const accountCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const d of all) m[d.accountId] = (m[d.accountId] ?? 0) + 1
    return m
  }, [all])

  // filter (search) → sort → group siblings adjacent
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q ? all.filter((d) => `${d.firstName} ${d.lastName} ${d.lastName} ${d.firstName}`.toLowerCase().includes(q)) : all
    const dir = sortDir === 'asc' ? 1 : -1
    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'age': return ((a.age ?? -1) - (b.age ?? -1)) * dir
        case 'classe': return (a.classe ?? '').localeCompare(b.classe ?? '') * dir
        default: return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`) * dir
      }
    })
    if (!siblingsTogether) return sorted
    // Keep same-account demandes adjacent, anchored at first appearance.
    const seen = new Set<string>()
    const grouped: DemandeReview[] = []
    for (const d of sorted) {
      if (seen.has(d.id)) continue
      grouped.push(d); seen.add(d.id)
      if ((accountCounts[d.accountId] ?? 0) > 1) {
        for (const s of sorted) if (!seen.has(s.id) && s.accountId === d.accountId) { grouped.push(s); seen.add(s.id) }
      }
    }
    return grouped
  }, [all, search, sortKey, sortDir, siblingsTogether, accountCounts])

  // Send gate: there must be staged decisions to send AND no demande still undecided.
  // status==='all' forces the user to view the full set so a filtered-out 'Submitted' can't be missed.
  const pendingSend = all.filter((d) => (d.status === 'Approved' || d.status === 'Declined') && !d.responseSentAt).length
  const undecided = all.filter((d) => d.status === 'Submitted' && !d.responseSentAt).length
  const canSend = pendingSend > 0 && undecided === 0 && status === 'all'

  const detailIndex = rows.findIndex((d) => d.id === detailId)
  const detail = detailIndex >= 0 ? rows[detailIndex] : null

  // Selectable = visible & not locked (a sent response can no longer be re-decided).
  const selectableIds = useMemo(() => rows.filter((d) => !d.responseSentAt).map((d) => d.id), [rows])
  const selectedCount = selected.size
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))
  const someSelected = selectedCount > 0 && !allSelected

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }
  const toggleOne = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableIds))
  const clearSelection = () => setSelected(new Set())

  const openApprove = (d: DemandeReview, preset?: string) => { setApproveTarget(d); setPickUnit(preset ?? d.decidedUnitId ?? ''); setDecisionNote(d.decisionNotes ?? '') }
  const openDecline = (d: DemandeReview) => { setDeclineTarget(d); setDecisionNote(d.decisionNotes ?? '') }

  // Stage a single decision (not yet emailed). Approve requires a target unit.
  const decide = async (d: DemandeReview, newStatus: 'Approved' | 'Declined', unitId: string | null, note: string | null) => {
    if (newStatus === 'Approved' && !unitId) { toast.error('Veuillez choisir une unité.'); return false }
    try {
      await decideMutation.mutateAsync({ id: d.id, status: newStatus, decidedUnitId: newStatus === 'Approved' ? unitId : null, decisionNotes: note || null })
      toast.success(newStatus === 'Approved' ? "Demande acceptée (en attente d'envoi)" : "Demande refusée (en attente d'envoi)")
      return true
    } catch (err) { toast.error(parseApiError(err)); return false }
  }

  const confirmApprove = async () => { if (approveTarget && await decide(approveTarget, 'Approved', pickUnit, decisionNote)) setApproveTarget(null) }
  const confirmDecline = async () => { if (declineTarget && await decide(declineTarget, 'Declined', null, decisionNote)) setDeclineTarget(null) }

  // ── bulk actions ───────────────────────────────────────────────
  const runBulk = async (payload: { status: string; decisionNotes?: string | null; items: { id: string; decidedUnitId?: string | null }[] }, label: string) => {
    if (!payload.items.length) { toast.error('Aucun élément applicable.'); return }
    try {
      const r = await bulkMutation.mutateAsync(payload)
      toast.success(`${r.processed} ${label}${r.skipped ? ` · ${r.skipped} ignorée(s)` : ''}`)
      clearSelection(); setBulkMotif('')
    } catch (err) { toast.error(parseApiError(err)) }
  }
  const bulkApproveToUnit = () => {
    if (!bulkUnit) { toast.error('Choisissez une unité.'); return }
    runBulk({ status: 'Approved', items: [...selected].map((id) => ({ id, decidedUnitId: bulkUnit })) }, 'acceptée(s)')
  }
  // Accept the whole selection, each into its own suggestUnit() target; ones with no eligible unit are skipped.
  const bulkApproveSuggested = () => {
    const items: { id: string; decidedUnitId: string }[] = []
    let noSug = 0
    for (const id of selected) {
      const d = byId[id]; if (!d) continue
      const s = suggestUnit(d, occList)
      if (s) items.push({ id, decidedUnitId: s.unitId }); else noSug++
    }
    if (noSug) toast.warning(`${noSug} demande(s) sans unité éligible — ignorée(s).`)
    runBulk({ status: 'Approved', items }, 'acceptée(s) (unité suggérée)')
  }
  const bulkDecline = () => runBulk({ status: 'Declined', decisionNotes: bulkMotif || null, items: [...selected].map((id) => ({ id })) }, 'refusée(s)')

  // Final, irreversible step: converts accepted demandes → real members (login + assignment) and
  // emails every family. Backend is advisory-locked + idempotent.
  const handleSend = async () => {
    try {
      const r = await sendMutation.mutateAsync(scoutYear)
      toast.success(`${r.approved} acceptée(s) converties en membres, ${r.declined} refusée(s) notifiée(s)`)
      setSendOpen(false)
    } catch (err) { toast.error(parseApiError(err)); setSendOpen(false) }
  }

  const busy = decideMutation.isPending || bulkMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Demandes d'inscription — {scoutYear}</h1>
          <p className="text-sm text-muted-foreground">{all.length} demande(s) · {pendingSend} décision(s) en attente d'envoi</p>
        </div>
        <Button size="lg" disabled={!canSend || sendMutation.isPending} onClick={() => setSendOpen(true)}>
          <Send className="mr-2 h-4 w-4" />Envoyer les réponses{pendingSend > 0 ? ` (${pendingSend})` : ''}
        </Button>
      </div>

      {status === 'all' && undecided > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <span><strong>{undecided} demande(s) encore à étudier.</strong> Toutes les demandes doivent être acceptées ou refusées avant de pouvoir envoyer les réponses.</span>
        </div>
      )}
      {status !== 'all' && pendingSend > 0 && undecided === 0 && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          Affichez « Toutes » les demandes pour vérifier qu'aucune n'est en attente, puis envoyez les réponses.
        </div>
      )}

      {/* Occupancy panel */}
      <Card>
        <CardHeader className="cursor-pointer py-3" onClick={() => setShowOccupancy((v) => !v)}>
          <CardTitle className="flex items-center gap-2 text-base">
            {showOccupancy ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Users2 className="h-4 w-4" />Capacité des unités (projetée après passage)
          </CardTitle>
        </CardHeader>
        {showOccupancy && (
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left">Unité</th><th className="px-3 py-2">Actuels</th>
                <th className="px-3 py-2">Projeté</th><th className="px-3 py-2">Quota</th>
                <th className="px-3 py-2">Acceptés</th><th className="px-3 py-2">Places restantes</th>
              </tr></thead>
              <tbody>
                {occList.map((u) => <OccRow key={u.unitId} u={u} scoutYear={scoutYear} />)}
              </tbody>
            </table>
          </CardContent>
        )}
      </Card>

      {/* Filters */}
      <Card><CardContent className="flex flex-wrap items-end gap-3 py-4">
        <div className="w-full space-y-1 sm:w-auto">
          <label className="text-xs font-medium">Recherche</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="w-full pl-8 pr-7 sm:w-56" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom ou prénom..." />
            {search && <Tip content="Effacer"><button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch('')}><X className="h-3.5 w-3.5" /></button></Tip>}
          </div>
        </div>
        <div className="w-full space-y-1 sm:w-auto"><label className="text-xs font-medium">Statut</label>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              <SelectItem value="Submitted">À étudier</SelectItem>
              <SelectItem value="Approved">Acceptées</SelectItem>
              <SelectItem value="Declined">Refusées</SelectItem>
            </SelectContent></Select></div>
        <div className="w-full space-y-1 sm:w-auto"><label className="text-xs font-medium">Genre</label>
          <Select value={gender} onValueChange={setGender}><SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous</SelectItem><SelectItem value="Masculin">Masculin</SelectItem><SelectItem value="Féminin">Féminin</SelectItem></SelectContent></Select></div>
        <div className="w-full space-y-1 sm:w-auto"><label className="text-xs font-medium">Classe</label><Input className="w-full sm:w-28" value={classe} onChange={(e) => setClasse(e.target.value)} placeholder="ex. EB2" /></div>
        <div className="flex-1 space-y-1 sm:flex-none"><label className="text-xs font-medium">Âge min</label><Input className="w-full sm:w-20" type="number" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} /></div>
        <div className="flex-1 space-y-1 sm:flex-none"><label className="text-xs font-medium">Âge max</label><Input className="w-full sm:w-20" type="number" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} /></div>
      </CardContent></Card>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 shadow-sm">
          <span className="text-sm font-medium">{selectedCount} sélectionnée(s)</span>
          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            <Select value={bulkUnit} onValueChange={setBulkUnit}>
              <SelectTrigger className="h-9 w-full sm:w-56"><SelectValue placeholder="Unité..." /></SelectTrigger>
              <SelectContent>
                {occList.map((u) => <SelectItem key={u.unitId} value={u.unitId}>{u.unitCode} — {u.unitName} · {u.accepted}{u.quota != null ? `/${u.quota}` : ''}{unitFull(u) ? ' ⚠' : ''}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={busy || !bulkUnit} onClick={bulkApproveToUnit}><Check className="mr-1 h-4 w-4" />Accepter → unité</Button>
          </div>
          <Button size="sm" variant="outline" disabled={busy} onClick={bulkApproveSuggested}><Sparkles className="mr-1 h-4 w-4" />Accepter (unité suggérée)</Button>
          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            <Input className="h-9 w-full sm:w-48" value={bulkMotif} onChange={(e) => setBulkMotif(e.target.value)} placeholder="Motif de refus (optionnel)" />
            <Button size="sm" variant="destructive" disabled={busy} onClick={bulkDecline}><X className="mr-1 h-4 w-4" />Refuser</Button>
          </div>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={clearSelection}><Trash2 className="mr-1 h-4 w-4" />Effacer</Button>
        </div>
      )}

      {/* Table */}
      {isLoading ? <LoadingSpinner variant="table" /> : rows.length === 0 ? (
        <EmptyState icon={Inbox} title="Aucune demande" description="Aucune demande ne correspond aux filtres." />
      ) : (
        <Card>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 border-b px-4 py-2.5 text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wide">Statut :</span>
            <LegendItem color="bg-blue-500" label="À étudier" />
            <LegendItem color="bg-green-500" label="Acceptée" />
            <LegendItem color="bg-red-500" label="Refusée" />
            <span className="ml-auto hidden sm:inline">Cliquez sur une ligne pour le dossier complet</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <HeaderCheckbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
                </TableHead>
                <SortableHead label="Nom" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Âge" k="age" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-center" />
                <TableHead className="text-center">Genre</TableHead>
                <SortableHead label="Classe" k="classe" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <TableHead className="hidden md:table-cell">École</TableHead>
                <TableHead className="hidden text-center md:table-cell">Relations</TableHead>
                <TableHead className="hidden text-center md:table-cell">Fratrie</TableHead>
                <TableHead>Unité</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => {
                const locked = !!d.responseSentAt
                const si = statusInfo(d)
                const isSibling = (accountCounts[d.accountId] ?? 0) > 1 // amber-tinted row when same account has ≥2 demandes
                const miss = missingInfo(d)
                const decidedUnit = d.decidedUnitId ? occByUnit[d.decidedUnitId] : undefined
                // Only undecided rows show the one-click suggested-unit chip; decided rows show their chosen unit.
                const sug = !d.decidedUnitId && d.status === 'Submitted' ? suggestUnit(d, occList) : null
                return (
                  <TableRow key={d.id} className={`cursor-pointer ${isSibling ? 'bg-amber-50/40' : ''}`} onClick={() => setDetailId(d.id)}>
                    <TableCell className={`border-l-4 ${si.border}`} title={si.label} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary disabled:opacity-40" checked={selected.has(d.id)} disabled={locked} onChange={() => toggleOne(d.id)} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        {d.lastName} {d.firstName}
                        {miss.length > 0 && <span title={`Dossier incomplet : ${miss.join(', ')}`}><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /></span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">{d.age ?? '—'}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{genderShort(d.gender)}</TableCell>
                    <TableCell className="text-muted-foreground">{d.classe}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell" title={d.school ?? ''}>{schoolCode(d.school)}</TableCell>
                    <TableCell className="hidden text-center md:table-cell">
                      {d.scoutRelations.length > 0 && (
                        <span className="inline-flex cursor-help items-center gap-1 text-xs text-muted-foreground" title={relationsSummary(d)}>
                          <Tent className="h-3.5 w-3.5" />{d.scoutRelations.length}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-center md:table-cell">{siblingsTogether && d.siblings.length > 0 && <Badge variant="outline" className="text-xs">{d.siblings.length}</Badge>}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {decidedUnit ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          {decidedUnit.unitCode}
                          {unitFull(decidedUnit) && <span title="Quota atteint"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /></span>}
                        </span>
                      ) : sug ? (
                        <Tip content={`Unité suggérée — cliquer pour accepter${unitFull(sug) ? ' (quota atteint)' : ''}`}>
                        <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10" onClick={() => openApprove(d, sug.unitId)}>
                          <Sparkles className="h-3 w-3" />{sug.unitCode}
                          {unitFull(sug) && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                        </button>
                        </Tip>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {!locked && (
                        <div className="flex justify-end gap-1">
                          <Tip content="Accepter"><Button size="sm" variant={d.status === 'Approved' ? 'default' : 'outline'} className="h-8 px-2" onClick={() => openApprove(d)}><Check className="h-4 w-4" /></Button></Tip>
                          <Tip content="Refuser"><Button size="sm" variant={d.status === 'Declined' ? 'destructive' : 'outline'} className="h-8 px-2" onClick={() => openDecline(d)}><X className="h-4 w-4" /></Button></Tip>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Detail drawer */}
      <Sheet open={!!detail} onOpenChange={(o) => { if (!o) setDetailId(null) }}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
          {detail && (
            <DetailPanel
              d={detail}
              occupancy={occList}
              occByUnit={occByUnit}
              siblingsTogether={siblingsTogether}
              busy={busy}
              hasPrev={detailIndex > 0}
              hasNext={detailIndex < rows.length - 1}
              onPrev={() => detailIndex > 0 && setDetailId(rows[detailIndex - 1].id)}
              onNext={() => detailIndex < rows.length - 1 && setDetailId(rows[detailIndex + 1].id)}
              onDecide={decide}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Approve dialog (row quick action) */}
      <Dialog open={!!approveTarget} onOpenChange={() => setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Accepter — {approveTarget?.firstName} {approveTarget?.lastName}</DialogTitle></DialogHeader>
          {approveTarget && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">{approveTarget.age != null ? `${approveTarget.age} ans` : ''} · {approveTarget.gender}</div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Unité d'affectation</label>
                <UnitSelect occupancy={occList} d={approveTarget} value={pickUnit} onChange={setPickUnit} />
                {pickUnit && occByUnit[pickUnit] && <UnitHint u={occByUnit[pickUnit]} d={approveTarget} />}
              </div>
              <div className="space-y-1.5"><label className="text-sm font-medium">Note (optionnel)</label><Input value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>Annuler</Button>
            <Button onClick={confirmApprove} disabled={decideMutation.isPending}>Accepter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline dialog (row quick action) */}
      <Dialog open={!!declineTarget} onOpenChange={() => setDeclineTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Refuser — {declineTarget?.firstName} {declineTarget?.lastName}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Motif (optionnel, inclus dans l'email)</label>
            <Input value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="Ex. : effectif complet" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineTarget(null)}>Annuler</Button>
            <Button variant="destructive" onClick={confirmDecline} disabled={decideMutation.isPending}>Refuser</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={sendOpen} onOpenChange={setSendOpen}
        title="Envoyer les réponses"
        description={`Ceci va convertir les demandes acceptées en membres (avec identifiants) et notifier toutes les familles concernées. ${pendingSend} décision(s) seront envoyées. Cette action est définitive. Continuer ?`}
        confirmLabel="Envoyer" loading={sendMutation.isPending} onConfirm={handleSend}
      />
    </div>
  )
}

// ── status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ d }: { d: DemandeReview }) {
  if (d.responseSentAt) {
    if (d.status === 'Approved') return <Badge className="bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Acceptée (envoyée)</Badge>
    if (d.status === 'Declined') return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Refusée (envoyée)</Badge>
  }
  if (d.status === 'Approved') return <Badge className="bg-green-600/90"><Check className="mr-1 h-3 w-3" />Acceptée</Badge>
  if (d.status === 'Declined') return <Badge variant="destructive"><X className="mr-1 h-3 w-3" />Refusée</Badge>
  return <Badge className="bg-blue-600"><Clock className="mr-1 h-3 w-3" />À étudier</Badge>
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`h-3 w-1.5 rounded-sm ${color}`} />{label}</span>
}

function HeaderCheckbox({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  // `indeterminate` is a DOM-only property (no React prop) — must be set imperatively.
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate }, [indeterminate])
  return <input ref={ref} type="checkbox" className="h-4 w-4 rounded border-input accent-primary" checked={checked} onChange={onChange} onClick={(e) => e.stopPropagation()} />
}

function SortableHead({ label, k, sortKey, sortDir, onSort, className }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void; className?: string
}) {
  const active = sortKey === k
  return (
    <TableHead className={className}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort(k)}>
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? 'opacity-100' : 'opacity-40'}`} />
        {active && <span className="text-[10px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </TableHead>
  )
}

// ── shared unit picker ────────────────────────────────────────────────────────
function UnitSelect({ occupancy, d, value, onChange }: { occupancy: UnitOccupancy[]; d: DemandeReview | null; value: string; onChange: (v: string) => void }) {
  if (!d) return null
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Choisir une unité" /></SelectTrigger>
      <SelectContent>
        {occupancy.slice().sort((a, b) => Number(eligible(b, d)) - Number(eligible(a, d))).map((u) => {
          const elig = eligible(u, d)
          return <SelectItem key={u.unitId} value={u.unitId}>
            {u.unitCode} — {u.unitName} {elig ? '✓' : ''} · {u.accepted}{u.quota != null ? `/${u.quota}` : ''} {unitFull(u) ? '⚠' : ''}
          </SelectItem>
        })}
      </SelectContent>
    </Select>
  )
}

function UnitHint({ u, d }: { u: UnitOccupancy; d: DemandeReview }) {
  return (
    <p className="text-xs text-muted-foreground">
      Projeté après passage : {u.projected} · Acceptés ce tour : {u.accepted}{u.quota != null ? ` / quota ${u.quota}` : ''}
      {unitFull(u) && <span className="text-amber-600"> — quota atteint</span>}
      {!eligible(u, d) && <span className="text-amber-600"> — hors critères genre/âge</span>}
    </p>
  )
}

// ── detail drawer panel ────────────────────────────────────────────────────────
function DetailPanel({ d, occupancy, occByUnit, siblingsTogether, busy, hasPrev, hasNext, onPrev, onNext, onDecide }: {
  d: DemandeReview
  occupancy: UnitOccupancy[]
  occByUnit: Record<string, UnitOccupancy>
  siblingsTogether: boolean
  busy: boolean
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  onDecide: (d: DemandeReview, status: 'Approved' | 'Declined', unitId: string | null, note: string | null) => Promise<boolean>
}) {
  const locked = !!d.responseSentAt
  const suggested = useMemo(() => suggestUnit(d, occupancy), [d, occupancy])
  // Local decision draft: pre-fill unit with the already-decided unit, else the suggestion.
  const [unit, setUnit] = useState(d.decidedUnitId ?? suggested?.unitId ?? '')
  const [note, setNote] = useState(d.status === 'Approved' ? (d.decisionNotes ?? '') : '')
  const [motif, setMotif] = useState(d.status === 'Declined' ? (d.decisionNotes ?? '') : '')

  // Reset decision fields when navigating to another applicant or when this one's decision changes
  // (render-phase reset, keyed on the applicant's identity + decision fields).
  const resetKey = `${d.id}|${d.decidedUnitId ?? ''}|${d.status}|${d.decisionNotes ?? ''}`
  const [prevResetKey, setPrevResetKey] = useState(resetKey)
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey)
    setUnit(d.decidedUnitId ?? suggestUnit(d, occupancy)?.unitId ?? '')
    setNote(d.status === 'Approved' ? (d.decisionNotes ?? '') : '')
    setMotif(d.status === 'Declined' ? (d.decisionNotes ?? '') : '')
  }

  // Keyboard triage: ←/→ navigate, A approve, R refuse. Ignored while typing or a dropdown is open.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (document.querySelector('[role="listbox"]')) return // a Select is open
      if (e.key === 'ArrowLeft' && hasPrev) { e.preventDefault(); onPrev() }
      else if (e.key === 'ArrowRight' && hasNext) { e.preventDefault(); onNext() }
      else if (!locked && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); onDecide(d, 'Approved', unit, note) }
      else if (!locked && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); onDecide(d, 'Declined', null, motif) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [d, unit, note, motif, locked, hasPrev, hasNext, onPrev, onNext, onDecide])

  const addr = [d.addressDetails, d.addressCity, d.addressCountry].filter(Boolean).join(', ')
  const miss = missingInfo(d)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-muted/30 p-5">
        <div className="flex items-center justify-between pr-8">
          <div className="flex gap-1">
            <Tip content="Précédent (←)"><Button variant="ghost" size="icon" className="h-7 w-7" disabled={!hasPrev} onClick={onPrev}><ChevronLeft className="h-4 w-4" /></Button></Tip>
            <Tip content="Suivant (→)"><Button variant="ghost" size="icon" className="h-7 w-7" disabled={!hasNext} onClick={onNext}><ChevronRight className="h-4 w-4" /></Button></Tip>
          </div>
          <StatusBadge d={d} />
        </div>
        <h2 className="mt-2 flex items-center gap-2 text-xl font-bold">
          {d.firstName} {d.lastName}
          {miss.length > 0 && <span title={`Dossier incomplet : ${miss.join(', ')}`}><AlertTriangle className="h-4 w-4 text-amber-500" /></span>}
        </h2>
        <p className="text-sm text-muted-foreground">
          {d.age != null ? `${d.age} ans` : 'âge inconnu'}
          {d.dateOfBirth ? ` (${new Date(d.dateOfBirth).toLocaleDateString('fr-FR')})` : ''} · {d.gender}
          {d.submittedAt ? ` · déposée le ${new Date(d.submittedAt).toLocaleDateString('fr-FR')}` : ''}
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <Section icon={User} title="Enfant">
          <Grid>
            <FieldRow label="Date de naissance" value={d.dateOfBirth ? new Date(d.dateOfBirth).toLocaleDateString('fr-FR') : null} />
            <FieldRow label="Genre" value={d.gender} />
            <FieldRow label="Nationalité" value={d.nationality} />
            <FieldRow label="Groupe sanguin" value={d.bloodType} />
            <FieldRow label="Classe" value={d.classe} />
            <FieldRow label="Section" value={d.section} />
            <FieldRow label="Demande précédente" value={d.hasPreviousDemande ? `Oui${d.previousDemandeYear ? ` (${d.previousDemandeYear})` : ''}` : 'Non'} />
          </Grid>
        </Section>

        <Section icon={GraduationCap} title="École">
          <p className="text-sm">{d.school || <Muted />}</p>
        </Section>

        <Section icon={MapPin} title="Coordonnées du foyer">
          <Grid>
            <FieldRow label="Compte" value={d.accountEmail} />
            <FieldRow label="Responsable" value={d.contactName} />
            <FieldRow label="Téléphone enfant" value={d.phoneNumber} />
            <FieldRow label="Courriel enfant" value={d.email} />
          </Grid>
          {addr && <p className="mt-2 flex items-start gap-2 text-sm"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />{addr}</p>}
        </Section>

        <Section icon={Users2} title={`Parents / Tuteurs (${d.guardians.length})`}>
          {d.guardians.length === 0 ? <Muted /> : (
            <div className="space-y-2">
              {d.guardians.map((g, i) => (
                <div key={g.id ?? i} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{g.firstName} {g.lastName}</span>
                    <Badge variant="outline" className="text-xs">{g.relationship}</Badge>
                    {g.isDeceased && <Badge variant="secondary" className="text-xs">Décédé(e)</Badge>}
                    {g.isPrimaryContact && <Badge className="bg-primary/90 text-xs">Contact principal</Badge>}
                    {g.isEmergencyContact && <Badge variant="destructive" className="text-xs">Urgence</Badge>}
                  </div>
                  {g.profession && <p className="mt-1 text-xs text-muted-foreground">{g.profession}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {g.phoneNumber && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" />{g.phoneCountryCode} {g.phoneNumber}</span>}
                    {g.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3 text-muted-foreground" />{g.email}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section icon={Tent} title={`Proches scouts (${d.scoutRelations.length})`}>
          {d.scoutRelations.length === 0 ? <Muted /> : (
            <div className="space-y-2">
              {d.scoutRelations.map((r, i) => (
                <div key={r.id ?? i} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}</span>
                    <Badge variant="outline" className="text-xs">{RELATION_LABEL[r.status] ?? r.status}</Badge>
                    {r.relationship && <span className="text-xs text-muted-foreground">{r.relationship}</span>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {r.otherGroupName && <span>Groupe : {r.otherGroupName}. </span>}
                    {r.lastUnit && <span>Dernière unité : {r.lastUnit}. </span>}
                    {r.lastFunction && <span>Fonction : {r.lastFunction}.</span>}
                  </div>
                  {/* Auto-matched to a real member (a "scout actuel" relation) — surfaced so the CG can confirm the link. */}
                  {r.relatedMemberId && r.relatedMemberName && (
                    <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                      <Link2 className="h-3.5 w-3.5" />
                      Lié à un membre : {r.relatedMemberName}{r.relatedMemberUnit ? ` (${r.relatedMemberUnit})` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {(d.allergies || d.medicalNotes) && (
          <Section icon={HeartPulse} title="Médical">
            {d.allergies && <p className="text-sm"><span className="font-medium">Allergies : </span>{d.allergies}</p>}
            {d.medicalNotes && <p className="mt-1 text-sm"><span className="font-medium">Notes : </span>{d.medicalNotes}</p>}
          </Section>
        )}

        {d.parentNotes && (
          <Section icon={MessageSquare} title="Note des parents">
            <p className="whitespace-pre-line rounded-md bg-muted/40 p-3 text-sm">{d.parentNotes}</p>
          </Section>
        )}

        {siblingsTogether && d.siblings.length > 0 && (
          <Section icon={Users2} title="Fratrie (même compte)">
            <div className="flex flex-wrap gap-1.5">
              {d.siblings.map((s) => (
                <Badge key={s.id} variant="outline" className="text-xs">
                  {s.firstName} — {s.status === 'Approved' ? 'acceptée' : s.status === 'Declined' ? 'refusée' : 'à étudier'}
                </Badge>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Decision footer */}
      <div className="border-t bg-background p-5">
        {locked ? (
          <div className="text-sm text-muted-foreground">
            Réponse déjà envoyée le {new Date(d.responseSentAt!).toLocaleDateString('fr-FR')}.
            {d.status === 'Approved' && d.decidedUnitName ? ` Accepté → ${d.decidedUnitName}.` : ''}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-medium">
                Unité d'affectation (si accepté)
                {suggested && unit === suggested.unitId && !d.decidedUnitId && <span className="inline-flex items-center gap-0.5 text-xs font-normal text-primary"><Sparkles className="h-3 w-3" />suggérée</span>}
              </label>
              <UnitSelect occupancy={occupancy} d={d} value={unit} onChange={setUnit} />
              {unit && occByUnit[unit] && <UnitHint u={occByUnit[unit]} d={d} />}
            </div>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optionnel)" />
            <Separator />
            <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif de refus (optionnel, inclus dans l'email)" />
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy} onClick={() => onDecide(d, 'Approved', unit, note)}>
                <Check className="mr-1 h-4 w-4" />{d.status === 'Approved' ? 'Mettre à jour' : 'Accepter'}
              </Button>
              <Button variant="destructive" className="flex-1" disabled={busy} onClick={() => onDecide(d, 'Declined', null, motif)}>
                <X className="mr-1 h-4 w-4" />{d.status === 'Declined' ? 'Mettre à jour' : 'Refuser'}
              </Button>
            </div>
            <p className="hidden text-center text-xs text-muted-foreground sm:block">Raccourcis : <kbd>A</kbd> accepter · <kbd>R</kbd> refuser · <kbd>←</kbd>/<kbd>→</kbd> naviguer</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, children }: { icon: typeof User; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />{title}
      </h3>
      {children}
    </div>
  )
}
function Grid({ children }: { children: React.ReactNode }) { return <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">{children}</dl> }
function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value || '—'}</dd>
    </div>
  )
}
function Muted() { return <span className="text-sm text-muted-foreground">—</span> }

// ── occupancy row ───────────────────────────────────────────────────────────────
function OccRow({ u, scoutYear }: { u: UnitOccupancy; scoutYear: string }) {
  const setQuota = useSetIntakeQuota()
  const [val, setVal] = useState(u.quota?.toString() ?? '')
  const remaining = u.quota != null ? u.quota - u.accepted : null
  const save = () => {
    const n = Number(val)
    if (Number.isNaN(n) || n < 0) return
    setQuota.mutate({ unitId: u.unitId, scoutYear, quota: n })
  }
  return (
    <tr className="border-b hover:bg-muted/20">
      <td className="px-3 py-2"><span className="font-medium">{u.unitCode}</span> <span className="text-muted-foreground">{u.unitName}</span></td>
      <td className="px-3 py-2 text-center">{u.currentActive}</td>
      <td className="px-3 py-2 text-center font-medium">{u.projected}</td>
      <td className="px-3 py-2 text-center">
        <Input className="mx-auto h-8 w-20 text-center" value={val} onChange={(e) => setVal(e.target.value)} onBlur={save} placeholder="—" />
      </td>
      <td className="px-3 py-2 text-center">{u.accepted}</td>
      <td className="px-3 py-2 text-center">
        {remaining == null ? <span className="text-muted-foreground">—</span> :
          <span className={remaining <= 0 ? 'text-amber-600 font-medium' : 'text-green-700'}>{remaining}{remaining <= 0 && <AlertTriangle className="ml-1 inline h-3 w-3" />}</span>}
      </td>
    </tr>
  )
}
