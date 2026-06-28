import { useState } from 'react'
import { PageHero } from '@/components/public/page-hero'
import { HoneypotField } from '@/components/shared/honeypot-field'
import { useSendContact, usePublicSiteConfig } from '@/services/public-service'
import { parseApiError } from '@/lib/error-utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RequiredLabel } from '@/components/shared/required-label'
import { CheckCircle2, Mail, MapPin } from 'lucide-react'

// Public contact page at `/contact` — anonymous. Posts the message to the backend (rate-limited
// + honeypot-guarded), which emails a chef. On success swaps the form for a confirmation panel.
export default function PublicContactPage() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [website, setWebsite] = useState('') // honeypot: bots fill it, real users can't see it → backend rejects
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false) // true after a successful send → show confirmation instead of the form
  const sendMutation = useSendContact()
  const { data: config } = usePublicSiteConfig()
  const contact = config?.content.contact // CMS-editable intro/address copy

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim() || !form.email.trim() || !form.subject.trim() || !form.message.trim()) {
      setError('Veuillez remplir tous les champs.')
      return
    }
    try {
      await sendMutation.mutateAsync({ ...form, website })
      setSent(true)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  return (
    <>
      <PageHero title="Contact" subtitle={contact?.intro} />
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-3">
          {/* Info */}
          <div className="space-y-6 lg:col-span-1">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MapPin className="h-5 w-5" /></span>
              <div>
                <h3 className="font-semibold">Le Groupe</h3>
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{contact?.address ?? 'Groupe Notre-Dame Jamhour\nLiban'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Mail className="h-5 w-5" /></span>
              <div>
                <h3 className="font-semibold">Écrivez-nous</h3>
                <p className="mt-1 text-sm text-muted-foreground">Utilisez le formulaire, un chef du groupe vous répondra.</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-2">
            {sent ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-10 text-center shadow-card">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
                <h2 className="text-xl font-semibold">Message envoyé</h2>
                <p className="text-muted-foreground">Merci ! Nous vous répondrons dès que possible.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
                {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
                <HoneypotField value={website} onChange={setWebsite} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <RequiredLabel required>Nom</RequiredLabel>
                    <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} maxLength={100} required />
                  </div>
                  <div className="space-y-2">
                    <RequiredLabel required>Email</RequiredLabel>
                    <Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} maxLength={254} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <RequiredLabel required>Sujet</RequiredLabel>
                  <Input value={form.subject} onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))} maxLength={150} required />
                </div>
                <div className="space-y-2">
                  <RequiredLabel required>Message</RequiredLabel>
                  <textarea
                    value={form.message}
                    onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
                    rows={6}
                    maxLength={4000}
                    required
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-2xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <Button type="submit" disabled={sendMutation.isPending} className="w-full sm:w-auto">
                  {sendMutation.isPending ? 'Envoi...' : 'Envoyer le message'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
