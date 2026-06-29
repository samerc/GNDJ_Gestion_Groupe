// Admin screen (super-admin): generic key-value Paramètres editor.
// Settings are grouped into category tabs (with a flat search mode) and rendered
// with type-aware widgets driven by SettingDto.valueType: boolean→Switch,
// number→stepper, date→date picker, json_array→tag editor, plus special-cased
// editors for exchange rates and for keys that have a fixed options list.
// Each SettingEditor saves its own row; settings with dedicated pages are hidden.
import { parseApiError } from '@/lib/error-utils'
import { useState, useEffect, useMemo } from 'react'
import { useSettings, useUpdateSetting, type SettingDto } from '@/services/settings-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { NATIONALITY_OPTIONS, PHONE_COUNTRY_CODES, COUNTRY_OPTIONS, PROFESSION_OPTIONS } from '@/lib/options'
import { Save, X, Settings2, Search, Plus, Trash2 } from 'lucide-react'
import { Tip } from '@/components/ui/tooltip'
import { toast } from 'sonner'

// Settings already edited on dedicated pages — hidden from the generic Paramètres page.
const HIDDEN_KEYS = new Set(['site.content', 'card.config'])
// Technical keys moved to an "Avancé" tab.
const ADVANCED_KEYS = new Set(['app.base_url', 'user_domain'])

// Keys whose value is constrained to a fixed option list (renders as SearchableSelect,
// single for scalars / multi-pick for json_array). Labels resolved from these too.
const SETTING_OPTIONS: Record<string, { value: string; label: string }[]> = {
  pinned_nationalities: NATIONALITY_OPTIONS,
  default_country_code: PHONE_COUNTRY_CODES,
  default_country: COUNTRY_OPTIONS,
  pinned_professions: PROFESSION_OPTIONS,
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
  contact: 'Contact',
  general: 'Général',
  reports: 'Rapports',
  site: 'Site public',
  advanced: 'Avancé',
}
const CATEGORY_ORDER = ['members', 'famille', 'documents', 'cotisations', 'passage', 'demande', 'contact', 'general', 'reports', 'site', 'advanced']

// Tab a setting belongs to: ADVANCED_KEYS are pulled out of their natural category into "Avancé".
function effectiveCategory(s: SettingDto) {
  return ADVANCED_KEYS.has(s.key) ? 'advanced' : s.category
}

// ---- Exchange-rate editor: edits a json object {currencyCode: rate} as add/remove rows ----
function ExchangeRateEditor({ value, onChange }: { value: string; onChange: (json: string) => void }) {
  const [rows, setRows] = useState<{ code: string; rate: string }[]>([])
  useEffect(() => {
    try {
      const obj = JSON.parse(value || '{}') as Record<string, number>
      setRows(Object.entries(obj).map(([code, rate]) => ({ code, rate: String(rate) })))
    } catch { setRows([]) }
  }, [value])

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

// Single-row editor: picks the widget from valueType (+ special cases) and self-saves on change.
// `value` holds scalar string values; `items` holds the parsed list for json_array settings.
function SettingEditor({ setting, onSave }: { setting: SettingDto; onSave: (key: string, value: string) => Promise<void> }) {
  const [value, setValue] = useState(setting.value)
  const [items, setItems] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false) // brief "Enregistré" badge after a save

  const isArray = setting.valueType === 'json_array'
  const isBool = setting.valueType === 'boolean'
  const isNumber = setting.valueType === 'number'
  const isDate = setting.valueType === 'date'
  const isExchangeRates = setting.key === 'cotisation.exchange_rates'
  const isLongText = setting.key === 'demande.terms' // multi-line free text → textarea
  const options = SETTING_OPTIONS[setting.key]

  useEffect(() => {
    setValue(setting.value)
    if (isArray) { try { setItems(JSON.parse(setting.value)) } catch { setItems([]) } }
  }, [setting.value, isArray])

  const persist = async (raw: string) => {
    setSaving(true)
    try {
      await onSave(setting.key, raw)
      toast.success('Paramètre enregistré')
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  const handleSave = () => persist(isArray ? JSON.stringify(items) : value)

  // Drives the conditional "Enregistrer" button; booleans persist immediately so they're never "changed".
  const hasChanged = isArray ? JSON.stringify(items) !== setting.value : value !== setting.value
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
          <Switch checked={value === 'true'} disabled={saving}
            onCheckedChange={(c) => { const v = c ? 'true' : 'false'; setValue(v); persist(v) }} />
        )}
      </div>

      {!isBool && (
        <>
          {isArray ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {items.map((item) => (
                  <Badge key={item} variant="secondary" className="gap-1 px-3 py-1.5 text-sm">
                    {options ? (options.find(o => o.value === item)?.label ?? item) : item}
                    <Tip content="Retirer"><button type="button" onClick={() => setItems(items.filter(i => i !== item))} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button></Tip>
                  </Badge>
                ))}
                {items.length === 0 && <span className="text-sm text-muted-foreground">Aucune valeur</span>}
              </div>
              {options ? (
                <div className="max-w-xs">
                  <SearchableSelect value="" onValueChange={(v) => { if (v && !items.includes(v)) setItems([...items, v]) }}
                    options={options.filter(o => !items.includes(o.value))}
                    placeholder="Ajouter..." searchPlaceholder="Rechercher..." emptyMessage="Toutes les valeurs sont déjà épinglées." />
                </div>
              ) : <ArrayFreeTextInput onAdd={(v) => { if (!items.includes(v)) setItems([...items, v]) }} />}
            </div>
          ) : isExchangeRates ? (
            <ExchangeRateEditor value={value} onChange={setValue} />
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
            <div className="flex items-center gap-2">
              <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} className="max-w-[12rem]" />
              {value && <button type="button" onClick={() => setValue('')} className="text-sm text-muted-foreground hover:text-destructive">Effacer</button>}
            </div>
          ) : isLongText ? (
            <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={5}
              className="flex min-h-[7rem] w-full max-w-2xl rounded-md border border-input bg-background px-3 py-2 text-sm" />
          ) : (
            <Input value={value} onChange={(e) => setValue(e.target.value)} className="max-w-sm" />
          )}

          {hasChanged && (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="mr-1 h-3 w-3" />{saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const updateMutation = useUpdateSetting()
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  const handleSave = async (key: string, value: string) => {
    setError('')
    try { await updateMutation.mutateAsync({ key, value }) }
    catch (err) { setError(parseApiError(err)); throw err }
  }

  const visible = useMemo(() => (settings ?? []).filter(s => !HIDDEN_KEYS.has(s.key)), [settings])

  // visible settings bucketed by effective category for the tab layout.
  const grouped = useMemo(() => {
    const g: Record<string, SettingDto[]> = {}
    for (const s of visible) { const c = effectiveCategory(s); (g[c] ??= []).push(s) }
    return g
  }, [visible])

  const categories = CATEGORY_ORDER.filter(c => grouped[c]?.length)
  const [tab, setTab] = useState<string>('')
  useEffect(() => { if (categories.length && !tab) setTab(categories[0]) }, [categories, tab]) // default to first non-empty tab

  if (isLoading) return <LoadingSpinner variant="form" />

  // Non-empty search query switches to a flat results list (across all categories) instead of tabs.
  const q = query.trim().toLowerCase()
  const searchResults = q
    ? visible.filter(s => s.label.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q) || s.key.toLowerCase().includes(q))
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Settings2 className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Paramètres</h1>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher un paramètre..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9 pr-8" />
          {query && <Tip content="Effacer la recherche"><button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setQuery('')}><X className="h-3.5 w-3.5" /></button></Tip>}
        </div>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {q ? (
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          {searchResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun paramètre ne correspond à « {query} ».</p>
          ) : (
            <div className="divide-y">
              {searchResults.map(s => <SettingEditor key={s.key} setting={s} onSave={handleSave} />)}
            </div>
          )}
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap">
            {categories.map(c => <TabsTrigger key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</TabsTrigger>)}
          </TabsList>
          {categories.map(c => (
            <TabsContent key={c} value={c}>
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <div className="divide-y">
                  {grouped[c].map(s => <SettingEditor key={s.key} setting={s} onSave={handleSave} />)}
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}
