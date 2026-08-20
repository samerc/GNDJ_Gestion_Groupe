// Per-route document metadata for the public site. React 19 hoists <title>/<meta> rendered anywhere in the
// tree into <head>, so each public page can set its own title + description (+ Open Graph) simply by rendering
// <Seo>. This improves the browser tab, bookmarks, and JS-rendering crawlers (Google). NOTE: social scrapers
// that don't execute JS (Facebook/WhatsApp) fall back to the static floor in index.html — full share-card
// accuracy would need server-side prerendering (documented follow-up).
const SITE_NAME = 'Groupe Notre-Dame de Jamhour'
const SUFFIX = ` — ${SITE_NAME}`

export function Seo({ title, description }: { title: string; description?: string }) {
  // Keep the site name in the tab title without duplicating it when the page title already is the site name.
  const fullTitle = title === SITE_NAME ? title : `${title}${SUFFIX}`
  return (
    <>
      <title>{fullTitle}</title>
      <meta property="og:title" content={fullTitle} />
      {description && <meta name="description" content={description} />}
      {description && <meta property="og:description" content={description} />}
    </>
  )
}
