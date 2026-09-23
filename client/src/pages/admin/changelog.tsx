// "Journal des versions" — private release history for the maintainer (super-admin only, not in the main
// nav; reached from the version number in the sidebar footer). Shows the live build's identity (version +
// git commit + build date, baked in at build time) and the auto-generated changelog (deploy/bump.ps1 fills
// src/data/changelog.json from the git commits since the previous version tag).
import { APP_VERSION, BUILD_COMMIT, BUILD_DATE, CHANGELOG, type ChangelogChange } from '@/lib/app-version'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { Tag, GitCommit, Calendar, History } from 'lucide-react'

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
}

// Short "13 sept." for the per-entry date chip; falls back to the raw value if unparseable.
function shortDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

// A change may be a plain string (use the block's release date) or an object with its own date.
function changeParts(c: ChangelogChange, fallbackDate: string): { date: string; text: string } {
  return typeof c === 'string' ? { date: fallbackDate, text: c } : { date: c.date || fallbackDate, text: c.text }
}

// `embedded` = rendered inside a Paramètres tab (suppresses the page's own big heading).
export default function ChangelogPage({ embedded = false }: { embedded?: boolean } = {}) {
  return (
    <Page>
      {!embedded && (
        <PageHeader
          title="Journal des versions"
          icon={History}
          description="Historique des versions de l'application. Généré automatiquement à partir des changements à chaque déploiement."
        />
      )}

      {/* Live build identity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Version actuelle</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge className="gap-1.5 bg-primary/10 text-primary"><Tag className="h-3.5 w-3.5" />v{APP_VERSION}</Badge>
            <Badge variant="outline" className="gap-1.5 font-mono"><GitCommit className="h-3.5 w-3.5" />{BUILD_COMMIT}</Badge>
            {BUILD_DATE && <Badge variant="outline" className="gap-1.5"><Calendar className="h-3.5 w-3.5" />{formatDate(BUILD_DATE)}</Badge>}
          </div>
        </CardContent>
      </Card>

      {/* Release history */}
      {CHANGELOG.length === 0 ? (
        <EmptyState icon={History} title="Aucune version" description="L'historique se remplit à chaque déploiement." />
      ) : (
        <div className="space-y-4">
          {CHANGELOG.map((entry) => (
            <Card key={entry.version}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Tag className="h-4 w-4 text-muted-foreground" />v{entry.version}
                    {entry.version === APP_VERSION && <Badge variant="success">Actuelle</Badge>}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground/90">
                  {entry.changes.map((c, i) => {
                    const { date, text } = changeParts(c, entry.date)
                    return (
                      <li key={i} className="break-words">
                        {date && (
                          <span className="mr-1.5 inline-block rounded bg-muted px-1.5 py-0.5 align-middle text-[11px] font-medium tabular-nums text-muted-foreground">
                            {shortDate(date)}
                          </span>
                        )}
                        {text}
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Page>
  )
}
