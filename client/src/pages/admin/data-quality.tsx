// "Qualité des données" (Chef de Groupe): one place listing what needs fixing in the ACTIVE members' data —
// invalid emails, emails the providers couldn't deliver (bounces), members with no email at all, missing date of
// birth / gender, likely duplicates. Each line opens the member file; a fixed bounce is "Réactivé" here.
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ShieldCheck, ChevronDown, ChevronRight, CheckCircle2, RotateCcw, ExternalLink } from 'lucide-react'
import { useDataQuality, useClearBounce, type DataQualitySection } from '@/services/data-quality-service'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { parseApiError } from '@/lib/error-utils'
import { cn } from '@/lib/utils'

function Section({ s }: { s: DataQualitySection }) {
  const [open, setOpen] = useState(false)
  const clear = useClearBounce()
  const ok = s.total === 0
  const isDuplicates = s.key === 'duplicates'

  const reactivate = async (id: string) => {
    try {
      await clear.mutateAsync(id)
      toast.success('Adresse réactivée : les emails lui seront de nouveau envoyés.')
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <Card>
      <CardContent className="p-0">
        <button
          type="button"
          disabled={ok || isDuplicates}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-3 p-4 text-left disabled:cursor-default"
        >
          {ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
            : isDuplicates ? <span className="w-5" />
            : open ? <ChevronDown className="h-5 w-5 shrink-0" /> : <ChevronRight className="h-5 w-5 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 font-medium">
              {s.title}
              <Badge variant={ok ? 'success' : 'secondary'} className={cn(!ok && 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300')}>
                {s.total}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{s.hint}</p>
          </div>
          {isDuplicates && s.total > 0 && (
            <Button asChild variant="outline" size="sm" onClick={(e) => e.stopPropagation()}>
              <Link to="/admin/siblings?tab=duplicates"><ExternalLink className="mr-1 h-4 w-4" />Doublons</Link>
            </Button>
          )}
        </button>

        {open && s.items.length > 0 && (
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2">Membre</th>
                  <th className="px-4 py-2">Unité</th>
                  <th className="px-4 py-2">Problème</th>
                  {s.key === 'bounced-email' && <th className="px-4 py-2 text-right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {s.items.map((it, i) => (
                  <tr key={`${it.memberId ?? it.name}-${i}`} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">
                      {it.memberId
                        ? <Link to={`/members/${it.memberId}`} className="text-primary hover:underline">{it.name}</Link>
                        : it.name}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{it.unit ?? '—'}</td>
                    <td className="px-4 py-2">{it.detail}</td>
                    {s.key === 'bounced-email' && (
                      <td className="px-4 py-2 text-right">
                        {it.bounceId && (
                          <Button variant="outline" size="sm" disabled={clear.isPending} onClick={() => reactivate(it.bounceId!)}>
                            <RotateCcw className="mr-1 h-4 w-4" />Réactiver
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {s.total > s.items.length && (
              <p className="px-4 py-2 text-xs text-muted-foreground">Seules les {s.items.length} premières lignes sont affichées.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function DataQualityPage() {
  const { data, isLoading, isError } = useDataQuality()
  const issues = data?.sections.reduce((n, s) => n + s.total, 0) ?? 0

  return (
    <Page>
      <PageHeader
        title="Qualité des données"
        icon={ShieldCheck}
        description={data
          ? `${data.activeMembers} membres actifs vérifiés · ${issues} point(s) à corriger. Cliquez sur une ligne pour voir le détail, puis sur un nom pour ouvrir la fiche.`
          : 'Ce qui doit être corrigé dans les fiches des membres actifs.'}
      />
      {isLoading ? <LoadingSpinner variant="table" />
        : isError || !data ? <EmptyState icon={ShieldCheck} title="Impossible de charger le rapport" />
        : (
          <div className="space-y-3">
            {data.sections.map((s) => <Section key={s.key} s={s} />)}
          </div>
        )}
    </Page>
  )
}
