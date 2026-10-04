// Spreadsheet mode of the CG demande review table: every visible row becomes editable cells (nom, prénom,
// naissance, genre, classe, école) plus the « Réponse » (À étudier / a unit to accept / a refusal motif). Changes are
// kept as drafts (changed cells turn yellow) until « Enregistrer » saves them all: child fields through
// PUT /demandes/{id}/quick-edit (never touches the shared household), the answer through PUT /demandes/{id}/decide
// (staged, like the rest of the page — nothing reaches families before « Envoyer les réponses »).
// Plain <input>/<select> on purpose: hundreds of Radix selects would make the table sluggish.
import { useMemo, useState, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save, X } from 'lucide-react'
import apiClient from '@/lib/api-client'
import { parseApiError } from '@/lib/error-utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import type { DemandeReview, RejectionReason, UnitOccupancy } from '@/services/demande-admin-service'

type Field = 'lastName' | 'firstName' | 'dateOfBirth' | 'gender' | 'classe' | 'school' | 'response'
type Draft = Partial<Record<Field, string>>
const COLS: Field[] = ['lastName', 'firstName', 'dateOfBirth', 'gender', 'classe', 'school', 'response']
const CHILD_FIELDS: Field[] = ['lastName', 'firstName', 'dateOfBirth', 'gender', 'classe', 'school']

// The Réponse cell value: '' = à étudier, 'unit:<id>' = accepted in that unit, 'refus:<code>' = declined with that
// motif ('refus:?' = declined with a text that matches no managed motif — kept as-is unless changed).
function responseOf(d: DemandeReview, reasons: RejectionReason[]): string {
  if (d.status === 'Approved' && d.decidedUnitId) return `unit:${d.decidedUnitId}`
  if (d.status === 'Declined') {
    const r = reasons.find((x) => (x.text || x.label).trim() === (d.decisionNotes ?? '').trim())
    return `refus:${r?.code ?? '?'}`
  }
  return ''
}

function original(d: DemandeReview, f: Field, reasons: RejectionReason[]): string {
  switch (f) {
    case 'response': return responseOf(d, reasons)
    case 'dateOfBirth': return d.dateOfBirth ?? ''
    default: return (d[f] as string | null) ?? ''
  }
}

// Options list = the managed list + the row's current value when it isn't in it (so nothing looks blank).
const withCurrent = (list: string[], v: string) => (v && !list.includes(v) ? [v, ...list] : list)

interface Props {
  rows: DemandeReview[]
  units: UnitOccupancy[]
  reasons: RejectionReason[]
  classes: string[]
  schools: string[]
  onClose: () => void
}

export function DemandeGrid({ rows, units, reasons, classes, schools, onClose }: Props) {
  const qc = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [saving, setSaving] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const byId = useMemo(() => new Map(rows.map((d) => [d.id, d])), [rows])

  const value = (d: DemandeReview, f: Field) => drafts[d.id]?.[f] ?? original(d, f, reasons)
  const changed = (d: DemandeReview, f: Field) => {
    const v = drafts[d.id]?.[f]
    return v !== undefined && v !== original(d, f, reasons)
  }
  const set = (d: DemandeReview, f: Field, v: string) =>
    setDrafts((all) => {
      const next = { ...(all[d.id] ?? {}), [f]: v }
      if (v === original(d, f, reasons)) delete next[f] // back to the saved value → not a change any more
      const out = { ...all }
      if (Object.keys(next).length === 0) delete out[d.id]
      else out[d.id] = next
      return out
    })

  // A draft may belong to a row the filters now hide: it's kept (and counted) but only saved once visible again.
  const dirtyIds = Object.keys(drafts)
  const dirtyCount = Object.values(drafts).reduce((n, dr) => n + Object.keys(dr).length, 0)

  const save = async () => {
    setSaving(true)
    const errors: string[] = []
    const done: string[] = []
    for (const id of dirtyIds) {
      const d = byId.get(id)
      const dr = drafts[id]
      if (!d || !dr) continue
      const name = `${value(d, 'firstName')} ${value(d, 'lastName')}`.trim()
      try {
        if (CHILD_FIELDS.some((f) => dr[f] !== undefined)) {
          await apiClient.put(`/demandes/${id}/quick-edit`, {
            firstName: value(d, 'firstName').trim(),
            lastName: value(d, 'lastName').trim(),
            dateOfBirth: value(d, 'dateOfBirth') || null,
            gender: value(d, 'gender') || null,
            classe: value(d, 'classe') || null,
            school: value(d, 'school') || null,
          })
        }
        if (dr.response !== undefined) {
          const r = dr.response
          if (r === '') await apiClient.put(`/demandes/${id}/decide`, { status: 'Submitted' })
          else if (r.startsWith('unit:'))
            await apiClient.put(`/demandes/${id}/decide`, { status: 'Approved', decidedUnitId: r.slice(5) })
          else if (r.startsWith('refus:')) {
            const reason = reasons.find((x) => x.code === r.slice(6))
            await apiClient.put(`/demandes/${id}/decide`, { status: 'Declined', decisionNotes: reason ? (reason.text || reason.label) : null })
          }
        }
        done.push(id)
      } catch (e) {
        errors.push(`${name} : ${parseApiError(e)}`)
      }
    }
    // Keep the drafts of the rows that failed so they can be fixed and saved again.
    setDrafts((all) => {
      const out = { ...all }
      for (const id of done) delete out[id]
      return out
    })
    await qc.invalidateQueries({ queryKey: ['demandes'] })
    setSaving(false)
    if (errors.length === 0) toast.success(`${done.length} demande(s) enregistrée(s)`)
    else toast.error(`${errors.length} erreur(s) — ${errors.slice(0, 3).join(' · ')}${errors.length > 3 ? '…' : ''}`, { duration: 10000 })
  }

  const close = () => (dirtyCount > 0 ? setConfirmLeave(true) : onClose())

  // Enter / Shift+Enter move to the same column on the next / previous row, like a spreadsheet.
  const onKey = (e: KeyboardEvent<HTMLElement>, row: number, col: number) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const next = document.querySelector<HTMLElement>(`[data-cell="${row + (e.shiftKey ? -1 : 1)}-${col}"]`)
    next?.focus()
  }

  const cell = 'h-8 w-full rounded border border-transparent bg-transparent px-1.5 text-sm hover:border-input focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60'
  const changedCls = 'bg-warning-subtle'

  return (
    <div>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-warning-subtle px-4 py-2">
        <span className="text-sm font-medium">Mode tableur</span>
        <span className="text-xs text-muted-foreground">
          Modifiez directement les cellules (Entrée = ligne suivante). Les cellules modifiées sont en jaune ; rien n'est enregistré avant « Enregistrer ».
        </span>
        <div className="ml-auto flex items-center gap-2">
          {dirtyCount > 0 && (
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setDrafts({})}>Annuler les modifications</Button>
          )}
          <Button size="sm" disabled={saving || dirtyCount === 0} onClick={save}>
            <Save className="mr-1 h-4 w-4" />{saving ? 'Enregistrement…' : `Enregistrer${dirtyCount ? ` (${dirtyCount})` : ''}`}
          </Button>
          <Button size="sm" variant="outline" disabled={saving} onClick={close}><X className="mr-1 h-4 w-4" />Fermer</Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="w-28 px-2 py-2 font-medium">N°</th>
              <th className="px-2 py-2 font-medium">Nom</th>
              <th className="px-2 py-2 font-medium">Prénom</th>
              <th className="w-36 px-2 py-2 font-medium">Naissance</th>
              <th className="w-28 px-2 py-2 font-medium">Genre</th>
              <th className="w-28 px-2 py-2 font-medium">Classe</th>
              <th className="px-2 py-2 font-medium">École</th>
              <th className="w-56 px-2 py-2 font-medium">Réponse</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d, ri) => {
              const locked = !!d.createdMemberId
              const td = (f: Field) => cn('border-b px-1 py-0.5', changed(d, f) && changedCls)
              const common = (f: Field) => ({
                'data-cell': `${ri}-${COLS.indexOf(f)}`,
                disabled: locked || saving,
                onKeyDown: (e: KeyboardEvent<HTMLElement>) => onKey(e, ri, COLS.indexOf(f)),
                className: cell,
              })
              return (
                <tr key={d.id} className={cn(locked && 'bg-muted/30')} title={locked ? 'Membre déjà créé — modifiez sa fiche' : undefined}>
                  <td className="border-b px-2 font-mono text-xs text-muted-foreground">{d.serialNumber ?? '—'}</td>
                  <td className={td('lastName')}><input {...common('lastName')} value={value(d, 'lastName')} onChange={(e) => set(d, 'lastName', e.target.value.toUpperCase())} /></td>
                  <td className={td('firstName')}><input {...common('firstName')} value={value(d, 'firstName')} onChange={(e) => set(d, 'firstName', e.target.value)} /></td>
                  <td className={td('dateOfBirth')}><input {...common('dateOfBirth')} type="date" value={value(d, 'dateOfBirth')} onChange={(e) => set(d, 'dateOfBirth', e.target.value)} /></td>
                  <td className={td('gender')}>
                    <select {...common('gender')} value={value(d, 'gender')} onChange={(e) => set(d, 'gender', e.target.value)}>
                      <option value="">—</option><option value="Masculin">Masculin</option><option value="Féminin">Féminin</option>
                    </select>
                  </td>
                  <td className={td('classe')}>
                    <select {...common('classe')} value={value(d, 'classe')} onChange={(e) => set(d, 'classe', e.target.value)}>
                      <option value="">—</option>
                      {withCurrent(classes, original(d, 'classe', reasons)).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className={td('school')}>
                    <select {...common('school')} value={value(d, 'school')} onChange={(e) => set(d, 'school', e.target.value)}>
                      <option value="">—</option>
                      {withCurrent(schools, original(d, 'school', reasons)).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className={td('response')}>
                    <select {...common('response')} value={value(d, 'response')} onChange={(e) => set(d, 'response', e.target.value)}>
                      <option value="">À étudier</option>
                      <optgroup label="Accepter dans">
                        {units.map((u) => (
                          <option key={u.unitId} value={`unit:${u.unitId}`}>
                            {u.unitCode} — {u.unitName}{u.quota != null ? ` (${u.accepted}/${u.quota})` : ''}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Refuser">
                        {value(d, 'response') === 'refus:?' && <option value="refus:?">Refusée · {d.decisionNotes ?? 'motif actuel'}</option>}
                        {reasons.map((r) => <option key={r.code} value={`refus:${r.code}`}>{r.label}{r.isDefault ? ' (par défaut)' : ''}</option>)}
                      </optgroup>
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title="Modifications non enregistrées"
        description={`${dirtyCount} modification(s) seront perdues si vous fermez le mode tableur.`}
        confirmLabel="Fermer sans enregistrer"
        variant="destructive"
        onConfirm={() => { setConfirmLeave(false); onClose() }}
      />
    </div>
  )
}
