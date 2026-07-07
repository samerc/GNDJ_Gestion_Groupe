// Admin "Textes du site" page ("/admin/site-texts", content.manage). Edits the editable copy of the public
// site's fixed sections (home hero/intro/values/stats/CTA, footer, contact) stored in the single site.content
// JSON setting. Loads into a local `form` draft; the whole object is saved at once. The home CTA only renders
// publicly when inscriptions are open (see public-layout); values/stats are capped at 6 entries each.
import { useState } from 'react'
import { parseApiError } from '@/lib/error-utils'
import { useSiteContent, useUpdateSiteContent, type SiteContent } from '@/services/site-content-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Plus, Trash2 } from 'lucide-react'
import { Tip } from '@/components/ui/tooltip'
import { toast } from 'sonner'

function Field({ label, value, onChange, textarea, max }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean; max?: number }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} maxLength={max ?? 1000}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-2xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} maxLength={max ?? 200} />
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

export default function AdminSiteTextsPage() {
  const { data, isLoading } = useSiteContent()
  const [form, setForm] = useState<SiteContent | null>(null)
  const updateMutation = useUpdateSiteContent()

  // Hydrate the form when the fetched content (re)loads — render-phase reset.
  const [prevData, setPrevData] = useState(data)
  if (data && data !== prevData) { setPrevData(data); setForm(data) }

  if (isLoading || !form) return <LoadingSpinner />

  const home = form.home
  const setHome = (patch: Partial<SiteContent['home']>) => setForm({ ...form, home: { ...home, ...patch } })

  const handleSave = async () => {
    try { await updateMutation.mutateAsync(form); toast.success('Textes du site enregistrés') }
    catch (err) { toast.error(parseApiError(err)) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Textes du site</h1>
          <p className="text-sm text-muted-foreground">Contenu des sections fixes du site public (accueil, pied de page, contact).</p>
        </div>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>{updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}</Button>
      </div>

      <Section title="Accueil — bannière">
        <Field label="Badge" value={home.heroBadge} onChange={(v) => setHome({ heroBadge: v })} />
        <Field label="Titre" value={home.heroTitle} onChange={(v) => setHome({ heroTitle: v })} />
        <Field label="Sous-titre" value={home.heroSubtitle} onChange={(v) => setHome({ heroSubtitle: v })} textarea max={1000} />
      </Section>

      <Section title="Accueil — introduction">
        <Field label="Titre" value={home.introTitle} onChange={(v) => setHome({ introTitle: v })} />
        <Field label="Texte" value={home.introText} onChange={(v) => setHome({ introText: v })} textarea max={1000} />
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium">Valeurs</label>
            {home.values.length < 6 && <Button type="button" variant="outline" size="sm" onClick={() => setHome({ values: [...home.values, { title: '', text: '' }] })}><Plus className="mr-1 h-3.5 w-3.5" />Ajouter</Button>}
          </div>
          <div className="space-y-3">
            {home.values.map((v, i) => (
              <div key={i} className="flex gap-2 rounded-lg border border-border p-3">
                <div className="flex-1 space-y-2">
                  <Input placeholder="Titre" value={v.title} maxLength={100} onChange={(e) => setHome({ values: home.values.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
                  <Input placeholder="Texte" value={v.text} maxLength={500} onChange={(e) => setHome({ values: home.values.map((x, j) => j === i ? { ...x, text: e.target.value } : x) })} />
                </div>
                <Tip content="Supprimer"><Button type="button" variant="ghost" size="icon" onClick={() => setHome({ values: home.values.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4 text-destructive" /></Button></Tip>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Accueil — chiffres clés">
        {home.stats.length < 6 && <Button type="button" variant="outline" size="sm" onClick={() => setHome({ stats: [...home.stats, { value: '', label: '' }] })}><Plus className="mr-1 h-3.5 w-3.5" />Ajouter</Button>}
        <div className="grid gap-3 sm:grid-cols-2">
          {home.stats.map((s, i) => (
            <div key={i} className="flex items-end gap-2 rounded-lg border border-border p-3">
              <div className="flex-1 space-y-2">
                <Input placeholder="Valeur (ex. 1935)" value={s.value} maxLength={20} onChange={(e) => setHome({ stats: home.stats.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} />
                <Input placeholder="Libellé" value={s.label} maxLength={100} onChange={(e) => setHome({ stats: home.stats.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
              </div>
              <Tip content="Supprimer"><Button type="button" variant="ghost" size="icon" onClick={() => setHome({ stats: home.stats.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4 text-destructive" /></Button></Tip>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Accueil — appel à l'action (visible quand les inscriptions sont ouvertes)">
        <Field label="Titre" value={home.ctaTitle} onChange={(v) => setHome({ ctaTitle: v })} />
        <Field label="Texte" value={home.ctaText} onChange={(v) => setHome({ ctaText: v })} textarea max={1000} />
      </Section>

      <Section title="Pied de page">
        <Field label="Texte" value={form.footer.tagline} onChange={(v) => setForm({ ...form, footer: { ...form.footer, tagline: v } })} textarea max={600} />
        <Field label="Instagram (URL du profil)" value={form.footer.instagram ?? ''} onChange={(v) => setForm({ ...form, footer: { ...form.footer, instagram: v } })} max={300} />
        <Field label="Facebook (URL de la page)" value={form.footer.facebook ?? ''} onChange={(v) => setForm({ ...form, footer: { ...form.footer, facebook: v } })} max={300} />
      </Section>

      <Section title="Contact">
        <Field label="Introduction" value={form.contact.intro} onChange={(v) => setForm({ ...form, contact: { ...form.contact, intro: v } })} textarea max={600} />
        <Field label="Adresse" value={form.contact.address} onChange={(v) => setForm({ ...form, contact: { ...form.contact, address: v } })} textarea max={400} />
      </Section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateMutation.isPending}>{updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}</Button>
      </div>
    </div>
  )
}
