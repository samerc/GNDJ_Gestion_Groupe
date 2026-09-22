// CG cotisation dashboard ("Tableau de bord — Cotisations"). Group-wide payment overview for a chosen scout
// year: summary tiles (active members / paid % / unpaid + exempt / total collected per currency), a paid
// progress bar, a per-unit breakdown, and an ACTIONABLE follow-up list of members with no payment — grouped
// by unit, each row showing the parent + email/phone (clickable mailto:/tel:) so the CG can chase the money,
// clickable to open the member file, with inline "record a payment" and "ne paiera pas" actions, plus CSV
// export and print. "Payé en entier" vs "Partiel" is computed proportion-per-currency against the configured
// full price per currency (Paramètres → Cotisations → Montants pleins); the "à relancer" list = impayés +
// partiels (a partial row shows % paid + reste). Exempt ("ne paiera pas") members are excluded from impayés.
// Multi-currency (USD/EUR/LBP) — per-currency totals PLUS a converted "≈ X" equivalent in the reference currency.
import { useState, useMemo, useRef } from 'react'
import { saveBlob } from '@/lib/download'
import { useNavigate } from 'react-router'
import {
  useCotisationSummary, useUnpaidCotisations, usePaidCotisations, useExemptCotisations, useCreateCotisation, useSetCotisationExempt,
  useAssociationDues, downloadReceipt, type UnpaidCotisationDto, type PaidCotisationDto, type ExemptCotisationDto,
} from '@/services/cotisation-service'
import { useSettingValue } from '@/services/settings-service'
import { defaultPaymentLine, amountOnCurrencyChange, currencyLabel, fullAmountFor } from '@/lib/cotisation'
import { useCurrencies } from '@/hooks/use-currencies'
import { useCurrentScoutYear } from '@/hooks/use-scout-year'
import { useQueryClient } from '@tanstack/react-query'
import { parseApiError } from '@/lib/error-utils'
import { PAYMENT_METHOD_OPTIONS } from '@/lib/options'
import { formatMoney } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AmountInput } from '@/components/ui/amount-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Receipt, Users, AlertTriangle, CheckCircle, Mail, Phone, Ban, Printer, Download, ChevronRight, Trash2, Plus, Building2 } from 'lucide-react'
import { WhatsappTextLink } from '@/components/shared/whatsapp-link'
import { toast } from 'sonner'


export default function CotisationDashboardPage() {
  const currentScoutYear = useCurrentScoutYear()
  const defaultAmount = useSettingValue('cotisation.default_amount')
  const defaultCurrency = useSettingValue('cotisation.default_currency')
  // Configured full price per currency (e.g. $30 · 2 500 000 LBP) — the single place the fee is set; shown as a
  // hint in the payment dialog AND used to pre-fill the first payment line.
  const fullAmountsRaw = useSettingValue('cotisation.full_amounts')
  const fullPriceHint = (() => {
    try {
      const obj = fullAmountsRaw ? JSON.parse(fullAmountsRaw) as Record<string, number> : {}
      const parts = Object.entries(obj).filter(([, v]) => v > 0).map(([c, v]) => formatMoney(v, c))
      return parts.length > 0 ? parts.join(' · ') : null
    } catch { return null }
  })()
  // Defined currencies (default first) — payment dropdowns use this CG-defined list, not a hardcoded set.
  const { currencies, defaultCurrency: refCurrency } = useCurrencies()
  const [scoutYear, setScoutYear] = useState(currentScoutYear)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: summary, isLoading } = useCotisationSummary(scoutYear)
  const { data: unpaid } = useUnpaidCotisations(scoutYear)
  const { data: paid } = usePaidCotisations(scoutYear)
  const { data: exempt } = useExemptCotisations(scoutYear)
  // Association dues report (what the group owes each association). "all" = owe for every member; "paid" =
  // owe only for members who actually paid their cotisation.
  const { data: dues } = useAssociationDues(scoutYear)
  const [duesMode, setDuesMode] = useState<'all' | 'paid'>('all')

  // Shared mutations for the inline row actions (memberId passed per-call; queries invalidated below).
  const createCotisation = useCreateCotisation('')
  const setExempt = useSetCotisationExempt()

  // Which unit rows are expanded to reveal their paid / exempt / à-relancer lists.
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set())
  const toggleUnit = (name: string) => setExpandedUnits(prev => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name); else next.add(name)
    return next
  })
  // "Par unité" card, so the clickable summary cards can scroll it into view (esp. on a phone).
  const parUniteRef = useRef<HTMLDivElement>(null)

  // ── Record-payment dialog state. Supports MULTIPLE payment lines (amount + currency + method) under one
  //    date — same shape the backend/member-file editor uses — so the CG can log a split payment here. ──
  type PayLine = { amount: string; currency: string; paymentMethod: string }
  const [payFor, setPayFor] = useState<UnpaidCotisationDto | null>(null)
  const [payDate, setPayDate] = useState('')
  const [payLines, setPayLines] = useState<PayLine[]>([])

  const openPayDialog = (m: UnpaidCotisationDto) => {
    setPayFor(m)
    setPayDate(new Date().toISOString().split('T')[0])
    const dpl = defaultPaymentLine(fullAmountsRaw, defaultCurrency, defaultAmount)
    setPayLines([{ amount: dpl.amount ? String(dpl.amount) : '', currency: dpl.currency, paymentMethod: 'Cash' }])
  }
  const addPayLine = () => setPayLines(ls => [...ls, { amount: '', currency: refCurrency, paymentMethod: 'Cash' }])
  const removePayLine = (i: number) => setPayLines(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls)
  const updatePayLine = (i: number, patch: Partial<PayLine>) =>
    setPayLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  // Switching a line's currency re-fills the amount with the NEW currency's full price when it wasn't manually
  // typed (blank, or still the old currency's full price) — so paying in LBP after a USD prefill doesn't record "30 LBP".
  const changeCurrency = (i: number, newCur: string) =>
    setPayLines(ls => ls.map((l, idx) => {
      if (idx !== i) return l
      const n = amountOnCurrencyChange(fullAmountsRaw, l.currency, newCur, parseFloat(l.amount) || 0)
      return { ...l, currency: newCur, amount: n > 0 ? String(n) : '' }
    }))

  // Totals per currency for the dialog footer (multi-currency, not converted).
  const payTotals = payLines.reduce<Record<string, number>>((acc, l) => {
    const n = parseFloat(l.amount)
    if (n > 0) acc[l.currency] = (acc[l.currency] ?? 0) + n
    return acc
  }, {})

  // ── Exempt ("ne paiera pas") dialog state — captures an optional reason when marking a member exempt. ──
  const [exemptFor, setExemptFor] = useState<UnpaidCotisationDto | null>(null)
  const [exemptReason, setExemptReason] = useState('')

  const refreshCotisations = () => {
    qc.invalidateQueries({ queryKey: ['cotisations', 'unpaid', scoutYear] })
    qc.invalidateQueries({ queryKey: ['cotisations', 'paid', scoutYear] })
    qc.invalidateQueries({ queryKey: ['cotisations', 'exempt', scoutYear] })
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

  const openExemptDialog = (m: UnpaidCotisationDto) => {
    setExemptFor(m)
    setExemptReason('')
  }

  const submitExempt = async () => {
    if (!exemptFor) return
    try {
      await setExempt.mutateAsync({ memberId: exemptFor.memberId, scoutYear, willNotPay: true, reason: exemptReason || null })
      toast.success(`« Ne paiera pas » — ${exemptFor.memberName}`)
      setExemptFor(null)
      refreshCotisations()
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  // Remove an exemption straight from the "Exemptés" list (member goes back to "à relancer").
  const removeExempt = async (m: ExemptCotisationDto) => {
    try {
      await setExempt.mutateAsync({ memberId: m.memberId, scoutYear, willNotPay: false })
      toast.success(`Exemption retirée — ${m.memberName}`)
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

  // Same, for EXEMPT members ("ne paiera pas") — so a unit row reveals its "Exemptés" list (name + reason).
  const exemptByUnit = useMemo(() => {
    const groups = new Map<string, ExemptCotisationDto[]>()
    for (const e of exempt ?? []) {
      const list = groups.get(e.unitName) ?? []
      list.push(e)
      groups.set(e.unitName, list)
    }
    return groups
  }, [exempt])

  // Units that have anyone paid / exempt / unpaid (i.e. an expandable row). Used for "développer tout" and to
  // let the summary cards reveal every payer/impayé across all units in one click.
  const expandableUnits = useMemo(() => {
    const names = new Set<string>()
    for (const u of summary?.byUnit ?? []) {
      if ((paidByUnit.get(u.unitName)?.length ?? 0) > 0
        || (exemptByUnit.get(u.unitName)?.length ?? 0) > 0
        || (unpaidByUnit.get(u.unitName)?.length ?? 0) > 0) names.add(u.unitName)
    }
    return names
  }, [summary, paidByUnit, exemptByUnit, unpaidByUnit])

  const allExpanded = expandableUnits.size > 0 && [...expandableUnits].every(n => expandedUnits.has(n))
  const collapseAll = () => setExpandedUnits(new Set())
  const expandAll = () => setExpandedUnits(new Set(expandableUnits))
  // Clicking a summary card reveals every unit's detail lists and scrolls the "Par unité" table into view.
  const revealAllUnits = () => {
    expandAll()
    setTimeout(() => parUniteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

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

  // Year picker options (current + previous 4) — replaces the error-prone free-text year box (a typo
  // like "2026" silently returned empty data).
  const yearOptions = useMemo(() => {
    const start = parseInt((currentScoutYear || '').split('-')[0], 10)
    const list = Number.isFinite(start) ? Array.from({ length: 5 }, (_, i) => `${start - i}-${start - i + 1}`) : []
    if (scoutYear && !list.includes(scoutYear)) list.unshift(scoutYear)
    return list
  }, [currentScoutYear, scoutYear])

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
  const partialPercentage = summary && summary.totalActiveMembers > 0
    ? Math.round((summary.membersPartial / summary.totalActiveMembers) * 100)
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Tableau de bord — Cotisations</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Année scoute :</span>
          <Select value={scoutYear} onValueChange={setScoutYear}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
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
            {/* Clickable → reveals every unit's "Ont payé" list (name + amount + receipt) and scrolls to the table. */}
            <Card
              className={expandableUnits.size > 0 ? 'cursor-pointer transition-colors hover:bg-muted/30' : ''}
              onClick={expandableUnits.size > 0 ? revealAllUnits : undefined}
              title={expandableUnits.size > 0 ? 'Voir les membres qui ont payé' : undefined}
            >
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                  <div>
                    <div className="text-2xl font-bold text-green-700 dark:text-green-300">{summary.membersWithPayment}</div>
                    <p className="text-sm text-muted-foreground">
                      {summary.fullPricingConfigured ? 'Payé en entier' : 'Ont payé'} ({paidPercentage}%)
                      {summary.membersPartial > 0 && <span className="ml-1 text-amber-600 dark:text-amber-400">· {summary.membersPartial} partiel(s)</span>}
                    </p>
                    {expandableUnits.size > 0 && <p className="mt-0.5 text-xs text-primary">Voir le détail →</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
            {/* Clickable → reveals every unit's "à relancer" (impayés + partiels) list. */}
            <Card
              className={expandableUnits.size > 0 ? 'cursor-pointer transition-colors hover:bg-muted/30' : ''}
              onClick={expandableUnits.size > 0 ? revealAllUnits : undefined}
              title={expandableUnits.size > 0 ? 'Voir les membres à relancer' : undefined}
            >
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-8 w-8 text-orange-500" />
                  <div>
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{summary.membersWithoutPayment}</div>
                    <p className="text-sm text-muted-foreground">Impayés{summary.membersExempt > 0 && <span className="ml-1 text-muted-foreground">· {summary.membersExempt} exempté(s)</span>}</p>
                    {expandableUnits.size > 0 && <p className="mt-0.5 text-xs text-primary">Voir le détail →</p>}
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
                    {/* Rough single-figure total, every currency converted into the reference currency via the
                        configured exchange rate — only shown when there's more than one currency to combine. */}
                    {summary.totalsByCurrency.length > 1 && summary.equivalentTotal > 0 && (
                      <p className="text-xs text-muted-foreground">≈ {formatMoney(summary.equivalentTotal, summary.referenceCurrency)} (équivalent)</p>
                    )}
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
              {/* Green = fully paid, amber = partial. */}
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-green-600 transition-all" style={{ width: `${paidPercentage}%` }} />
                <div className="h-full bg-amber-500 transition-all" style={{ width: `${partialPercentage}%` }} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {paidPercentage}% {summary.fullPricingConfigured ? 'ont payé en entier' : 'ont payé'}
                {summary.membersPartial > 0 && <span> · {partialPercentage}% partiellement</span>}
              </p>
            </CardContent>
          </Card>

          {/* Par unité — stats breakdown; click a unit to reveal its Ont payé / Exemptés / à-relancer lists inline */}
          <Card className="print-area" ref={parUniteRef}>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle>Par unité</CardTitle>
                <div className="flex items-center gap-2 no-print">
                  {expandableUnits.size > 0 && (
                    <Button variant="outline" size="sm" onClick={allExpanded ? collapseAll : expandAll}>
                      {allExpanded ? 'Réduire tout' : 'Développer tout'}
                    </Button>
                  )}
                {unpaid && unpaid.length > 0 && (
                  <>
                    <Button variant="outline" size="sm" onClick={exportCsv}>
                      <Download className="mr-1.5 h-4 w-4" /> Exporter (CSV)
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => window.print()}>
                      <Printer className="mr-1.5 h-4 w-4" /> Imprimer
                    </Button>
                  </>
                )}
                </div>
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
                        <th className="px-3 py-2 text-center font-medium">Partiel</th>
                        <th className="px-3 py-2 text-center font-medium">Impayé</th>
                        <th className="px-3 py-2 text-right font-medium">Montants perçus</th>
                      </tr>
                    </thead>
                    {summary.byUnit.map((u, idx) => {
                      const toRelance = unpaidByUnit.get(u.unitName) ?? []
                      const paidList = paidByUnit.get(u.unitName) ?? []
                      const exemptList = exemptByUnit.get(u.unitName) ?? []
                      const impaye = u.totalMembers - u.paidMembers - u.partialMembers - u.exemptMembers
                      // Expandable if the unit has anyone paid, exempt, OR unpaid — click reveals all lists.
                      const canExpand = paidList.length > 0 || exemptList.length > 0 || toRelance.length > 0
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
                                {u.unitCode}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">{u.totalMembers}</td>
                            <td className="px-3 py-2 text-center">
                              <Badge className="bg-green-600">{u.paidMembers}</Badge>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {u.partialMembers > 0
                                ? <Badge className="bg-amber-500 hover:bg-amber-500">{u.partialMembers}</Badge>
                                : <Badge variant="outline">0</Badge>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {/* Unpaid = members minus fully-paid minus partial minus exempt (each shown separately) */}
                              {impaye > 0 ? (
                                <Badge variant="destructive">{impaye}</Badge>
                              ) : (
                                <Badge variant="outline">0</Badge>
                              )}
                              {u.exemptMembers > 0 && <span className="ml-1 text-xs text-muted-foreground">+{u.exemptMembers} exempté(s)</span>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {u.totals.length > 0 ? (
                                <div className="space-y-0.5">
                                  {u.totals.map(t => (
                                    <div key={t.currency} className="text-sm">{formatMoney(t.total, t.currency)}</div>
                                  ))}
                                  {u.totals.length > 1 && u.equivalentTotal > 0 && (
                                    <div className="text-xs text-muted-foreground">≈ {formatMoney(u.equivalentTotal, summary.referenceCurrency)}</div>
                                  )}
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
                              <td colSpan={6} className="bg-muted/5 px-3 pb-4 pt-1">
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
                                                  <div className="flex flex-col items-end gap-0.5">
                                                    {m.totals.map(t => <div key={t.currency}>{formatMoney(t.total, t.currency)}</div>)}
                                                    {m.totals.length > 1 && m.equivalentReference > 0 && (
                                                      <span className="text-xs text-muted-foreground">≈ {formatMoney(m.equivalentReference, m.referenceCurrency)}</span>
                                                    )}
                                                    {m.status === 'Partial' && <Badge className="bg-amber-500 hover:bg-amber-500">Partiel {m.percentPaid}%</Badge>}
                                                    {/* Overpayment: fully paid AND over 100% → show the excess in the reference currency. */}
                                                    {m.status === 'Paid' && m.percentPaid > 100 && (() => {
                                                      const refFull = fullAmountFor(fullAmountsRaw, m.referenceCurrency)
                                                      const excess = refFull ? m.equivalentReference - refFull : 0
                                                      return excess > 0 ? <span className="text-xs text-amber-600 dark:text-amber-400">Trop-perçu ≈ {formatMoney(excess, m.referenceCurrency)}</span> : null
                                                    })()}
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
                                {/* Members marked EXEMPT ("ne paiera pas") — name (→ member file), the reason (if noted),
                                    and a one-click "retirer l'exemption" that puts them back in the à-relancer list. */}
                                {exemptList.length > 0 && (
                                  <div className="mb-3">
                                    <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                                      <Ban className="h-3.5 w-3.5 text-slate-500" />
                                      Exemptés — {exemptList.length} membre{exemptList.length > 1 ? 's' : ''} « ne paiera pas »
                                    </div>
                                    <div className="overflow-x-auto rounded-md border bg-background">
                                      <table className="w-full text-sm min-w-[520px]">
                                        <thead>
                                          <tr className="border-b bg-muted/40 text-left">
                                            <th className="px-3 py-2 font-medium">Membre</th>
                                            <th className="px-3 py-2 font-medium">Raison</th>
                                            <th className="px-3 py-2 font-medium text-right no-print">Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {exemptList.map((m, i2) => (
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
                                              <td className="px-3 py-2 text-muted-foreground">
                                                {m.reason ? m.reason : <span className="italic">Aucune raison indiquée</span>}
                                              </td>
                                              <td className="px-3 py-2 text-right no-print">
                                                <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => removeExempt(m)} disabled={setExempt.isPending}>
                                                  Retirer l'exemption
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
                                  À relancer — {toRelance.length} membre{toRelance.length > 1 ? 's' : ''} (impayés + partiels)
                                </div>
                                <div className="hidden overflow-x-auto rounded-md border bg-background md:block">
                                  <table className="w-full text-sm min-w-[620px]">
                                    <thead>
                                      <tr className="border-b bg-muted/40 text-left">
                                        <th className="px-3 py-2 font-medium">Membre</th>
                                        <th className="px-3 py-2 font-medium">Statut</th>
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
                                          {/* Impayé (rien versé) vs Partiel (versé une partie) — a partial shows the % paid,
                                              what's already been paid, and the amount still owed in the reference currency. */}
                                          <td className="px-3 py-2">
                                            {m.status === 'Partial' ? (
                                              <div className="flex flex-col gap-0.5">
                                                <Badge className="w-fit bg-amber-500 hover:bg-amber-500">Partiel {m.percentPaid}%</Badge>
                                                <span className="text-xs text-muted-foreground">
                                                  Déjà : {m.paidTotals.map(t => formatMoney(t.total, t.currency)).join(' + ')}
                                                  {m.remainingReference > 0 && ` · reste ≈ ${formatMoney(m.remainingReference, m.referenceCurrency)}`}
                                                </span>
                                              </div>
                                            ) : (
                                              <Badge variant="destructive" className="w-fit">Impayé</Badge>
                                            )}
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
                                                <span className="inline-flex items-center gap-1.5">
                                                  <a href={`tel:${m.contactPhone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                                                    <Phone className="h-3.5 w-3.5" /> {m.contactPhone}
                                                  </a>
                                                  <WhatsappTextLink phone={m.contactPhone} />
                                                </span>
                                              ) : null}
                                              {!m.contactEmail && !m.contactPhone && <span className="text-xs text-muted-foreground">Aucun contact</span>}
                                            </div>
                                          </td>
                                          <td className="px-3 py-2 text-right no-print">
                                            <div className="inline-flex gap-1.5">
                                              {m.status === 'Partial' ? (
                                                // A partial payer already has a cotisation row — the inline create would
                                                // reject a duplicate, so send the CG to the member file to add a line.
                                                <Button variant="outline" size="sm" className="h-8" onClick={() => navigate(`/members/${m.memberId}`)}>
                                                  <Receipt className="mr-1 h-3.5 w-3.5" /> Compléter
                                                </Button>
                                              ) : (
                                                <>
                                                  <Button variant="outline" size="sm" className="h-8" onClick={() => openPayDialog(m)}>
                                                    <Receipt className="mr-1 h-3.5 w-3.5" /> Paiement
                                                  </Button>
                                                  <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => openExemptDialog(m)} disabled={setExempt.isPending}>
                                                    <Ban className="mr-1 h-3.5 w-3.5" /> Ne paiera pas
                                                  </Button>
                                                </>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                {/* Mobile: card list for the actionable à-relancer members (in the table their
                                    Contact + Paiement/Ne paiera pas actions scrolled off-screen on a phone). */}
                                <div className="divide-y rounded-md border bg-background md:hidden">
                                  {toRelance.map((m) => (
                                    <div key={m.memberId} className="p-2.5">
                                      <button className="font-medium text-primary hover:underline" onClick={() => navigate(`/members/${m.memberId}`)}>{m.memberName}</button>
                                      <div className="mt-1">
                                        {m.status === 'Partial' ? (
                                          <div className="flex flex-col gap-0.5">
                                            <Badge className="w-fit bg-amber-500 hover:bg-amber-500">Partiel {m.percentPaid}%</Badge>
                                            <span className="text-xs text-muted-foreground">
                                              Déjà : {m.paidTotals.map(t => formatMoney(t.total, t.currency)).join(' + ')}
                                              {m.remainingReference > 0 && ` · reste ≈ ${formatMoney(m.remainingReference, m.referenceCurrency)}`}
                                            </span>
                                          </div>
                                        ) : <Badge variant="destructive" className="w-fit">Impayé</Badge>}
                                      </div>
                                      <div className="mt-1 text-xs text-muted-foreground">Père : {m.parentName ?? '—'}</div>
                                      <div className="mt-1 flex flex-col gap-0.5 text-sm">
                                        {m.contactEmail && <a href={`mailto:${m.contactEmail}`} className="inline-flex items-center gap-1.5 text-primary hover:underline"><Mail className="h-3.5 w-3.5" />{m.contactEmail}</a>}
                                        {m.contactPhone && (
                                          <span className="inline-flex items-center gap-1.5">
                                            <a href={`tel:${m.contactPhone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1.5 text-primary hover:underline"><Phone className="h-3.5 w-3.5" />{m.contactPhone}</a>
                                            <WhatsappTextLink phone={m.contactPhone} />
                                          </span>
                                        )}
                                        {!m.contactEmail && !m.contactPhone && <span className="text-xs text-muted-foreground">Aucun contact</span>}
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-1.5 no-print">
                                        {m.status === 'Partial' ? (
                                          <Button variant="outline" size="sm" onClick={() => navigate(`/members/${m.memberId}`)}><Receipt className="mr-1 h-3.5 w-3.5" />Compléter</Button>
                                        ) : (
                                          <>
                                            <Button variant="outline" size="sm" onClick={() => openPayDialog(m)}><Receipt className="mr-1 h-3.5 w-3.5" />Paiement</Button>
                                            <Button variant="outline" size="sm" className="text-muted-foreground" onClick={() => openExemptDialog(m)} disabled={setExempt.isPending}><Ban className="mr-1 h-3.5 w-3.5" />Ne paiera pas</Button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  ))}
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
                            : <span className="text-orange-600 dark:text-orange-400" title="Aucun montant configuré pour cette association">— à définir</span>}
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
                      {!dues.maitrise.pays && <span className="ml-2 text-xs text-muted-foreground">(ne paie pas cette année)</span>}
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
              {fullPriceHint && <p className="text-xs text-muted-foreground">Cotisation pleine : {fullPriceHint}</p>}
              {payLines.map((line, i) => (
                // Mobile: amount on its own line, then devise + méthode + supprimer in a row below (so the fixed
                // w-28/w-36 selects can't overflow a phone-width dialog). Inline on ≥sm.
                <div key={i} className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-end sm:border-0 sm:p-0">
                  <div className="flex-1 space-y-1">
                    {i === 0 && <span className="text-xs text-muted-foreground">Montant</span>}
                    <AmountInput value={line.amount}
                      onValueChange={n => updatePayLine(i, { amount: n > 0 ? String(n) : '' })} placeholder="0.00" />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1 sm:w-28 sm:flex-none">
                      {i === 0 && <span className="text-xs text-muted-foreground">Devise</span>}
                      <Select value={line.currency} onValueChange={v => changeCurrency(i, v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {currencies.map(c => <SelectItem key={c.code} value={c.code}>{currencyLabel(c.code)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 space-y-1 sm:w-36 sm:flex-none">
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

      {/* Mark exempt ("ne paiera pas") — optional reason, stored on the exemption and shown in the list */}
      <Dialog open={!!exemptFor} onOpenChange={(o) => !o && setExemptFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ne paiera pas{exemptFor ? ` — ${exemptFor.memberName}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ce membre sera marqué « ne paiera pas » pour {scoutYear} et retiré de la liste des impayés.
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Raison <span className="font-normal text-muted-foreground">(optionnel)</span></label>
              <textarea
                className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={exemptReason}
                onChange={e => setExemptReason(e.target.value)}
                placeholder="Ex. : difficultés financières, bourse, cas particulier…"
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExemptFor(null)}>Annuler</Button>
            <Button onClick={submitExempt} disabled={setExempt.isPending}>
              {setExempt.isPending ? 'Enregistrement...' : 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
