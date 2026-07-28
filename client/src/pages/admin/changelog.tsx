// "Journal des versions" — private release history for the maintainer (super-admin only, not in the main
// nav; reached from the version number in the sidebar footer). Shows the live build's identity (version +
// git commit + build date, baked in at build time) and the auto-generated changelog (deploy/bump.ps1 fills
// src/data/changelog.json from the git commits since the previous version tag).
import { APP_VERSION, BUILD_COMMIT, BUILD_DATE, CHANGELOG } from '@/lib/app-version'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { Tag, GitCommit, Calendar, History } from 'lucide-react'

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function ChangelogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Journal des versions</h1>
        <p className="text-sm text-muted-foreground">
          Historique des versions de l'application. Généré automatiquement à partir des changements à chaque
          déploiement.
        </p>
      </div>

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
          <p className="mt-2 text-xs text-muted-foreground">
            Le commit et la date confirment quelle version est réellement en ligne, même sans changer le numéro.
          </p>
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
                    {entry.version === APP_VERSION && <Badge className="bg-green-100 text-green-700">Actuelle</Badge>}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground/90">
                  {entry.changes.map((c, i) => <li key={i} className="break-words">{c}</li>)}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
