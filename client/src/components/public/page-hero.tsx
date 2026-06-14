// Compact header band for inner public pages (Unités, Actualités, Le Groupe, Contact).
export function PageHero({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary to-accent">
      <div className="pointer-events-none absolute -top-20 -right-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-3 max-w-2xl text-white/85">{subtitle}</p>}
      </div>
    </section>
  )
}
