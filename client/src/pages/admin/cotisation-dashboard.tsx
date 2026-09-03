// CG cotisation dashboard ("Tableau de bord — Cotisations"). Group-wide payment overview for a chosen scout
// year: summary tiles (active members / paid % / unpaid + exempt / total collected per currency), a paid
// progress bar, a per-unit breakdown, and an ACTIONABLE follow-up list of members with no payment — grouped
// by unit, each row showing the parent + email/phone (clickable mailto:/tel:) so the CG can chase the money,
// clickable to open the member file, with inline "record a payment" and "ne paiera pas" actions, plus CSV
// export and print. "Payé" = a cotisation with a payment line; exempt ("ne paiera pas") members are excluded
// from impayés. Multi-currency (USD/EUR/LBP) — totals are per-currency, not converted.
import { useState, useMemo } from 'react'
import { saveBlob } from '@/lib/download'
import { useNavigate } from 'react-router'
import {
  useCotisationSummary, useUnpaidCotisations, usePaidCotisations, useCreateCotisation, useSetCotisationExempt,
  useAssociationDues, downloadReceipt, type UnpaidCotisationDto, type PaidCotisationDto,
} from '@/services/cotisation-service'
import { useSettingValue } from '@/services/settings-service'
import { useCurrentScoutYear } from '@/hooks/use-scout-year'
import { useQueryClient } from '@tanstack/react-query'
import { parseApiError } from '@/lib/error-utils'
import { PAYMENT_METHOD_OPTIONS } from '@/lib/options'
import { formatMoney } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Receipt, Users, AlertTriangle, CheckCircle, Mail, Phone, Ban, Printer, Download, ChevronRight, Trash2, Plus, Building2 } from 'lucide-react'
import { toast } from 'sonner'


export default function CotisationDashboardPage() {
  const currentScoutYear = useCurrentScoutYear()
  const defaultAmount = useSettingValue('cotisation.default_amount')
  const [scoutYear, setScoutYear] = useState(currentScoutYear)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: summary, isLoading } = useCotisationSummary(scoutYear)
  const { data: unpaid } = useUnpaidCotisations(scoutYear)
  const { data: paid } = usePaidCotisations(scoutYear)
  // Association dues report (what the group owes each association). "all" = owe for every member; "paid" =
  // owe only for members who actually paid their cotisation.
  const { data: dues } = useAssociationDues(scoutYear)
  const [duesMode, setDuesMode] = useState<'all' | 'paid'>('all')

  // Shared mutations for the inline row actions (memberId passed per-call; queries invalidated below).
  const createCotisation = useCreateCotisation('')
  const setExempt = useSetCotisationExempt()

  // Which unit rows are expanded to reveal their "à relancer" (unpaid) follow-up list.
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set())
  const toggleUnit = (name: string) => setExpandedUnits(prev => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name); else next.add(name)
    return next
  })

  // ── Record-payment dialog state. Supports MULTIPLE payment lines (amount + currency + method) under one
  //    date — same shape the backend/member-file editor uses — so the CG can log a split payment here. ──
  type PayLine = { amount: string; currency: string; paymentMethod: string }
  const [payFor, setPayFor] = useState<UnpaidCotisationDto | null>(null)
  const [payDate, setPayDate] = useState('')
  const [payLines, setPayLines] = useState<PayLine[]>([])

  const openPayDialog = (m: UnpaidCotisationDto) => {
    setPayFor(m)
    setPayDate(new Date().toISOString().split('T')[0])
    setPayLines([{ amount: defaultAmount ?? '100', currency: 'USD', paymentMethod: 'Cash' }])
  }
  const addPayLine = () => setPayLines(ls => [...ls, { amount: '', currency: 'USD', paymentMethod: 'Cash' }])
  const removePayLine = (i: number) => setPayLines(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls)
  const updatePayLine = (i: number, patch: Partial<PayLine>) =>
    setPayLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l))

  // Totals per currency for the dialog footer (multi-currency, not converted).
  const payTotals = payLines.reduce<Record<string, number>>((acc, l) => {
    const n = parseFloat(l.amount)
    if (n > 0) acc[l.currency] = (acc[l.currency] ?? 0) + n
    return acc
  }, {})

  const refreshCotisations = () => {
    qc.invalidateQueries({ queryKey: ['cotisations', 'unpaid', scoutYear] })
    qc.invalidateQueries({ queryKey: ['cotisations', 'paid', scoutYear] })
    qc.invalidateQueries({ queryKey: ['cotisations', 'summary', scoutYear] })
  }

  // Download a member's receipt PDF (from the paid list). Receipts are generated on demand from the cotisation.
  const handleReceipt = async (m: PaidCotisationDto) => {
    try {
      const res = await downloadReceipt(m.cotisationId)
      saveBlob(res.data, `Recu_${m.receiptNumber || m.memberName}.pdf`, 'application/pdf')
    } catch {
      toast.error('Impossible de télécharger le reçu.')
    }
  }

  const submitPayment = async () => {
    if (!payFor) return
    const payments = payLines.map(l => ({ amount: parseFloat(l.amount), currency: l.currency, paymentMethod: l.paymentMethod }))
    if (payments.length === 0 || payments.some(p => !(p.amount > 0))) {
      toast.error('Chaque ligne doit avoir un montant supérieur à 0.'); return
    }
    try {
      await createCotisation.mutateAsync({
        memberId: payFor.memberId,
        scoutYear,
        paymentDate: payDate,
        payments,
      })
      toast.success(`Paiement enregistré — ${payFor.memberName}`)
      setPayFor(null)
      refreshCotisations()
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const markExempt = async (m: UnpaidCotisationDto) => {
    try {
      await setExempt.mutateAsync({ memberId: m.memberId, scoutYear, willNotPay: true })
      toast.success(`« Ne paiera pas » — ${m.memberName}`)
      refreshCotisations()
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  // Lookup: unit name → its unpaid members, so a unit row in the "Par unité" table can reveal its own
  // follow-up ("à relancer") list on click (backend already orders by unit → name).
  const unpaidByUnit = useMemo(() => {
    const groups = new Map<string, UnpaidCotisationDto[]>()
    for (const u of unpaid ?? []) {
      const list = groups.get(u.unitName) ?? []
      list.push(u)
      groups.set(u.unitName, list)
    }
    return groups
  }, [unpaid])

  // Same, for members who PAID — so a unit row can also reveal its "Ont payé" list (name + amounts + receipt).
  const paidByUnit = useMemo(() => {
    const groups = new Map<string, PaidCotisationDto[]>()
    for (const p of paid ?? []) {
      const list = groups.get(p.unitName) ?? []
      list.push(p)
      groups.set(p.unitName, list)
    }
    return groups
  }, [paid])

  // Grand totals for the association-dues table (association rows + the maîtrise line), in the selected mode.
  const duesGrand = useMemo(() => {
    if (!dues) return { members: 0, total: 0 }
    const pick = <T,>(all: T, paid: T) => (duesMode === 'all' ? all : paid)
    let members = 0, total = 0
    for (const a of dues.associations) { members += pick(a.membersAll, a.membersPaid); total += pick(a.totalAll, a.totalPaid) }
    members += pick(dues.maitrise.membersAll, dues.maitrise.membersPaid)
    total += pick(dues.maitrise.totalAll, dues.maitrise.totalPaid)
    return { members, total }
  }, [dues, duesMode])

  const exportCsv = () => {
    if (!unpaid || unpaid.length === 0) return
    const header = ['Unité', 'Membre', 'Père', 'Email', 'Téléphone']
    const escape = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`
    const lines = unpaid.map(u => [u.unitName, u.memberName, u.parentName ?? '', u.contactEmail ?? '', u.contactPhone ?? ''].map(escape).join(','))
    // UTF-8 BOM so Excel reads accents correctly.
    const csv = '﻿' + [header.map(escape).join(','), ...lines].join('\r\n')
    saveBlob(csv, `impayes_cotisations_${scoutYear}.csv`, 'text/csv;charset=utf-8')
  }

  if (isLoading) return <LoadingSpinner variant="page" />

  const paidPercentage = summary && summary.totalActiveMembers > 0
    ? Math.round((summary.membersWithPayment / summary.totalActiveMembers) * 100)
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Tableau de bord — Cotisations</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Année scoute :</span>
          <Input className="w-36" value={scoutYear} onChange={e => setScoutYear(e.target.value)} />
        </div>
      </div>

      {summary && (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Users className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <div className="text-2xl font-bold">{summary.totalActiveMembers}</div>
                    <p className="text-sm text-muted-foreground">Membres actifs</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                  <div>
                    <div className="text-2xl font-bold text-green-700">{summary.membersWithPayment}</div>
                    <p className="text-sm text-muted-foreground">Ont payé ({paidPercentage}%)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-8 w-8 text-orange-500" />
                  <div>
                    <div className="text-2xl font-bold text-orange-600">{summary.membersWithoutPayment}</div>
                    <p className="text-sm text-muted-foreground">Impayés{summary.membersExempt > 0 && <span className="ml-1 text-slate-500">· {summary.membersExempt} exempté(s)</span>}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Receipt className="h-8 w-8 text-primary" />
                  <div>
                    {summary.totalsByCurrency.length > 0 ? (
                      <div className="space-y-0.5">
                        {summary.totalsByCurrency.map(t => (
                          <div key={t.currency} className="text-lg font-bold">{formatMoney(t.total, t.currency)}</div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-2xl font-bold">0</div>
                    )}
                    <p className="text-sm text-muted-foreground">Total perçu</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Progress bar */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Progression des paiements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-4 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-green-600 transition-all"
                  style={{ width: `${paidPercentage}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{paidPercentage}% des membres ont payé leur cotisation</p>
            </CardContent>
          </Card>

          {/* Par unité — stats breakdown; click a unit with impayés to reveal its "à relancer" list inline */}
          <Card className="print-area">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle>Par unité</CardTitle>
                {unpaid && unpaid.length > 0 && (
                  <div className="flex items-center gap-2 no-print">
                    <Button variant="outline" size="sm" onClick={exportCsv}>
                      <Download className="mr-1.5 h-4 w-4" /> Exporter (CSV)
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => window.print()}>
                      <Printer className="mr-1.5 h-4 w-4" /> Imprimer
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {summary.byUnit.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune donnée.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-3 py-2 text-left font-medium">Unité</th>
                        <th className="px-3 py-2 text-center font-medium">Membres</th>
                        <th className="px-3 py-2 text-center font-medium">Payé</th>
                        <th className="px-3 py-2 text-center font-medium">Impayé</th>
                        <th className="px-3 py-2 text-right font-medium">Montants perçus</th>
                      </tr>
                    </thead>
                    {summary.byUnit.map((u, idx) => {
                      const toRelance = unpaidByUnit.get(u.unitName) ?? []
                      const paidList = paidByUnit.get(u.unitName) ?? []
                      const impaye = u.totalMembers - u.paidMembers - u.exemptMembers
                      // Expandable if the unit has anyone paid OR unpaid — click reveals both lists.
                      const canExpand = paidList.length > 0 || toRelance.length > 0
                      const isOpen = expandedUnits.has(u.unitName)
                      return (
                        <tbody key={u.unitName}>
                          <tr
                            className={`border-b ${idx % 2 === 1 ? 'bg-muted/10' : ''} ${canExpand ? 'cursor-pointer hover:bg-muted/30' : ''}`}
                            onClick={canExpand ? () => toggleUnit(u.unitName) : undefined}
                          >
                            <td className="px-3 py-2 font-medium">
                              <span className="inline-flex items-center gap-1.5">
                                {canExpand
                                  ? <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                                  : <span className="inline-block w-4" />}
                                {u.unitName}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">{u.totalMembers}</td>
                            <td className="px-3 py-2 text-center">
                              <Badge className="bg-green-600">{u.paidMembers}</Badge>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {/* Unpaid = members minus paid minus exempt (exempt shown separately, not as impayés) */}
                              {impaye > 0 ? (
                                <Badge variant="destructive">{impaye}</Badge>
                              ) : (
                                <Badge variant="outline">0</Badge>
                              )}
                              {u.exemptMembers > 0 && <span className="ml-1 text-xs text-slate-500">+{u.exemptMembers} exempté(s)</span>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {u.totals.length > 0 ? (
                                <div className="space-y-0.5">
                                  {u.totals.map(t => (
                                    <div key={t.currency} className="text-sm">{formatMoney(t.total, t.currency)}</div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                          {/* Follow-up ("à relancer") rows for this unit. Collapsed on screen until clicked;
                              always shown when printing so the full chase list comes out on paper. */}
                          {canExpand && (
                            <tr className={isOpen ? '' : 'hidden print:table-row'}>
                              <td colSpan={5} className="bg-muted/5 px-3 pb-4 pt-1">
                                {/* Members who PAID — name (→ member file), date, amounts, and a receipt download. */}
                                {paidList.length > 0 && (
                                  <div className="mb-3">
                                    <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                                      <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                      Ont payé — {paidList.length} membre{paidList.length > 1 ? 's' : ''}
                                    </div>
                                    <div className="overflow-x-auto rounded-md border bg-background">
                                      <table className="w-full text-sm min-w-[520px]">
                                        <thead>
                                          <tr className="border-b bg-muted/40 text-left">
                                            <th className="px-3 py-2 font-medium">Membre</th>
                                            <th className="px-3 py-2 font-medium">Date</th>
                                            <th className="px-3 py-2 font-medium text-right">Montant</th>
                                            <th className="px-3 py-2 font-medium">Reçu N°</th>
                                            <th className="px-3 py-2 font-medium text-right no-print">Reçu</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {paidList.map((m, i2) => (
                                            <tr key={m.memberId} className={`border-b ${i2 % 2 === 1 ? 'bg-muted/10' : ''}`}>
                                              <td className="px-3 py-2">
                                                <button
                                                  className="group inline-flex items-center gap-1 font-medium text-primary hover:underline"
                                                  onClick={() => navigate(`/members/${m.memberId}`)}
                                                >
                                                  {m.memberName}
                                                  <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60 no-print" />
                                                </button>
                                              </td>
                                              <td className="px-3 py-2 text-muted-foreground">{new Date(m.paymentDate).toLocaleDateString('fr-FR')}</td>
                                              <td className="px-3 py-2 text-right">
                                                {m.totals.length > 0 ? (
                                                  <div className="space-y-0.5">
                                                    {m.totals.map(t => <div key={t.currency}>{formatMoney(t.total, t.currency)}</div>)}
                                                  </div>
                                                ) : <span className="text-muted-foreground">—</span>}
                                              </td>
                                              <td className="px-3 py-2 text-muted-foreground">{m.receiptNumber || '—'}</td>
                                              <td className="px-3 py-2 text-right no-print">
                                                <Button variant="outline" size="sm" className="h-8" onClick={() => handleReceipt(m)}>
                                                  <Download className="mr-1 h-3.5 w-3.5" /> Reçu
                                                </Button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                                {toRelance.length > 0 && (
                                <div>
                                <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                                  <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                                  À relancer — {toRelance.length} membre{toRelance.length > 1 ? 's' : ''} sans cotisation
                                </div>
                                <div className="overflow-x-auto rounded-md border bg-background">
                                  <table className="w-full text-sm min-w-[560px]">
                                    <thead>
                                      <tr className="border-b bg-muted/40 text-left">
                                        <th className="px-3 py-2 font-medium">Membre</th>
                                        <th className="px-3 py-2 font-medium">Père</th>
                                        <th className="px-3 py-2 font-medium">Contact</th>
                                        <th className="px-3 py-2 font-medium text-right no-print">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {toRelance.map((m, i2) => (
                                        <tr key={m.memberId} className={`border-b ${i2 % 2 === 1 ? 'bg-muted/10' : ''}`}>
                                          {/* Name opens the member file (Documents & cotisations tab) for the full editor. */}
                                          <td className="px-3 py-2">
                                            <button
                                              className="group inline-flex items-center gap-1 font-medium text-primary hover:underline"
                                              onClick={() => navigate(`/members/${m.memberId}`)}
                                            >
                                              {m.memberName}
                                              <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60 no-print" />
                                            </button>
                                          </td>
                                          <td className="px-3 py-2 text-muted-foreground">{m.parentName ?? '—'}</td>
                                          <td className="px-3 py-2">
                                            <div className="flex flex-col gap-0.5">
                                              {m.contactEmail ? (
                                                <a href={`mailto:${m.contactEmail}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                                                  <Mail className="h-3.5 w-3.5" /> {m.contactEmail}
                                                </a>
                                              ) : null}
                                              {m.contactPhone ? (
                                                <a href={`tel:${m.contactPhone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                                                  <Phone className="h-3.5 w-3.5" /> {m.contactPhone}
                                                </a>
                                              ) : null}
                                              {!m.contactEmail && !m.contactPhone && <span className="text-xs text-muted-foreground">Aucun contact</span>}
                                            </div>
                                          </td>
                                          <td className="px-3 py-2 text-right no-print">
                                            <div className="inline-flex gap-1.5">
                                              <Button variant="outline" size="sm" className="h-8" onClick={() => openPayDialog(m)}>
                                                <Receipt className="mr-1 h-3.5 w-3.5" /> Paiement
                                              </Button>
                                              <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => markExempt(m)} disabled={setExempt.isPending}>
                                                <Ban className="mr-1 h-3.5 w-3.5" /> Ne paiera pas
                                              </Button>
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      )
                    })}
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Dû aux associations — what the group owes each association (per-member amount × members) + a separate
          maîtrise line. Toggle between owing for ALL members vs only members who PAID. Internal CG figure. */}
      {dues && (
        <Card className="print-area">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Dû aux associations</CardTitle>
              {/* Segmented toggle: base the amount owed on everyone, or only on those who paid. */}
              <div className="inline-flex rounded-md border no-print">
                <Button variant={duesMode === 'all' ? 'default' : 'ghost'} size="sm" className="rounded-r-none"
                  onClick={() => setDuesMode('all')}>Tous les membres</Button>
                <Button variant={duesMode === 'paid' ? 'default' : 'ghost'} size="sm" className="rounded-l-none border-l"
                  onClick={() => setDuesMode('paid')}>Membres ayant payé</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Montant que le groupe verse à chaque association&nbsp;: cotisation par membre × nombre de membres
              {duesMode === 'all' ? ' (tous les membres actifs)' : ' (uniquement ceux ayant payé leur cotisation)'}.
              Configurez les montants dans Paramètres → Cotisations.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-3 py-2 font-medium">Association</th>
                    <th className="px-3 py-2 font-medium text-right">Cotisation / membre</th>
                    <th className="px-3 py-2 font-medium text-center">Membres</th>
                    <th className="px-3 py-2 font-medium text-right">Total dû</th>
                  </tr>
                </thead>
                <tbody>
                  {dues.associations.map((a, idx) => {
                    const members = duesMode === 'all' ? a.membersAll : a.membersPaid
                    const total = duesMode === 'all' ? a.totalAll : a.totalPaid
                    return (
                      <tr key={a.associationId} className={`border-b ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                        <td className="px-3 py-2 font-medium">{a.associationName}</td>
                        <td className="px-3 py-2 text-right">
                          {a.amountPerMember > 0
                            ? formatMoney(a.amountPerMember, dues.currency)
                            : <span className="text-orange-600" title="Aucun montant configuré pour cette association">— à définir</span>}
                        </td>
                        <td className="px-3 py-2 text-center">{members}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatMoney(total, dues.currency)}</td>
                      </tr>
                    )
                  })}
                  {/* Maîtrise line — its own rate; shows "Ne paie pas cette année" when the toggle is off. */}
                  <tr className="border-b bg-primary/5">
                    <td className="px-3 py-2 font-medium">
                      Maîtrise
                      {!dues.maitrise.pays && <span className="ml-2 text-xs text-slate-500">(ne paie pas cette année)</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {dues.maitrise.pays ? formatMoney(dues.maitrise.amountPerMember, dues.currency) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center">{duesMode === 'all' ? dues.maitrise.membersAll : dues.maitrise.membersPaid}</td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatMoney(duesMode === 'all' ? dues.maitrise.totalAll : dues.maitrise.totalPaid, dues.currency)}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-center">{duesGrand.members}</td>
                    <td className="px-3 py-2 text-right text-primary">{formatMoney(duesGrand.total, dues.currency)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Record-payment dialog — one date, one or more payment lines (amount + currency + method) */}
      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enregistrer un paiement{payFor ? ` — ${payFor.memberName}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Date</label>
              <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="w-full sm:w-48" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Lignes de paiement</label>
              {payLines.map((line, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    {i === 0 && <span className="text-xs text-muted-foreground">Montant</span>}
                    <Input type="number" min={0} step="0.01" value={line.amount}
                      onChange={e => updatePayLine(i, { amount: e.target.value })} placeholder="0.00" />
                  </div>
                  <div className="w-28 space-y-1">
                    {i === 0 && <span className="text-xs text-muted-foreground">Devise</span>}
                    <Select value={line.currency} onValueChange={v => updatePayLine(i, { currency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="LBP">LBP (ل.ل)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-36 space-y-1">
                    {i === 0 && <span className="text-xs text-muted-foreground">Méthode</span>}
                    <Select value={line.paymentMethod} onValueChange={v => updatePayLine(i, { paymentMethod: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground"
                    onClick={() => removePayLine(i)} disabled={payLines.length === 1} aria-label="Retirer la ligne">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addPayLine}>
                <Plus className="mr-1.5 h-4 w-4" /> Ajouter une ligne
              </Button>
            </div>

            {Object.keys(payTotals).length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-sm">
                <span className="text-muted-foreground">Total :</span>
                {Object.entries(payTotals).map(([cur, tot]) => (
                  <span key={cur} className="font-medium">{formatMoney(tot, cur)}</span>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Un reçu est généré automatiquement.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayFor(null)}>Annuler</Button>
            <Button onClick={submitPayment} disabled={createCotisation.isPending}>
              {createCotisation.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
