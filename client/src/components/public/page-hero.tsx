// Compact header band for inner public pages (Unités, Actualités, Le Groupe, Contact).
export function PageHero({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary to-accent">
      <div className="pointer-events-none absolute -top-20 -right-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6">
        {/* break-words + text-balance so a long article/CMS title (or a long unbroken token) wraps instead of
            forcing horizontal scroll on a phone. */}
        <h1 className="text-2xl font-extrabold tracking-tight text-white text-balance break-words sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-3 max-w-2xl text-white/85 break-words">{subtitle}</p>}
      </div>
    </section>
  )
}
