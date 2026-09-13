// Admin screen (super-admin): generic key-value Paramètres editor.
// Settings are grouped into category tabs (with a flat search mode) and rendered
// with type-aware widgets driven by SettingDto.valueType: boolean→Switch,
// number→stepper, date→date picker, json_array→tag editor, plus special-cased
// editors for exchange rates and for keys that have a fixed options list.
// Each SettingEditor saves its own row; settings with dedicated pages are hidden.
import { parseApiError } from '@/lib/error-utils'
import { Link, useSearchParams } from 'react-router'
import { useState, useMemo, lazy, Suspense } from 'react'
import { useSettings, useUpdateSetting, type SettingDto } from '@/services/settings-service'
import { useAssociations } from '@/services/association-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { NATIONALITY_OPTIONS, PHONE_COUNTRY_CODES, COUNTRY_OPTIONS } from '@/lib/options'
import { Save, X, Settings2, Search, Plus, Trash2 } from 'lucide-react'
import { Tip } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { ManagedListEditor } from '@/components/shared/managed-list-editor'
import { LoginMessagesEditor } from '@/components/admin/login-messages-editor'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'

// Config screens that live as TABS inside Paramètres rather than separate pages/routes (Option 1 hub).
// Lazy-loaded so their code stays out of the main settings chunk until the tab is opened.
const AssociationsPage = lazy(() => import('@/pages/admin/associations'))
const CustomFieldsPage = lazy(() => import('@/pages/admin/custom-fields'))
const CardDesignerPage = lazy(() => import('@/pages/admin/card-designer'))
const ManagedListsPage = lazy(() => import('@/pages/admin/managed-lists'))
const AppearancePage = lazy(() => import('@/pages/admin/appearance'))
const SiteTextsPage = lazy(() => import('@/pages/admin/site-texts'))
const ApiKeysPage = lazy(() => import('@/pages/admin/api-keys'))
// Email split into two focused tabs: SMTP servers (config, set once) and email templates (content, edited
// often). Separate modules so opening "Serveurs SMTP" doesn't pull in the heavy rich-text editor.
const EmailSmtpPage = lazy(() => import('@/pages/admin/email-smtp'))
const EmailTemplatesPage = lazy(() => import('@/pages/admin/email-templates'))
// Types de documents — embedded INSIDE the Documents category tab (not a standalone tab).
const DocumentTypesPage = lazy(() => import('@/pages/admin/document-types'))
// Rejection motifs (demande refusal reasons) — embedded inside the Inscriptions tab (CG-editable).
const RejectionReasonsEditor = lazy(() => import('@/pages/admin/rejection-reasons'))

// Extra tabs (rendered after the key-value setting categories). Each renders a full config page component;
// the `cfg:` prefix keeps their tab `value` from colliding with a real setting category. Each tab is gated by
// its own permission so a CG sees only what they can reach (e.g. Listes) while super-admin tools stay hidden.
// Each Component may accept an optional `embedded` prop (rendered `<Component embedded />`): a page that
// reads it (e.g. Email / SMTP) hides its standalone header when shown as a tab; the others simply ignore it.
const CONFIG_TABS: { key: string; label: string; Component: React.ComponentType<{ embedded?: boolean }>; permission: string }[] = [
  { key: 'cfg:lists', label: 'Listes', Component: ManagedListsPage, permission: PERMISSIONS.MAITRISE_MANAGE },
  { key: 'cfg:associations', label: 'Associations', Component: AssociationsPage, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
  { key: 'cfg:custom-fields', label: 'Champs personnalisés', Component: CustomFieldsPage, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
  { key: 'cfg:card', label: 'Carte membre', Component: CardDesignerPage, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
  { key: 'cfg:smtp', label: 'Serveurs SMTP', Component: EmailSmtpPage, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
  { key: 'cfg:email-templates', label: "Modèles d'email", Component: EmailTemplatesPage, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
  { key: 'cfg:appearance', label: 'Apparence', Component: AppearancePage, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
  { key: 'cfg:site-texts', label: 'Accueil & pied de page', Component: SiteTextsPage, permission: PERMISSIONS.CONTENT_MANAGE },
  { key: 'cfg:api-keys', label: 'Clés API', Component: ApiKeysPage, permission: PERMISSIONS.ASSOCIATIONS_MANAGE },
]

// Settings already edited on dedicated pages — hidden from the generic Paramètres page.
// The documents.* campaign dates/toggle live on "Suivi des documents → Campagne" (which validates their
// order); their internal idempotency markers are never user-editable. Hidden here so there is ONE place
// to set them (the generic editor would let you save the dates out of order and break the campaign phases).
const HIDDEN_KEYS = new Set(['site.content', 'card_config', 'member.cities', 'member.schools', 'member.classes', 'member.profession_domains', 'demande.rejection_reasons', 'ui.role_colors', 'pinned_professions',
  'documents.campaign_enabled', 'documents.scout_year', 'documents.deposit_start', 'documents.deposit_deadline', 'documents.correction_start', 'documents.correction_deadline', 'documents.final_deadline',
  'documents.errors_sent_for', 'documents.errors_alert_for', 'documents.hold_applied_for', 'documents.hold_alert_for'])
// Technical keys moved to an "Avancé" tab.
const ADVANCED_KEYS = new Set(['app.base_url', 'user_domain'])

// Keys whose value is constrained to a fixed option list (renders as SearchableSelect,
// single for scalars / multi-pick for json_array). Labels resolved from these too.
const SETTING_OPTIONS: Record<string, { value: string; label: string }[]> = {
  pinned_nationalities: NATIONALITY_OPTIONS,
  default_country_code: PHONE_COUNTRY_CODES,
  default_country: COUNTRY_OPTIONS,
}

// Optional unit suffix for number settings.
const UNITS: Record<string, string> = {
  'documents.max_file_size_mb': 'Mo',
  'demande.notes_max_length': 'caractères',
}

const CATEGORY_LABELS: Record<string, string> = {
  members: 'Membres',
  famille: 'Famille',
  documents: 'Documents',
  cotisations: 'Cotisations',
  passage: 'Passage',
  demande: 'Inscriptions',
  login: 'Connexion',
  general: 'Général',
  site: 'Site public',
  email: 'Email & contact',
  security: 'Sécurité',
  maintenance: 'Maintenance',
  advanced: 'Avancé',
}
// 'reports' is intentionally omitted: its only visible setting (reports.cards_enabled) is rendered inside the
// Carte membre tab instead, so there is no standalone "Rapports" tab.
const CATEGORY_ORDER = ['members', 'famille', 'documents', 'cotisations', 'passage', 'demande', 'login', 'email', 'security', 'general', 'site', 'maintenance', 'advanced']

// Keys pinned to the top of their category tab (rest keep their natural order). The two inscription
// period switches (portal open + submission window) lead the "Inscriptions" tab so the CG sees them first.
const PINNED_TOP: Record<string, number> = { 'demande.enabled': 0, 'demande.submissions_open': 1 }

// Tab a setting belongs to: ADVANCED_KEYS are pulled out of their natural category into "Avancé";
// the lone "Contact" setting (contact form recipient) is folded into the "Email & contact" tab.
function effectiveCategory(s: SettingDto) {
  if (ADVANCED_KEYS.has(s.key)) return 'advanced'
  if (s.category === 'contact') return 'email'
  return s.category
}

// ---- Exchange-rate editor: edits a json object {currencyCode: rate} as add/remove rows ----
function ExchangeRateEditor({ value, onChange }: { value: string; onChange: (json: string) => void }) {
  const parseRows = (v: string): { code: string; rate: string }[] => {
    try { return Object.entries(JSON.parse(v || '{}') as Record<string, number>).map(([code, rate]) => ({ code, rate: String(rate) })) }
    catch { return [] }
  }
  const [rows, setRows] = useState(() => parseRows(value))
  // Re-sync when the parent value changes externally (render-phase reset; lazy init covers mount).
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) { setPrevValue(value); setRows(parseRows(value)) }

  // Update local rows + re-serialize to the parent: skip blank codes / non-numeric rates, uppercase codes.
  const commit = (next: { code: string; rate: string }[]) => {
    setRows(next)
    const obj: Record<string, number> = {}
    for (const r of next) {
      const c = r.code.trim().toUpperCase()
      const n = Number(r.rate)
      if (c && !Number.isNaN(n)) obj[c] = n
    }
    onChange(JSON.stringify(obj))
  }

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input className="w-24" placeholder="LBP" value={r.code} onChange={(e) => commit(rows.map((x, j) => j === i ? { ...x, code: e.target.value } : x))} />
          <span className="text-sm text-muted-foreground">=</span>
          <Input className="w-40" type="number" step="any" placeholder="Taux" value={r.rate} onChange={(e) => commit(rows.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} />
          <Tip content="Supprimer la devise"><Button type="button" variant="ghost" size="icon" onClick={() => commit(rows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button></Tip>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => commit([...rows, { code: '', rate: '' }])}><Plus className="mr-1 h-3.5 w-3.5" />Ajouter une devise</Button>
      <p className="text-xs text-muted-foreground">Taux par rapport à la devise par défaut (ex. 1 USD = 89500 LBP).</p>
    </div>
  )
}

// Per-association dues editor (cotisation.association_amounts). Lists every association with an amount input;
// stores { "<associationId>": amount } (keyed by id so a rename doesn't break it). Blank = not set (dropped).
// Internal figure — used to compute what the group owes each association per member; never shown to members.
function AssociationAmountsEditor({ value, onChange }: { value: string; onChange: (json: string) => void }) {
  const { data } = useAssociations({ pageSize: 100 })
  const associations = data?.items ?? []
  const parse = (v: string): Record<string, string> => {
    try { return Object.fromEntries(Object.entries(JSON.parse(v || '{}') as Record<string, number | string>).map(([k, val]) => [k, String(val)])) }
    catch { return {} }
  }
  const [amounts, setAmounts] = useState<Record<string, string>>(() => parse(value))
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) { setPrevValue(value); setAmounts(parse(value)) }

  const commit = (next: Record<string, string>) => {
    setAmounts(next)
    const obj: Record<string, number> = {}
    for (const [k, v] of Object.entries(next)) { const n = Number(v); if (v.trim() !== '' && !Number.isNaN(n)) obj[k] = n }
    onChange(JSON.stringify(obj))
  }

  if (associations.length === 0)
    return <p className="text-sm text-muted-foreground">Aucune association. Créez-en d'abord dans Paramètres → Associations.</p>

  return (
    <div className="space-y-2">
      {associations.map(a => (
        <div key={a.id} className="flex items-center gap-2">
          <span className="w-48 shrink-0 truncate text-sm" title={a.name}>{a.name}</span>
          <Input className="w-40" type="number" step="any" placeholder="Montant"
            value={amounts[a.id] ?? ''} onChange={(e) => commit({ ...amounts, [a.id]: e.target.value })} />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Montant dû à chaque association par membre (dans la devise par défaut). Interne — non visible par les membres.</p>
    </div>
  )
}

// Add-a-value input for json_array settings without a fixed options list (Enter or button adds).
function ArrayFreeTextInput({ onAdd }: { onAdd: (val: string) => void }) {
  const [text, setText] = useState('')
  const handleAdd = () => { if (!text.trim()) return; onAdd(text.trim()); setText('') }
  return (
    <div className="flex gap-2">
      <Input value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
        placeholder="Ajouter une valeur..." className="max-w-xs" />
      <Button type="button" variant="outline" size="sm" onClick={handleAdd} disabled={!text.trim()}>Ajouter</Button>
    </div>
  )
}

// Table editor for json_array settings: one row per value with a per-row delete, a filter box for
// long lists (schools/cities/profession domains), and an add-row at the bottom. Replaces the old
// pill cloud, which was unusable once a list grew past a handful of values. Local state lives in the
// parent SettingEditor (via items/onChange) so the existing "Enregistrer" save flow is unchanged.
function ArrayTableEditor({ items, options, onChange }: {
  items: string[]
  options?: { value: string; label: string }[]
  onChange: (next: string[]) => void
}) {
  const [filter, setFilter] = useState('')
  const label = (item: string) => options ? (options.find(o => o.value === item)?.label ?? item) : item
  const f = filter.trim().toLowerCase()
  const shown = f ? items.filter(i => label(i).toLowerCase().includes(f)) : items
  const remove = (item: string) => onChange(items.filter(i => i !== item))
  const add = (val: string) => { if (val && !items.includes(val)) onChange([...items, val]) }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{items.length} valeur{items.length > 1 ? 's' : ''}</span>
        {items.length > 8 && (
          <div className="relative w-full max-w-[16rem]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Filtrer la liste..." value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-9 pr-8" />
            {filter && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setFilter('')}><X className="h-3.5 w-3.5" /></button>}
          </div>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {shown.map((item) => (
              <tr key={item} className="group hover:bg-muted/40">
                <td className="px-3 py-2">{label(item)}</td>
                <td className="w-12 px-2 py-1 text-right">
                  <Tip content="Retirer"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(item)}><Trash2 className="h-4 w-4 text-destructive" /></Button></Tip>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td className="px-3 py-6 text-center text-muted-foreground">{f ? 'Aucun résultat' : 'Aucune valeur'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {options ? (
        <div className="max-w-xs">
          <SearchableSelect value="" onValueChange={add}
            options={options.filter(o => !items.includes(o.value))}
            placeholder="Ajouter..." searchPlaceholder="Rechercher..." emptyMessage="Toutes les valeurs sont déjà ajoutées." />
        </div>
      ) : <ArrayFreeTextInput onAdd={add} />}
    </div>
  )
}

// The "Connexion" category split into two tabs — one login-message editor per audience (Membres vs Inscription),
// instead of stacking both. Each tab renders that audience's SettingEditor (label/description + the message editor).
function LoginSettingsTabs({ settings, onSave }: { settings: SettingDto[]; onSave: (key: string, value: string) => Promise<void> }) {
  const member = settings.find(s => s.key === 'login.member_messages')
  const applicant = settings.find(s => s.key === 'login.applicant_messages')
  const [tab, setTab] = useState<'member' | 'applicant'>('member')
  const active = tab === 'member' ? member : applicant
  const tabBtn = (v: 'member' | 'applicant', label: string) => (
    <button type="button" onClick={() => setTab(v)}
      className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
        tab === v ? 'bg-background text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground')}>
      {label}
    </button>
  )
  return (
    <div>
      <div className="mb-5 inline-flex rounded-lg border border-border bg-muted/40 p-1">
        {tabBtn('member', 'Membres')}
        {tabBtn('applicant', 'Inscription')}
      </div>
      {active && <SettingEditor setting={active} onSave={onSave} />}
    </div>
  )
}

// Single-row editor: picks the widget from valueType (+ special cases) and self-saves on change.
// `value` holds scalar string values; `items` holds the parsed list for json_array settings.
function SettingEditor({ setting, onSave, disabled = false, disabledHint }: { setting: SettingDto; onSave: (key: string, value: string) => Promise<void>; disabled?: boolean; disabledHint?: string }) {
  const parseItems = (v: string): string[] => { try { return JSON.parse(v) as string[] } catch { return [] } }
  const [value, setValue] = useState(setting.value)
  const [items, setItems] = useState<string[]>(() => setting.valueType === 'json_array' ? parseItems(setting.value) : [])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false) // brief "Enregistré" badge after a save

  const isArray = setting.valueType === 'json_array'
  const isBool = setting.valueType === 'boolean'
  const isNumber = setting.valueType === 'number'
  const isDate = setting.valueType === 'date'
  const isExchangeRates = setting.key === 'cotisation.exchange_rates'
  const isAssociationAmounts = setting.key === 'cotisation.association_amounts'
  // Long free-text settings → a roomy textarea instead of a cramped one-line input. Match the message/text
  // keys (intro/result messages, terms, maintenance message…); a length fallback catches any future long value.
  const isLongText = /(text|terms|message|tagline)/i.test(setting.key) || (setting.value?.length ?? 0) > 80
  // Scheduled login-page banners (a json array of {text,start,end}) use their own multi-message editor.
  const isLoginMessages = setting.key === 'login.member_messages' || setting.key === 'login.applicant_messages'
  const options = SETTING_OPTIONS[setting.key]

  // Most date settings (submission window, document dates…) are forward-looking scheduling — a date in the
  // past is a mistake (e.g. a past deadline would immediately close inscriptions). Guard: the picker's min is
  // today, a past value is flagged + blocks Save. EXCEPTIONS: member start date + passage date can legitimately
  // be backdated (e.g. to the scout-year start, Oct 1, when processing after that date), so past is allowed there.
  // Login-message start/end dates can legitimately be backdated: a past start = "already showing", a past end =
  // "expire it now". So past dates are allowed on those too.
  const allowsPastDate = setting.key === 'demande.member_start_date' || setting.key === 'passage.date'
    || setting.key.startsWith('login.') && (setting.key.endsWith('_start') || setting.key.endsWith('_end'))
  const todayStr = (() => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` })()
  // Only flag a past date the user is actively CHANGING (value !== the saved value). An already-saved date that
  // has since fallen into the past (e.g. a submission deadline set weeks ago) must NOT show an error on load —
  // it's a legitimate stored value, not a new mistake. The guard still blocks picking a NEW past date.
  const dateInPast = isDate && !allowsPastDate && !!value && value < todayStr && value !== setting.value

  // Re-sync when the persisted value changes externally (render-phase reset; lazy init covers mount).
  const [prevValue, setPrevValue] = useState(setting.value)
  if (setting.value !== prevValue) {
    setPrevValue(setting.value)
    setValue(setting.value)
    if (isArray) setItems(parseItems(setting.value))
  }

  const persist = async (raw: string) => {
    setSaving(true)
    try {
      await onSave(setting.key, raw)
      toast.success('Paramètre enregistré')
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  const handleSave = () => persist(isArray ? JSON.stringify(items) : value)

  // Free-text json_array lists use ManagedListEditor, which self-persists — never show the staged Save button.
  const isFreeArray = isArray && !options
  // Drives the conditional "Enregistrer" button; booleans persist immediately so they're never "changed".
  // isLoginMessages self-persists (own Save), so it never shows the outer staged button.
  const hasChanged = !isFreeArray && !isLoginMessages && (isArray ? JSON.stringify(items) !== setting.value : value !== setting.value)
  const isSelectSingle = !isArray && !isBool && options

  return (
    <div className="space-y-3 py-5 first:pt-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{setting.label}</h3>
            {saved && <Badge variant="default" className="text-xs">Enregistré</Badge>}
          </div>
          {setting.description && <p className="mt-0.5 text-sm text-muted-foreground">{setting.description}</p>}
        </div>
        {isBool && (
          // When disabled (e.g. submissions while the portal is closed), show it OFF — it's effectively closed.
          <Switch checked={value === 'true' && !disabled} disabled={saving || disabled}
            onCheckedChange={(c) => { const v = c ? 'true' : 'false'; setValue(v); persist(v) }} />
        )}
      </div>
      {isBool && disabled && disabledHint && (
        <p className="text-xs text-amber-600">{disabledHint}</p>
      )}

      {!isBool && (
        <>
          {isLoginMessages ? (
            <LoginMessagesEditor settingKey={setting.key} />
          ) : isArray ? (
            options
              ? <ArrayTableEditor items={items} options={options} onChange={setItems} />
              : <ManagedListEditor settingKey={setting.key} />
          ) : isExchangeRates ? (
            <ExchangeRateEditor value={value} onChange={setValue} />
          ) : isAssociationAmounts ? (
            <AssociationAmountsEditor value={value} onChange={setValue} />
          ) : isSelectSingle ? (
            <div className="max-w-sm">
              <SearchableSelect value={value} onValueChange={setValue} options={options} placeholder="Sélectionner..." searchPlaceholder="Rechercher..." />
            </div>
          ) : isNumber ? (
            <div className="flex items-center gap-2">
              <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="max-w-[12rem]" />
              {UNITS[setting.key] && <span className="text-sm text-muted-foreground">{UNITS[setting.key]}</span>}
            </div>
          ) : isDate ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Input type="date" min={allowsPastDate ? undefined : todayStr} value={value} onChange={(e) => setValue(e.target.value)} className="max-w-[12rem]" />
                {value && <button type="button" onClick={() => setValue('')} className="text-sm text-muted-foreground hover:text-destructive">Effacer</button>}
              </div>
              {dateInPast && <p className="text-xs text-destructive">La date ne peut pas être dans le passé.</p>}
            </div>
          ) : isLongText ? (
            <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={5}
              className="flex min-h-[7rem] w-full max-w-2xl rounded-md border border-input bg-background px-3 py-2 text-sm shadow-2xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          ) : (
            <Input value={value} onChange={(e) => setValue(e.target.value)} className="max-w-sm" />
          )}

          {hasChanged && (
            <Button size="sm" onClick={handleSave} disabled={saving || dateInPast}>
              <Save className="mr-1 h-3 w-3" />{saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

// Left-nav group: a titled list of section buttons for the settings vertical nav (Réglages / Configuration).
function SettingsNavGroup({ title, items, active, onSelect }: {
  title: string
  items: { value: string; label: string }[]
  active: string
  onSelect: (value: string) => void
}) {
  return (
    <div>
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="space-y-0.5">
        {items.map(i => (
          <button key={i.value} type="button" onClick={() => onSelect(i.value)}
            className={cn('flex w-full items-center rounded-md px-3 py-1.5 text-left text-sm transition-colors',
              active === i.value ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground/80 hover:bg-muted')}>
            {i.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const updateMutation = useUpdateSetting()
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  // Each config tab is gated by its own permission: a Chef de Groupe reaching Paramètres sees the CG-relevant
  // ones (Listes) plus the operational setting categories the backend returns for them; super-admin sees all.
  const user = useAuthStore((s) => s.user)
  const can = (perm: string) => !!user?.isSuperAdmin || !!user?.permissions.includes(perm)
  const configTabs = CONFIG_TABS.filter(t => can(t.permission))
  // The lone "Rapports" setting (enable member cards) now rides along in the Carte membre tab.
  const cardsEnabled = (settings ?? []).find(s => s.key === 'reports.cards_enabled')
  // Config apps that stay their own pages (not settings) — a small launchpad at the top of Paramètres.
  const configLinks = [
    { to: '/admin/report-templates', label: 'Modèles de rapports', perm: PERMISSIONS.MEMBERS_EDIT },
    { to: '/admin/roles-access', label: 'Profils & accès', perm: PERMISSIONS.MAITRISE_MANAGE },
  ].filter(l => can(l.perm))

  const handleSave = async (key: string, value: string) => {
    setError('')
    try { await updateMutation.mutateAsync({ key, value }) }
    catch (err) { setError(parseApiError(err)); throw err }
  }

  // Hide dedicated-page keys + the companion "<key>.archived" lists (surfaced inside their parent editor).
  const visible = useMemo(() => (settings ?? []).filter(s => !HIDDEN_KEYS.has(s.key) && !s.key.endsWith('.archived')), [settings])

  // visible settings bucketed by effective category for the tab layout; pinned keys sorted to the top.
  const grouped = useMemo(() => {
    const g: Record<string, SettingDto[]> = {}
    for (const s of visible) { const c = effectiveCategory(s); (g[c] ??= []).push(s) }
    for (const c in g) g[c].sort((a, b) => (PINNED_TOP[a.key] ?? 100) - (PINNED_TOP[b.key] ?? 100))
    return g
  }, [visible])

  // The submission window only makes sense while the portal is open, so its switch is disabled (and shown
  // off) when demande.enabled is false — you can't open submissions on a closed portal.
  const demandeEnabled = (settings ?? []).find(s => s.key === 'demande.enabled')?.value === 'true'
  const extraProps = (s: SettingDto): { disabled?: boolean; disabledHint?: string } =>
    s.key === 'demande.submissions_open' && !demandeEnabled
      ? { disabled: true, disabledHint: "Ouvrez d'abord les inscriptions pour gérer la période de soumission." }
      : {}

  const categories = CATEGORY_ORDER.filter(c => grouped[c]?.length)
  const [tab, setTab] = useState<string>('')
  // Default to the first available section (a settings category, else the first config tab). A `?tab=` query
  // param (e.g. from the rentrée "goto-email" action or the communications "Modifier le modèle" link) deep-links
  // to a specific section, if it's a valid + accessible one. Render-phase init, guarded by !tab.
  const [searchParams] = useSearchParams()
  const firstSection = categories[0] ?? configTabs[0]?.key
  if (!tab && firstSection) {
    const requested = searchParams.get('tab')
    const valid = requested && (categories.includes(requested) || configTabs.some(t => t.key === requested))
    setTab(valid ? requested : firstSection)
  }

  if (isLoading) return <LoadingSpinner variant="form" />

  // Non-empty search query switches to a flat results list (across all categories) instead of the section nav.
  const q = query.trim().toLowerCase()
  const searchResults = q
    ? visible.filter(s => s.label.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q) || s.key.toLowerCase().includes(q))
    : []

  // Which section (left-nav item) is active: a settings category, or one of the config-page tabs.
  const activeCategory = !q && categories.includes(tab) ? tab : null
  const activeConfig = q ? undefined : configTabs.find(t => t.key === tab)
  const ActiveConfigComponent = activeConfig?.Component

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Settings2 className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Paramètres</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Rechercher un paramètre..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9 pr-8" />
            {query && <Tip content="Effacer la recherche"><button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setQuery('')}><X className="h-3.5 w-3.5" /></button></Tip>}
          </div>
        </div>
      </div>

      {/* Launchpad to the config apps that remain their own pages (Email/SMTP, report templates, access). */}
      {configLinks.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Autres pages de configuration</p>
          <div className="flex flex-wrap gap-2">
            {configLinks.map(l => (
              <Button key={l.to} asChild variant="outline" size="sm"><Link to={l.to}>{l.label}</Link></Button>
            ))}
          </div>
        </div>
      )}

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {q ? (
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          {searchResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun paramètre ne correspond à « {query} ».</p>
          ) : (
            <div className="divide-y">
              {searchResults.map(s => <SettingEditor key={s.key} setting={s} onSave={handleSave} {...extraProps(s)} />)}
            </div>
          )}
        </div>
      ) : (
        // Left grouped vertical nav (Réglages / Configuration) + content pane — scales past a wrapping tab row.
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
          {/* Mobile: a single dropdown to pick the section (the vertical nav is hidden below lg). */}
          <div className="lg:hidden">
            <select value={tab} onChange={(e) => setTab(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <optgroup label="Réglages">
                {categories.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
              </optgroup>
              {configTabs.length > 0 && (
                <optgroup label="Configuration">
                  {configTabs.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </optgroup>
              )}
            </select>
          </div>

          {/* Desktop: grouped vertical nav. */}
          <nav className="hidden w-56 shrink-0 lg:block">
            <div className="sticky top-20 space-y-5">
              <SettingsNavGroup title="Réglages" items={categories.map(c => ({ value: c, label: CATEGORY_LABELS[c] ?? c }))} active={tab} onSelect={setTab} />
              {configTabs.length > 0 && (
                <SettingsNavGroup title="Configuration" items={configTabs.map(t => ({ value: t.key, label: t.label }))} active={tab} onSelect={setTab} />
              )}
            </div>
          </nav>

          {/* Content of the active section. */}
          <div className="min-w-0 flex-1">
            {activeCategory && (
              <>
                <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                  {activeCategory === 'login' ? (
                    // Login-message settings split into two tabs (Membres / Inscription) — one editor per audience.
                    <LoginSettingsTabs settings={grouped.login} onSave={handleSave} />
                  ) : (
                    <div className="divide-y">
                      {grouped[activeCategory].map(s => <SettingEditor key={s.key} setting={s} onSave={handleSave} {...extraProps(s)} />)}
                    </div>
                  )}
                </div>
                {/* Inscriptions section also hosts the demande rejection-motifs editor (own CRUD, CG-accessible). */}
                {activeCategory === 'demande' && (
                  <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-card">
                    <Suspense fallback={<LoadingSpinner variant="table" />}>
                      <RejectionReasonsEditor embedded />
                    </Suspense>
                  </div>
                )}
                {/* Documents section also hosts the "Types de documents" manager (super-admin), below the settings. */}
                {activeCategory === 'documents' && can(PERMISSIONS.DOCUMENT_TYPES_VIEW) && (
                  <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-card">
                    <h2 className="mb-4 text-lg font-semibold">Types de documents</h2>
                    <Suspense fallback={<LoadingSpinner variant="table" />}>
                      <DocumentTypesPage embedded />
                    </Suspense>
                  </div>
                )}
              </>
            )}
            {activeConfig && ActiveConfigComponent && (
              <Suspense fallback={<LoadingSpinner variant="table" />}>
                {/* The Carte membre section also carries the "enable member cards" toggle (ex-"Rapports" setting). */}
                {activeConfig.key === 'cfg:card' && cardsEnabled && (
                  <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-card">
                    <SettingEditor setting={cardsEnabled} onSave={handleSave} />
                  </div>
                )}
                <ActiveConfigComponent embedded />
              </Suspense>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
