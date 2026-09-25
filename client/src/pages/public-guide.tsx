// Anonymous guide page (/guide/:slug) for the PUBLIC guides — the family enrolment guide, linked from the
// enrolment portal and the login page. Only guides with audience "public" load here (the API returns 404 for
// anything else to an anonymous caller).
import { Link, useParams } from 'react-router'
import { ArrowLeft, BookOpen, Printer } from 'lucide-react'
import { useHelpDoc } from '@/services/help-service'
import { MarkdownView } from '@/components/help/markdown-view'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Button } from '@/components/ui/button'
import publicApi from '@/lib/public-api-client'

export default function PublicGuidePage() {
  const { slug } = useParams()
  const { data, isLoading, isError } = useHelpDoc(slug, publicApi)

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <BookOpen className="h-5 w-5 text-primary" />
          <span className="font-semibold">Aide — GNDJ</span>
          <div className="flex-1" />
          <Button asChild variant="ghost" size="sm"><Link to="/inscription"><ArrowLeft className="mr-1 h-4 w-4" />Inscription</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        {isLoading ? <LoadingSpinner /> : isError || !data ? (
          <p className="text-muted-foreground">Guide introuvable.</p>
        ) : (
          <div className="rounded-xl border bg-card p-5 shadow-card sm:p-8">
            <div className="mb-4 flex items-start gap-3">
              <h1 className="flex-1 text-2xl font-bold tracking-tight sm:text-3xl">{data.title}</h1>
              <Button variant="outline" size="sm" onClick={() => window.open(`/guide/imprimer/${slug}`, '_blank')}>
                <Printer className="mr-1 h-4 w-4" />Imprimer
              </Button>
            </div>
            {data.summary && <p className="mb-6 text-muted-foreground">{data.summary}</p>}
            <MarkdownView markdown={data.markdown} client={publicApi} linkBase="/guide" />
          </div>
        )}
      </main>
    </div>
  )
}
