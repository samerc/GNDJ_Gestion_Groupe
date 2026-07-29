// CG cotisation dashboard ("Tableau de bord — Cotisations"). Group-wide payment overview for a chosen scout
// year: summary tiles (active members / paid % / unpaid + exempt / total collected per currency), a paid
// progress bar, a per-unit breakdown, and an ACTIONABLE follow-up list of members with no payment — grouped
// by unit, each row showing the parent + email/phone (clickable mailto:/tel:) so the CG can chase the money,
// clickable to open the member file, with inline "record a payment" and "ne paiera pas" actions, plus CSV
// export and print. "Payé" = a cotisation with a payment line; exempt ("ne paiera pas") members are excluded
// from impayés. Multi-currency (USD/EUR/LBP) — totals are per-currency, not converted.
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router'
import {
  useCotisationSummary, useUnpaidCotisations, useCreateCotisation, useSetCotisationExempt,
  type UnpaidCotisationDto,
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
import { Receipt, Users, AlertTriangle, CheckCircle, Mail, Phone, Ban, Printer, Download, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'


export default function CotisationDashboardPage() {
  const currentScoutYear = useCurrentScoutYear()
  const defaultAmount = useSettingValue('cotisation.default_amount')
  const [scoutYear, setScoutYear] = useState(currentScoutYear)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: summary, isLoading } = useCotisationSummary(scoutYear)
  const { data: unpaid } = useUnpaidCotisations(scoutYear)

  // Shared mutations for the inline row actions (memberId passed per-call; queries invalidated below).
  const createCotisation = useCreateCotisation('')
  const setExempt = useSetCotisationExempt()

  // ── Record-payment dialog state (compact single-line entry; the full multi-line editor lives on the
  //    member file / CU matrix — here the CG just logs "they paid" to clear the follow-up). ──
  const [payFor, setPayFor] = useState<UnpaidCotisationDto | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payCurrency, setPayCurrency] = useState('USD')
  const [payMethod, setPayMethod] = useState('Cash')
  const [payDate, setPayDate] = useState('')

  const openPayDialog = (m: UnpaidCotisationDto) => {
    setPayFor(m)
    setPayAmount(defaultAmount ?? '100')
    setPayCurrency('USD')
    setPayMethod('Cash')
    setPayDate(new Date().toISOString().split('T')[0])
  }

  const refreshCotisations = () => {
    qc.invalidateQueries({ queryKey: ['cotisations', 'unpaid', scoutYear] })
    qc.invalidateQueries({ queryKey: ['cotisations', 'summary', scoutYear] })
  }

  const submitPayment = async () => {
    if (!payFor) return
    const amount = parseFloat(payAmount)
    if (!(amount > 0)) { toast.error('Le montant doit être supérieur à 0.'); return }
    try {
      await createCotisation.mutateAsync({
        memberId: payFor.memberId,
        scoutYear,
        paymentDate: payDate,
        payments: [{ amount, currency: payCurrency, paymentMethod: payMethod }],
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

  // Group the unpaid members by unit so each CU gets a clear section (backend already orders by unit → name).
  const unpaidByUnit = useMemo(() => {
    const groups = new Map<string, UnpaidCotisationDto[]>()
    for (const u of unpaid ?? []) {
      const list = groups.get(u.unitName) ?? []
      list.push(u)
      groups.set(u.unitName, list)
    }
    return [...groups.entries()]
  }, [unpaid])

  const exportCsv = () => {
    if (!unpaid || unpaid.length === 0) return
    const header = ['Unité', 'Membre', 'Parent', 'Email', 'Téléphone']
    const escape = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`
    const lines = unpaid.map(u => [u.unitName, u.memberName, u.parentName ?? '', u.contactEmail ?? '', u.contactPhone ?? ''].map(escape).join(','))
    // UTF-8 BOM so Excel reads accents correctly.
    const csv = '﻿' + [header.map(escape).join(','), ...lines].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `impayes_cotisations_${scoutYear}.csv`
    a.click()
    URL.revokeObjectURL(url)
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

          {/* By unit breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Par unité</CardTitle>
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
                    <tbody>
                      {summary.byUnit.map((u, idx) => (
                        <tr key={u.unitName} className={`border-b ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                          <td className="px-3 py-2 font-medium">{u.unitName}</td>
                          <td className="px-3 py-2 text-center">{u.totalMembers}</td>
                          <td className="px-3 py-2 text-center">
                            <Badge className="bg-green-600">{u.paidMembers}</Badge>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {/* Unpaid = members minus paid minus exempt (exempt shown separately, not as impayés) */}
                            {u.totalMembers - u.paidMembers - u.exemptMembers > 0 ? (
                              <Badge variant="destructive">{u.totalMembers - u.paidMembers - u.exemptMembers}</Badge>
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
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Unpaid members — actionable follow-up list, grouped by unit */}
      {unpaid && unpaid.length > 0 && (
        <Card className="print-area">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                À relancer — {unpaid.length} membre{unpaid.length > 1 ? 's' : ''} sans cotisation ({scoutYear})
              </CardTitle>
              <div className="flex items-center gap-2 no-print">
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download className="mr-1.5 h-4 w-4" /> Exporter (CSV)
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer className="mr-1.5 h-4 w-4" /> Imprimer
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {unpaidByUnit.map(([unitName, members]) => (
              <div key={unitName}>
                <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                  <span>{unitName}</span>
                  <Badge variant="secondary">{members.length}</Badge>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left">
                        <th className="px-3 py-2 font-medium">Membre</th>
                        <th className="px-3 py-2 font-medium">Parent</th>
                        <th className="px-3 py-2 font-medium">Contact</th>
                        <th className="px-3 py-2 font-medium text-right no-print">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m, idx) => (
                        <tr key={m.memberId} className={`border-b ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
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
            ))}
          </CardContent>
        </Card>
      )}

      {/* Compact record-payment dialog */}
      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enregistrer un paiement{payFor ? ` — ${payFor.memberName}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Montant</label>
                <Input type="number" min={0} step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Devise</label>
                <Select value={payCurrency} onValueChange={setPayCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="LBP">LBP (ل.ل)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Méthode</label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Date</label>
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Un reçu est généré automatiquement. Pour plusieurs lignes de paiement, ouvrez la fiche du membre.</p>
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
