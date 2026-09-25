// Print / PDF view of one guide: the article alone on a white page (no app chrome), with a cover heading and a
// table of contents. Opens the browser's print dialog once images and diagrams are ready (unless ?noprint=1,
// used by the PDF export script, which waits for `data-help-ready` on <body> instead).
// Also serves the anonymous public guide at /guide/imprimer/:slug (client = publicApi).
import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import type { AxiosInstance } from 'axios'
import { headingId, useHelpDoc } from '@/services/help-service'
import { MarkdownView } from '@/components/help/markdown-view'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import apiClient from '@/lib/api-client'
import publicApi from '@/lib/public-api-client'

export function HelpPrintView({ client, linkBase }: { client: AxiosInstance; linkBase: string }) {
  const { slug } = useParams()
  const [params] = useSearchParams()
  const { data, isLoading, isError } = useHelpDoc(slug, client)
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])

  useEffect(() => {
    if (!ready) return
    document.body.dataset.helpReady = 'true'
    if (data) document.title = `${data.title} — GNDJ`
    if (params.get('noprint') !== '1') setTimeout(() => window.print(), 300)
  }, [ready, data, params])

  if (isLoading) return <LoadingSpinner />
  if (isError || !data) return <p className="p-8">Guide introuvable.</p>

  const sections = [...data.markdown.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim())
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-3xl px-8 py-10 print:max-w-none print:px-0 print:py-0">
        <header className="mb-8 border-b pb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">GNDJ — Groupe Notre-Dame de Jamhour</p>
          <h1 className="mt-2 text-3xl font-bold">{data.title}</h1>
          {data.summary && <p className="mt-2 text-slate-600">{data.summary}</p>}
          <p className="mt-3 text-xs text-slate-500">Version du {today} · https://gndj.org</p>
        </header>
        {sections.length > 2 && (
          <section className="mb-8 break-after-page">
            <p className="mb-2 font-semibold">Sommaire</p>
            <ol className="list-decimal space-y-1 pl-6 text-sm">
              {sections.map((s) => <li key={s}><a href={`#${headingId(s)}`}>{s}</a></li>)}
            </ol>
          </section>
        )}
        <MarkdownView markdown={data.markdown} client={client} linkBase={linkBase} onReady={onReady} />
      </div>
    </div>
  )
}

export default function HelpPrintPage() {
  return <HelpPrintView client={apiClient} linkBase="/aide" />
}

export function PublicHelpPrintPage() {
  return <HelpPrintView client={publicApi} linkBase="/guide" />
}
