// « Remplir en ligne »: the document's in-app template shown as a form on the phone. The member's data is already
// written in (from the server); each blank of the template becomes an input — a line → a text field, a box → a
// larger text area, a checkbox → a checkbox (the server gives every blank a key f0, f1…). Then who signs, the
// « je certifie » tick and the finger signature; « Envoyer » makes the signed PDF, saved as the member's document
// (waiting for the chef d'unité's check, like an upload).
//
// The template HTML is turned into React elements node by node (never injected as HTML): only the tags the editor
// produces are kept, everything else is reduced to its text.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileSignature, Send } from 'lucide-react'
import apiClient from '@/lib/api-client'
import { parseApiError } from '@/lib/error-utils'
import { confirmAsync } from '@/lib/confirm'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Callout } from '@/components/shared/callout'
import { SignaturePad } from './signature-pad'
import { normalizeFormDate, displayFormDate } from '@/lib/form-dates'

interface OnlineForm {
  documentTypeId: string
  documentTypeName: string
  memberName: string
  html: string
  fields: { key: string; kind: 'fill' | 'date' | 'box' | 'checkbox' | 'signature'; save?: string | null; label?: string | null; required?: boolean }[]
  templateHash: string
  prefill?: Record<string, string> | null // last time's answers / blood type / today for the signing date
  signerName?: string | null
  signerRelation?: string | null
}

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

const RELATIONS = ['Père', 'Mère', 'Tuteur', 'Tutrice', 'Le membre lui-même']

// What the parent has typed so far, kept in this browser until the form is sent: a phone that goes to the Photos app
// (to check the vaccination booklet) often comes back to a reloaded tab, and the back button leaves the page.
// Only restored for the same template version (the keys f0, f1… follow the template).
interface Draft { templateHash: string; answers: Record<string, string>; signerName: string; relation: string }
const draftKey = (memberId: string, documentTypeId: string) => `online-form-draft:${memberId}:${documentTypeId}`
function readDraft(key: string): Draft | null {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as Draft) : null } catch { return null }
}
function writeDraft(key: string, draft: Draft | null) {
  try { if (draft) localStorage.setItem(key, JSON.stringify(draft)); else localStorage.removeItem(key) } catch { /* private mode: no draft */ }
}

// The server's answer when this document is already waiting for the check — after a send whose response was lost
// on a bad network, the retry lands here: the document IS saved, so it's a success for the parent.
const ALREADY_SENT = 'déjà été envoyé'

export function OnlineFormDialog({ memberId, documentTypeId, onClose, isOwnProfile }: {
  memberId: string; documentTypeId: string; onClose: () => void
  // false when a chef opens a member's form: the last signer (usually a parent) is not pre-filled for them.
  isOwnProfile?: boolean
}) {
  const qc = useQueryClient()
  const { data: form, error, isLoading } = useQuery({
    queryKey: ['documents', 'online-form', memberId, documentTypeId],
    queryFn: () => apiClient.get<OnlineForm>('/documents/online-form', { params: { memberId, documentTypeId } }).then((r) => r.data),
    staleTime: 0,
    gcTime: 0,
  })
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [signerName, setSignerName] = useState('')
  const [relation, setRelation] = useState('')
  const [certified, setCertified] = useState(false)
  const [signature, setSignature] = useState<string | null>(null)

  // Start from the unsent draft if there is one, else last time's answers (and the last signer) — render-phase,
  // once per form.
  const storageKey = draftKey(memberId, documentTypeId)
  const [hydratedFor, setHydratedFor] = useState<string | null>(null)
  // Snapshot of the starting values: the form counts as started once anything differs (or a draft was restored).
  const [initial, setInitial] = useState('')
  const [restored, setRestored] = useState(false)
  if (form && hydratedFor !== form.templateHash) {
    setHydratedFor(form.templateHash)
    const draft = readDraft(storageKey)
    if (draft && draft.templateHash === form.templateHash) {
      setAnswers(draft.answers ?? {})
      setSignerName(draft.signerName ?? '')
      setRelation(RELATIONS.includes(draft.relation) ? draft.relation : '')
      setRestored(true)
    } else {
      // Date blanks are edited as typed text (JJ/MM/AAAA, MM/AAAA or AAAA) — show prefilled dates that way.
      const dateKeys = new Set(form.fields.filter((f) => f.kind === 'date').map((f) => f.key))
      const start = Object.fromEntries(Object.entries(form.prefill ?? {}).map(([k, v]) => [k, dateKeys.has(k) ? displayFormDate(v) : v]))
      // The last signer is pre-filled only on the member's own fiche — not for a chef opening it.
      const own = isOwnProfile !== false
      const startSigner = own ? form.signerName ?? '' : ''
      const startRelation = own && form.signerRelation && RELATIONS.includes(form.signerRelation) ? form.signerRelation : ''
      setAnswers(start)
      setSignerName(startSigner)
      setRelation(startRelation)
      setInitial(JSON.stringify([start, startSigner, startRelation]))
    }
  }
  const dirty = !!form && (restored || (initial !== '' && JSON.stringify([answers, signerName, relation]) !== initial))

  // Keep the draft up to date while the parent types (only once they changed something).
  useEffect(() => {
    if (form && dirty) writeDraft(storageKey, { templateHash: form.templateHash, answers, signerName, relation })
  }, [form, dirty, storageKey, answers, signerName, relation])

  const done = (message: string) => {
    writeDraft(storageKey, null)
    qc.invalidateQueries({ queryKey: ['documents', memberId] })
    qc.invalidateQueries({ queryKey: ['documents', 'matrix'] })
    // The send also writes the blood type / allergies / notes into the fiche and moves the dossier's progress.
    qc.invalidateQueries({ queryKey: ['members'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    toast.success(message)
    onClose()
  }

  const submit = useMutation({
    mutationFn: (sent: Record<string, string>) => apiClient.post('/documents/online-form', {
      memberId, documentTypeId, templateHash: form!.templateHash, answers: sent,
      signerName: signerName.trim(), signerRelation: relation, signaturePng: signature, certified,
    }),
    onSuccess: () => done('Document signé et envoyé. Il sera vérifié par la maîtrise.'),
    onError: (e) => {
      const msg = parseApiError(e)
      if (msg.includes(ALREADY_SENT)) done('Document bien reçu. Il sera vérifié par la maîtrise.')
      else toast.error(msg)
    },
  })

  // Parse the template ONCE per form (it used to be re-parsed on every keystroke — noticeable lag on a long fiche
  // médicale on a low-end phone); only the cheap node → React mapping follows the answers.
  const nodes = useMemo(() => {
    if (!form) return null
    return Array.from(new DOMParser().parseFromString(form.html, 'text/html').body.childNodes)
  }, [form])

  const body = useMemo(() => {
    if (!nodes) return null
    const set = (k: string, v: string) => setAnswers((a) => ({ ...a, [k]: v }))
    return <>{nodes.map((n, i) => toReact(n, `${i}`, answers, set))}</>
  }, [nodes, answers])

  const send = () => {
    // Required blanks first (they're in the form above): name the first empty one and bring it into view.
    const missing = form!.fields.find((f) => f.required && !(answers[f.key] ?? '').trim())
    if (missing) {
      // « — du médecin de famille » → « Médecin de famille » (same cleanup as the server's message).
      const label = (missing.label ?? '').replace(/^[\s—–-]+/, '').replace(/^(de la |de l'|de l’|du |des |de )/i, '')
      toast.error(`Champ obligatoire${label ? ` : ${label.charAt(0).toUpperCase()}${label.slice(1)}` : ''}.`)
      const el = document.getElementById(`of-${missing.key}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.focus({ preventScroll: true })
      return
    }
    if (!signerName.trim()) { toast.error('Indiquez votre nom.'); return }
    if (!relation) { toast.error('Indiquez qui signe.'); return }
    if (!certified) { toast.error("Cochez « Je certifie l'exactitude des informations »."); return }
    if (!signature) { toast.error('Signez dans le cadre (une vraie signature, pas un simple point).'); return }
    // Date blanks: typed text → yyyy-MM-dd / MM/yyyy / yyyy; refuse what can't be read, naming the field.
    const sent = { ...answers }
    for (const f of form!.fields.filter((x) => x.kind === 'date')) {
      const v = normalizeFormDate(answers[f.key] ?? '')
      if (v === null) { toast.error(`Date non reconnue${f.label ? ` (${f.label})` : ''} : écrivez JJ/MM/AAAA, MM/AAAA ou l'année seule.`); return }
      sent[f.key] = v
    }
    submit.mutate(sent)
  }

  // Closing (X, Échap, Annuler) with answers typed asks first; the draft stays saved either way.
  const requestClose = async () => {
    if (submit.isPending) return
    if (dirty && !(await confirmAsync({
      title: 'Fermer le formulaire ?',
      description: "Il n'a pas encore été envoyé. Vos réponses restent enregistrées sur cet appareil et seront reprises la prochaine fois.",
      confirmLabel: 'Fermer', cancelLabel: 'Continuer à remplir',
    }))) return
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) void requestClose() }}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-lg">
        <DialogHeader className="border-b p-4 text-left">
          <DialogTitle className="flex items-center gap-2"><FileSignature className="h-5 w-5 text-primary" />{form?.documentTypeName ?? 'Remplir en ligne'}</DialogTitle>
          <DialogDescription>{form ? `Pour ${form.memberName}. Complétez les champs, puis signez en bas.` : 'Chargement du formulaire…'}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {error ? <Callout tone="danger">{parseApiError(error)}</Callout> : isLoading || !form ? <LoadingSpinner /> : (
            <div className="space-y-6">
              <div className="online-form space-y-2 rounded-lg border bg-white p-4 text-sm leading-relaxed text-gray-900 shadow-sm dark:bg-white">{body}</div>

              <section className="space-y-4 rounded-lg border p-4">
                <h3 className="font-semibold">Signature</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="of-name">Votre nom</Label>
                    <Input id="of-name" value={signerName} maxLength={150} autoComplete="name" onChange={(e) => setSignerName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vous êtes</Label>
                    <Select value={relation} onValueChange={setRelation}>
                      <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                      <SelectContent>{RELATIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={certified} onChange={(e) => setCertified(e.target.checked)} />
                  Je certifie l'exactitude des informations et je signe ce document électroniquement.
                </label>
                <SignaturePad onChange={setSignature} />
              </section>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 border-t p-4">
          <Button variant="outline" onClick={() => void requestClose()} disabled={submit.isPending}>Annuler</Button>
          <Button onClick={send} disabled={!form || submit.isPending}><Send className="mr-1.5 h-4 w-4" />{submit.isPending ? 'Envoi…' : 'Signer et envoyer'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Tags kept as they are (with their text alignment); anything else is reduced to its content.
const BLOCKS: Record<string, string> = { p: 'p', h1: 'h2', h2: 'h3', h3: 'h4', h4: 'h5', h5: 'h5', h6: 'h5', ul: 'ul', ol: 'ol', li: 'li', blockquote: 'blockquote' }
const INLINE: Record<string, string> = { strong: 'strong', b: 'strong', em: 'em', i: 'em', u: 'u', s: 's', strike: 's', del: 's' }
const BLOCK_CLASS: Record<string, string> = {
  h2: 'text-lg font-bold', h3: 'text-base font-bold', h4: 'font-bold', h5: 'font-semibold',
  ul: 'list-disc pl-6', ol: 'list-decimal pl-6', blockquote: 'border-l-4 pl-3 italic', p: 'min-h-[1em]',
}

function align(el: Element): React.CSSProperties | undefined {
  const m = /text-align:\s*(left|center|right|justify)/i.exec(el.getAttribute('style') ?? '')
  return m ? { textAlign: m[1].toLowerCase() as React.CSSProperties['textAlign'] } : undefined
}

function toReact(node: Node, key: string, answers: Record<string, string>, set: (k: string, v: string) => void): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent
  if (node.nodeType !== Node.ELEMENT_NODE) return null
  const el = node as Element
  const tag = el.tagName.toLowerCase()
  const children = () => Array.from(el.childNodes).map((c, i) => toReact(c, `${key}.${i}`, answers, set))
  const fieldKey = el.getAttribute('data-key')

  // The « Signature : ___ » line gets the signature drawn at the bottom — nothing to type here.
  if (fieldKey && el.hasAttribute('data-signature')) {
    return <span key={key} className="mx-1 inline-block rounded bg-muted px-2 py-0.5 text-xs italic text-gray-600">signature ci-dessous ↓</span>
  }
  // A blank linked to the fiche's blood type: a list of the 8 groups.
  if (fieldKey && el.hasAttribute('data-fill') && el.getAttribute('data-save') === 'bloodType') {
    return <select key={key} aria-label="Groupe sanguin" value={answers[fieldKey] ?? ''} onChange={(e) => set(fieldKey, e.target.value)}
      className="mx-1 inline-block rounded border-b-2 border-dashed border-primary/50 bg-primary/5 px-1 py-0.5 align-baseline text-gray-900 outline-none focus:border-primary">
      <option value="">—</option>
      {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
    </select>
  }
  // A date blank: typed in the French order — a full date, a month/year or the year alone (vaccine boosters are
  // often known only by year). Red underline while it can't be read; converted when sending (lib/form-dates).
  if (fieldKey && el.hasAttribute('data-fill') && el.hasAttribute('data-date')) {
    const v = answers[fieldKey] ?? ''
    const bad = normalizeFormDate(v) === null
    return <input key={key} id={`of-${fieldKey}`} type="text" inputMode="numeric" aria-label="Date (JJ/MM/AAAA, MM/AAAA ou année)" placeholder="JJ/MM/AAAA" required={el.hasAttribute('data-required')}
      value={v} maxLength={10} onChange={(e) => set(fieldKey, e.target.value)}
      // Once left, show how it was read (01062019 → 01/06/2019) so the parent can check it.
      onBlur={() => { const n = normalizeFormDate(v); if (n && displayFormDate(n) !== v) set(fieldKey, displayFormDate(n)) }}
      className={`mx-1 inline-block w-32 rounded border-b-2 border-dashed px-1 py-0.5 align-baseline text-gray-900 outline-none placeholder:text-gray-400 ${bad ? 'border-red-500 bg-red-50' : 'border-primary/50 bg-primary/5 focus:border-primary'}`} />
  }
  // The blanks to fill.
  if (fieldKey && el.hasAttribute('data-fill')) {
    const w = Number(el.getAttribute('data-w') ?? 200)
    const required = el.hasAttribute('data-required')
    return <input key={key} id={`of-${fieldKey}`} type="text" aria-label={required ? 'Champ obligatoire' : 'Champ à remplir'} required={required}
      placeholder={required ? 'obligatoire' : undefined} value={answers[fieldKey] ?? ''} maxLength={2000}
      onChange={(e) => set(fieldKey, e.target.value)}
      className={`mx-1 inline-block min-w-24 border-0 border-b-2 border-dashed px-1 py-0.5 align-baseline text-gray-900 outline-none placeholder:text-xs placeholder:italic placeholder:text-red-400 focus:border-primary ${required && !(answers[fieldKey] ?? '').trim() ? 'border-red-400 bg-red-50' : 'border-primary/50 bg-primary/5'}`}
      style={{ width: `min(${Math.max(w, 120)}px, 100%)` }} />
  }
  if (fieldKey && el.hasAttribute('data-box')) {
    return <Textarea key={key} id={`of-${fieldKey}`} aria-label={el.hasAttribute('data-required') ? 'Réponse obligatoire' : 'Réponse'} required={el.hasAttribute('data-required')}
      placeholder={el.hasAttribute('data-required') ? 'obligatoire' : undefined} value={answers[fieldKey] ?? ''} maxLength={2000}
      onChange={(e) => set(fieldKey, e.target.value)} rows={Math.max(2, Math.round(Number(el.getAttribute('data-h') ?? 70) / 24))}
      className="my-1 border-primary/40 bg-primary/5 text-gray-900" />
  }
  if (fieldKey && el.hasAttribute('data-checkbox')) {
    return <input key={key} type="checkbox" aria-label="Case à cocher" checked={answers[fieldKey] === '1'}
      onChange={(e) => set(fieldKey, e.target.checked ? '1' : '')} className="mx-1 inline-block h-5 w-5 align-middle accent-primary" />
  }
  if (el.hasAttribute('data-spacer')) return <div key={key} style={{ height: Number(el.getAttribute('data-h') ?? 20) }} />
  if (el.hasAttribute('data-split')) return <span key={key} className="inline-block w-6" />

  if (tag === 'br') return <br key={key} />
  if (tag === 'hr') return <hr key={key} className="my-2" />
  if (tag === 'img') {
    const src = el.getAttribute('src') ?? ''
    // Only the app's own content images (the template's header / logo).
    return src.startsWith('/api/v1/content/') ? <img key={key} src={src} alt="" className="mx-auto max-h-40" /> : null
  }
  const block = BLOCKS[tag]
  if (block) {
    const Tag = block as 'p'
    return <Tag key={key} className={BLOCK_CLASS[block]} style={align(el)}>{children()}</Tag>
  }
  if (tag === 'div') return <div key={key} style={align(el)}>{children()}</div>
  const inline = INLINE[tag]
  if (inline) {
    const Tag = inline as 'strong'
    return <Tag key={key}>{children()}</Tag>
  }
  return <span key={key}>{children()}</span>
}
