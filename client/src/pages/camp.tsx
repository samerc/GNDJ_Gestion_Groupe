import { useState, useMemo } from 'react'
import { useCamps, useCamp, useCampGrading, useSaveCampGrades } from '@/services/camp-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { SearchInput } from '@/components/shared/search-input'
import { parseApiError } from '@/lib/error-utils'
import { Tent, Save, ArrowUp, ArrowDown, Users } from 'lucide-react'
import { toast } from 'sonner'

type Row = { attending: boolean; force: number | null; annee: number | null; isLeaderCandidate: boolean; notes: string }
type SortKey = 'name' | 'team' | 'annee' | 'force' | 'note'

// Sortable column header (module-scope so its component identity is stable across renders); the current
// sort state + handler are passed in as props.
function SortHead({ k, label, className, sort, onSort }: {
  k: SortKey; label: string; className?: string; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void
}) {
  return (
    <th className={`p-2 font-medium ${className ?? 'text-left'}`}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  )
}

// Camp BP — CU (chef d'unité) grading page. ONE searchable/sortable table over the CU's own eligible youth:
// mark who is NOT coming, then grade each member (force + année + Père/Mère candidate + cas particulier).
// Grades feed the CG's balanced "familles" draft. Unit-scoped server-side. Operates on the single active camp.
export default function CampPage() {
  const { data: camps, isLoading: loadingCamps } = useCamps()
  // The one live camp = first non-archived, else most recent.
  const active = useMemo(() => camps?.find(c => !c.isArchived) ?? camps?.[0], [camps])
  const campId = active?.id
  const { data: camp } = useCamp(campId)

  const { data: grading, isLoading } = useCampGrading(campId)
  const saveGrades = useSaveCampGrades(campId ?? '')

  const [rows, setRows] = useState<Record<string, Row>>({}) // local edits, keyed by memberId
  const [dirty, setDirty] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'team', dir: 1 })

  // Seed the editable rows from the server whenever the grading payload (re)loads; clears the dirty flag.
  // Render-phase reset, keyed on the grading payload. Skip while there are UNSAVED edits (dirty) so a
  // background refetch can't wipe in-progress grading — a successful save clears dirty, letting the next
  // payload re-seed with the persisted values.
  const [prevGrading, setPrevGrading] = useState(grading)
  if (grading && grading !== prevGrading && !dirty) {
    setPrevGrading(grading)
    const m: Record<string, Row> = {}
    for (const g of grading) m[g.memberId] = { attending: g.isAttending, force: g.force, annee: g.annee, isLeaderCandidate: g.isLeaderCandidate, notes: g.notes ?? '' }
    setRows(m); setDirty(false)
  }

  // The camp's customizable note formula: Note = ForceCoef×Force + multiplier(branche)×Année + Offset.
  // The per-branch multiplier defaults to the unit type's NumberOfYears (Troupe 5 > Meute 3, etc.) so a
  // higher branch outscores a lower one at the same Année without cumulating. Null until force+année set.
  const noteOf = (branche: string | null, force: number | null, annee: number | null) => {
    if (!camp || force == null || annee == null) return null
    const mult = camp.branchMultipliers.find(b => b.unitTypeName === branche)?.multiplier ?? 5
    return camp.noteForceCoef * force + mult * annee + camp.noteOffset
  }

  const set = (mid: string, patch: Partial<Row>) => {
    setRows(r => ({ ...r, [mid]: { ...r[mid], ...patch } })); setDirty(true)
  }

  // Save is member-keyed: send a row for every member in scope (fall back to defaults for any untouched
  // one), so attendance + grade are upserted together server-side.
  const save = async () => {
    try {
      await saveGrades.mutateAsync((grading ?? []).map(g => {
        const v = rows[g.memberId] ?? { attending: true, force: null, annee: g.annee, isLeaderCandidate: false, notes: '' }
        return { memberId: g.memberId, attending: v.attending, force: v.force, annee: v.annee, isLeaderCandidate: v.isLeaderCandidate, notes: v.notes || null }
      }))
      toast.success('Enregistré'); setDirty(false)
    } catch (e) { toast.error(parseApiError(e)) }
  }

  const toggleSort = (key: SortKey) => setSort(s => s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 })

  // Search-filtered + sorted view. Sort reads the LIVE edited values (rows) for annee/force/note so the
  // table reorders as you grade; ties break by name. (camp dep is needed for noteOf inside val.)
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    let list = (grading ?? [])
    if (term) list = list.filter(g => `${g.firstName} ${g.lastName}`.toLowerCase().includes(term))
    const r = rows
    const val = (g: typeof list[number]) => {
      switch (sort.key) {
        case 'name': return `${g.lastName} ${g.firstName}`.toLowerCase()
        case 'team': return (g.teamName ?? 'zzz').toLowerCase()
        case 'annee': return r[g.memberId]?.annee ?? -1
        case 'force': return r[g.memberId]?.force ?? -1
        case 'note': return noteOf(g.branche, r[g.memberId]?.force ?? null, r[g.memberId]?.annee ?? null) ?? -Infinity
        default: return 0
      }
    }
    return [...list].sort((a, b) => {
      const va = val(a), vb = val(b)
      if (va < vb) return -1 * sort.dir
      if (va > vb) return 1 * sort.dir
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grading, rows, search, sort, camp])

  if (loadingCamps) return <LoadingSpinner variant="page" />
  if (!active) return (
    <Page>
      <EmptyState icon={Tent} title="Aucun camp n'est ouvert pour le moment." />
    </Page>
  )

  const comingCount = (grading ?? []).filter(g => rows[g.memberId]?.attending ?? g.isAttending).length

  return (
    <Page>
      <PageHeader
        title={active.name}
        icon={Tent}
        description="Notez vos membres pour le camp — cochez « Ne vient pas » pour les absents, puis renseignez force, année et candidats Père/Mère."
        actions={<Button onClick={save} disabled={!dirty || saveGrades.isPending}><Save className="mr-1.5 h-4 w-4" />{saveGrades.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un membre…" className="max-w-xs flex-1" />
        <p className="text-sm text-muted-foreground">{comingCount} participant(s) · {(grading ?? []).length} membre(s)</p>
      </div>

      {isLoading ? <LoadingSpinner variant="table" /> :
       (grading ?? []).length === 0 ? <EmptyState icon={Users} title="Aucun membre dans votre unité." /> :
       (
        <>
        {/* Desktop: dense grading table. Phones get a per-member card grid below (md:hidden). */}
        <div className="hidden overflow-x-auto rounded-lg border md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <SortHead k="name" label="Membre" sort={sort} onSort={toggleSort} />
                <SortHead k="team" label="Équipe" sort={sort} onSort={toggleSort} />
                <SortHead k="annee" label="Année" className="text-left" sort={sort} onSort={toggleSort} />
                <SortHead k="force" label="Force /5" className="text-left" sort={sort} onSort={toggleSort} />
                <th className="p-2 text-center font-medium w-24">Père/Mère</th>
                <th className="p-2 text-center font-medium w-24">Ne vient pas</th>
                {/* Note column intentionally hidden from the CU — it's still computed (for the CG draft) and
                    saved server-side; the CU just doesn't see it. The CG sees notes on the familles board. */}
                <th className="p-2 text-left font-medium">Cas particulier</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(g => {
                const r = rows[g.memberId] ?? { attending: g.isAttending, force: g.force, annee: g.annee, isLeaderCandidate: g.isLeaderCandidate, notes: g.notes ?? '' }
                const absent = !r.attending
                return (
                  <tr key={g.memberId} className={`border-t ${absent ? 'bg-muted/30 text-muted-foreground' : ''}`}>
                    <td className="p-2">{g.firstName} {g.lastName}</td>
                    <td className="p-2 text-muted-foreground">{g.teamName ?? '—'}</td>
                    <td className="p-2"><Input type="number" min={1} max={10} value={r.annee ?? ''} disabled={absent} onChange={e => set(g.memberId, { annee: e.target.value ? Number(e.target.value) : null })} className="h-8 w-16" /></td>
                    <td className="p-2">
                      <Select value={r.force?.toString() ?? ''} onValueChange={v => set(g.memberId, { force: v ? Number(v) : null })} disabled={absent}>
                        <SelectTrigger className="h-8 w-20"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="p-2 text-center">
                      <input type="checkbox" className="h-4 w-4" checked={r.isLeaderCandidate} disabled={absent}
                        onChange={e => set(g.memberId, { isLeaderCandidate: e.target.checked })} title="Candidat Père / Mère" />
                    </td>
                    <td className="p-2 text-center">
                      <input type="checkbox" className="h-4 w-4 accent-orange-500" checked={absent}
                        onChange={e => set(g.memberId, { attending: !e.target.checked })} title="Cocher si le membre ne vient pas au camp" />
                    </td>
                    <td className="p-2"><Input value={r.notes} disabled={absent} onChange={e => set(g.memberId, { notes: e.target.value })} className="h-8" placeholder="—" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile: one card per member with stacked, labelled fields — the wide grading table forced
            constant horizontal scrolling (and lost the name column) on a phone. */}
        <div className="divide-y rounded-lg border md:hidden">
          {visible.map(g => {
            const r = rows[g.memberId] ?? { attending: g.isAttending, force: g.force, annee: g.annee, isLeaderCandidate: g.isLeaderCandidate, notes: g.notes ?? '' }
            const absent = !r.attending
            return (
              <div key={g.memberId} className={`p-3 ${absent ? 'bg-muted/30' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={`font-medium ${absent ? 'text-muted-foreground' : ''}`}>{g.firstName} {g.lastName}</div>
                    <div className="text-xs text-muted-foreground">{g.teamName ?? '—'}</div>
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-xs">
                    <input type="checkbox" className="h-5 w-5 accent-orange-500" checked={absent}
                      onChange={e => set(g.memberId, { attending: !e.target.checked })} />
                    Ne vient pas
                  </label>
                </div>
                {!absent && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">Année
                      <Input type="number" min={1} max={10} value={r.annee ?? ''} onChange={e => set(g.memberId, { annee: e.target.value ? Number(e.target.value) : null })} className="h-10" />
                    </label>
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">Force /5
                      <Select value={r.force?.toString() ?? ''} onValueChange={v => set(g.memberId, { force: v ? Number(v) : null })}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}</SelectContent>
                      </Select>
                    </label>
                    <label className="col-span-2 flex items-center gap-2 text-sm">
                      <input type="checkbox" className="h-5 w-5 accent-primary" checked={r.isLeaderCandidate}
                        onChange={e => set(g.memberId, { isLeaderCandidate: e.target.checked })} />
                      Candidat Père / Mère
                    </label>
                    <label className="col-span-2 space-y-1 text-xs font-medium text-muted-foreground">Cas particulier
                      <Input value={r.notes} onChange={e => set(g.memberId, { notes: e.target.value })} className="h-10" placeholder="—" />
                    </label>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        </>
      )}
    </Page>
  )
}
