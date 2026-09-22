// "Rapports croisés" — the CG's cross-tab / pivot reports over the season's demandes. Fed by the per-demande
// dimension rows returned by /demandes/statistics (DemandeStatRow), so EVERY cross-tab is computed client-side:
// two curated headline grids (Sexe × Branche visée, Branche visée × Statut) + a flexible pivot builder where the
// CG picks any Row × Column dimension, sees counts or %, and exports the table to CSV. "Branche visée" is the
// branche derived from âge+sexe on the backend, so it covers every demande (incl. en attente), not just accepted.
import { useMemo, useState } from 'react'
import type { DemandeStatRow } from '@/services/demande-admin-service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { saveBlob } from '@/lib/download'
import { Table2, Download, ArrowRightLeft, Percent, Hash } from 'lucide-react'

// A pivot dimension: how to bucket a demande + an optional preferred label order (labels not listed sort by count).
interface Dim {
  key: string
  label: string
  value: (r: DemandeStatRow) => string
  preferred?: string[]
}

// Labels that always sort LAST regardless of count (the "unknown / not-applicable" buckets).
const isUnknown = (l: string) => /^non (renseign|d[ée]termin|d[ée]cid)/i.test(l)

// Order a set of labels: preferred order first (those present), then the rest by count desc, unknowns always last.
function orderLabels(labels: string[], countOf: Map<string, number>, preferred?: string[]): string[] {
  const known = labels.filter((l) => !isUnknown(l))
  const unknown = labels.filter(isUnknown)
  const pref = (preferred ?? []).filter((l) => known.includes(l))
  const rest = known.filter((l) => !pref.includes(l)).sort((a, b) => (countOf.get(b) ?? 0) - (countOf.get(a) ?? 0) || a.localeCompare(b))
  return [...pref, ...rest, ...unknown.sort((a, b) => (countOf.get(b) ?? 0) - (countOf.get(a) ?? 0))]
}

interface Pivot {
  rowLabels: string[]
  colLabels: string[]
  cell: (r: string, c: string) => number
  rowTotal: (r: string) => number
  colTotal: (c: string) => number
  grand: number
  max: number // largest single cell value (for heat shading)
}

// Cross-tabulate rows by (rowDim × colDim) into an ordered matrix with row/column totals.
function pivot(rows: DemandeStatRow[], rowDim: Dim, colDim: Dim): Pivot {
  const grid = new Map<string, Map<string, number>>()
  const rowT = new Map<string, number>()
  const colT = new Map<string, number>()
  for (const r of rows) {
    const rl = rowDim.value(r)
    const cl = colDim.value(r)
    if (!grid.has(rl)) grid.set(rl, new Map())
    const inner = grid.get(rl)!
    inner.set(cl, (inner.get(cl) ?? 0) + 1)
    rowT.set(rl, (rowT.get(rl) ?? 0) + 1)
    colT.set(cl, (colT.get(cl) ?? 0) + 1)
  }
  const rowLabels = orderLabels([...rowT.keys()], rowT, rowDim.preferred)
  const colLabels = orderLabels([...colT.keys()], colT, colDim.preferred)
  const cell = (r: string, c: string) => grid.get(r)?.get(c) ?? 0
  let max = 0
  for (const r of rowLabels) for (const c of colLabels) max = Math.max(max, cell(r, c))
  return {
    rowLabels, colLabels, cell,
    rowTotal: (r) => rowT.get(r) ?? 0,
    colTotal: (c) => colT.get(c) ?? 0,
    grand: rows.length,
    max,
  }
}

// A rendered cross-tab table. `mode` = "count" (raw) or "pct" (share of the grand total). Cells are heat-shaded
// by their raw count so the concentration is readable at a glance; totals row/column are emphasised.
function PivotTable({ p, rowLabel, colLabel, mode }: { p: Pivot; rowLabel: string; colLabel: string; mode: 'count' | 'pct' }) {
  const fmt = (n: number) => (mode === 'pct' ? (p.grand ? `${Math.round((n / p.grand) * 100)}%` : '0%') : `${n}`)
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">{rowLabel} \ {colLabel}</th>
            {p.colLabels.map((c) => <th key={c} className="px-3 py-2 text-center font-medium">{c}</th>)}
            <th className="px-3 py-2 text-center font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {p.rowLabels.map((r) => (
            <tr key={r} className="border-b hover:bg-muted/20">
              <td className="px-3 py-2 font-medium">{r}</td>
              {p.colLabels.map((c) => {
                const v = p.cell(r, c)
                const intensity = p.max ? v / p.max : 0
                return (
                  <td key={c} className="px-3 py-2 text-center tabular-nums"
                    style={{ backgroundColor: v ? `color-mix(in srgb, var(--primary) ${Math.round(intensity * 45)}%, transparent)` : undefined }}>
                    {v ? fmt(v) : <span className="text-muted-foreground/40">·</span>}
                  </td>
                )
              })}
              <td className="px-3 py-2 text-center font-semibold tabular-nums bg-muted/30">{fmt(p.rowTotal(r))}</td>
            </tr>
          ))}
          <tr className="border-t-2 bg-muted/30 font-semibold">
            <td className="px-3 py-2">Total</td>
            {p.colLabels.map((c) => <td key={c} className="px-3 py-2 text-center tabular-nums">{fmt(p.colTotal(c))}</td>)}
            <td className="px-3 py-2 text-center tabular-nums">{fmt(p.grand)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// Build a CSV (UTF-8 BOM for Excel) from a pivot: header row of column labels + a Total column, one row per
// row-label, plus a trailing Total row. Always exports raw counts (the analysable form).
function exportPivotCsv(p: Pivot, rowLabel: string, colLabel: string, fileName: string) {
  const esc = (s: string | number) => {
    const t = String(s)
    return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const lines: string[] = []
  lines.push([`${rowLabel} \\ ${colLabel}`, ...p.colLabels, 'Total'].map(esc).join(';'))
  for (const r of p.rowLabels)
    lines.push([r, ...p.colLabels.map((c) => p.cell(r, c)), p.rowTotal(r)].map(esc).join(';'))
  lines.push(['Total', ...p.colLabels.map((c) => p.colTotal(c)), p.grand].map(esc).join(';'))
  saveBlob('﻿' + lines.join('\r\n'), fileName, 'text/csv;charset=utf-8')
}

export function DemandeCrossReports({ rows, branches, schoolCode }: {
  rows: DemandeStatRow[]
  branches: string[]
  schoolCode: (name: string) => string
}) {
  // The dimension registry drives both the curated grids and the pivot builder. Branche columns follow the
  // parcours order (branches, from the server) then "Non déterminée"/"Non décidée" last (handled by orderLabels).
  const DIMENSIONS = useMemo<Dim[]>(() => [
    { key: 'gender', label: 'Sexe', value: (r) => r.gender, preferred: ['Masculin', 'Féminin'] },
    { key: 'age', label: "Tranche d'âge", value: (r) => r.ageGroup, preferred: ['Moins de 8 ans', '8–10 ans', '11–13 ans', '14–17 ans', '18 ans et +'] },
    { key: 'targetBranch', label: 'Branche visée', value: (r) => r.targetBranch, preferred: branches },
    { key: 'decidedBranch', label: 'Branche décidée', value: (r) => r.decidedBranch ?? 'Non décidée', preferred: branches },
    { key: 'status', label: 'Statut', value: (r) => r.status, preferred: ['En attente', 'Acceptée', 'Refusée'] },
    { key: 'classe', label: 'Classe', value: (r) => r.classe },
    { key: 'school', label: 'École', value: (r) => (r.school === 'Non renseignée' ? r.school : schoolCode(r.school)) },
    { key: 'city', label: 'Ville', value: (r) => r.city },
    { key: 'nationality', label: 'Nationalité', value: (r) => r.nationality },
    { key: 'parentsSituation', label: 'Situation des parents', value: (r) => r.parentsSituation, preferred: ['Unis', 'Séparés', 'Divorcés'] },
    { key: 'previous', label: 'A déjà déposé', value: (r) => (r.previousDemande ? 'Oui' : 'Non'), preferred: ['Oui', 'Non'] },
    { key: 'relation', label: 'Proche scout', value: (r) => (r.hasRelation ? 'Oui' : 'Non'), preferred: ['Oui', 'Non'] },
    { key: 'sibling', label: 'En fratrie', value: (r) => (r.isSibling ? 'Oui' : 'Non'), preferred: ['Oui', 'Non'] },
  ], [branches, schoolCode])

  const byKey = (k: string) => DIMENSIONS.find((d) => d.key === k)!

  // Curated headline grids.
  const sexeBranche = useMemo(() => pivot(rows, byKey('gender'), byKey('targetBranch')), [rows, DIMENSIONS]) // eslint-disable-line react-hooks/exhaustive-deps
  const brancheStatut = useMemo(() => pivot(rows, byKey('targetBranch'), byKey('status')), [rows, DIMENSIONS]) // eslint-disable-line react-hooks/exhaustive-deps

  // Flexible pivot builder.
  const [rowKey, setRowKey] = useState('gender')
  const [colKey, setColKey] = useState('age')
  const [mode, setMode] = useState<'count' | 'pct'>('count')
  const rowDim = byKey(rowKey)
  const colDim = byKey(colKey)
  const custom = useMemo(() => pivot(rows, rowDim, colDim), [rows, rowDim, colDim])

  if (rows.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Rapports croisés</h2>

      {/* Curated grids */}
      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
            <CardTitle className="flex items-center gap-2 text-base"><Table2 className="h-4 w-4" />Sexe × Branche visée</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => exportPivotCsv(sexeBranche, 'Sexe', 'Branche', `demandes-sexe-branche.csv`)}>
              <Download className="mr-1.5 h-3.5 w-3.5" />CSV
            </Button>
          </CardHeader>
          <CardContent><PivotTable p={sexeBranche} rowLabel="Sexe" colLabel="Branche" mode="count" /></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
            <CardTitle className="flex items-center gap-2 text-base"><Table2 className="h-4 w-4" />Branche visée × Statut</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => exportPivotCsv(brancheStatut, 'Branche', 'Statut', `demandes-branche-statut.csv`)}>
              <Download className="mr-1.5 h-3.5 w-3.5" />CSV
            </Button>
          </CardHeader>
          <CardContent><PivotTable p={brancheStatut} rowLabel="Branche" colLabel="Statut" mode="count" /></CardContent>
        </Card>
      </div>

      {/* Flexible pivot builder */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-base"><ArrowRightLeft className="h-4 w-4" />Tableau croisé personnalisé</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Lignes</label>
              <Select value={rowKey} onValueChange={setRowKey}>
                <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{DIMENSIONS.map((d) => <SelectItem key={d.key} value={d.key} disabled={d.key === colKey}>{d.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="pb-2 text-muted-foreground"><ArrowRightLeft className="h-4 w-4" /></div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Colonnes</label>
              <Select value={colKey} onValueChange={setColKey}>
                <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{DIMENSIONS.map((d) => <SelectItem key={d.key} value={d.key} disabled={d.key === rowKey}>{d.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex overflow-hidden rounded-md border">
                <button type="button" onClick={() => setMode('count')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-xs ${mode === 'count' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                  <Hash className="h-3.5 w-3.5" />Nombre
                </button>
                <button type="button" onClick={() => setMode('pct')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-xs ${mode === 'pct' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                  <Percent className="h-3.5 w-3.5" />%
                </button>
              </div>
              <Button variant="outline" size="sm" onClick={() => exportPivotCsv(custom, rowDim.label, colDim.label, `demandes-${rowDim.key}-${colDim.key}.csv`)}>
                <Download className="mr-1.5 h-3.5 w-3.5" />CSV
              </Button>
            </div>
          </div>
          <PivotTable p={custom} rowLabel={rowDim.label} colLabel={colDim.label} mode={mode} />
          <p className="text-xs text-muted-foreground">
            « Branche visée » est déduite de l'âge et du sexe (elle couvre toutes les demandes, même en attente).
            « Branche décidée » n'existe que pour les demandes acceptées. Le CSV exporte toujours les effectifs.
          </p>
        </CardContent>
      </Card>
    </section>
  )
}
