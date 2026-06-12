import { useState } from 'react'
import { useCotisationSummary, useUnpaidCotisations } from '@/services/cotisation-service'
import { useSettingValue } from '@/services/settings-service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Receipt, Users, AlertTriangle, CheckCircle } from 'lucide-react'

function formatCurrency(amount: number, currency: string): string {
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : 'ل.ل'
  return `${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${symbol}`
}

export default function CotisationDashboardPage() {
  const currentScoutYear = useSettingValue('cotisation.current_scout_year') ?? '2025-2026'
  const [scoutYear, setScoutYear] = useState(currentScoutYear)

  const { data: summary, isLoading } = useCotisationSummary(scoutYear)
  const { data: unpaid } = useUnpaidCotisations(scoutYear)

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
                    <p className="text-sm text-muted-foreground">Impayés</p>
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
                          <div key={t.currency} className="text-lg font-bold">{formatCurrency(t.total, t.currency)}</div>
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
                            {u.totalMembers - u.paidMembers > 0 ? (
                              <Badge variant="destructive">{u.totalMembers - u.paidMembers}</Badge>
                            ) : (
                              <Badge variant="outline">0</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {u.totals.length > 0 ? (
                              <div className="space-y-0.5">
                                {u.totals.map(t => (
                                  <div key={t.currency} className="text-sm">{formatCurrency(t.total, t.currency)}</div>
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

      {/* Unpaid members list */}
      {unpaid && unpaid.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Membres sans cotisation — {scoutYear}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left font-medium">Membre</th>
                    <th className="px-3 py-2 text-left font-medium">Unité</th>
                  </tr>
                </thead>
                <tbody>
                  {unpaid.map((u, idx) => (
                    <tr key={u.memberId} className={`border-b ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                      <td className="px-3 py-2">{u.memberName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{u.unitName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
