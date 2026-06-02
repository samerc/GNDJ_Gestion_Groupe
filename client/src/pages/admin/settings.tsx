import { parseApiError } from '@/lib/error-utils'
import { useState, useEffect } from 'react'
import { useSettings, useUpdateSetting, type SettingDto } from '@/services/settings-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { NATIONALITY_OPTIONS, PHONE_COUNTRY_CODES, COUNTRY_OPTIONS, PROFESSION_OPTIONS } from '@/lib/options'
import { Save, X, Settings2 } from 'lucide-react'

// Map setting keys to their available options for searchable dropdowns
const SETTING_OPTIONS: Record<string, { value: string; label: string }[]> = {
  pinned_nationalities: NATIONALITY_OPTIONS,
  default_country_code: PHONE_COUNTRY_CODES,
  default_country: COUNTRY_OPTIONS,
  pinned_professions: PROFESSION_OPTIONS,
}

interface SettingEditorProps {
  setting: SettingDto
  onSave: (key: string, value: string) => Promise<void>
}

function SettingEditor({ setting, onSave }: SettingEditorProps) {
  const [value, setValue] = useState(setting.value)
  const [items, setItems] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const isArray = setting.valueType === 'json_array'
  const options = SETTING_OPTIONS[setting.key]

  useEffect(() => {
    setValue(setting.value)
    if (isArray) {
      try { setItems(JSON.parse(setting.value)) } catch { setItems([]) }
    }
  }, [setting.value, isArray])

  const handleSave = async () => {
    setSaving(true)
    try {
      const saveValue = isArray ? JSON.stringify(items) : value
      await onSave(setting.key, saveValue)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const addItem = (val: string) => {
    if (!val || items.includes(val)) return
    setItems([...items, val])
  }

  const removeItem = (item: string) => {
    setItems(items.filter(i => i !== item))
  }

  const hasChanged = isArray
    ? JSON.stringify(items) !== setting.value
    : value !== setting.value

  // For non-array settings with options, use a select
  const isSelectSingle = !isArray && options

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{setting.label}</h3>
          {saved && <Badge variant="default" className="text-xs">Enregistré</Badge>}
        </div>
        {setting.description && <p className="text-sm text-muted-foreground">{setting.description}</p>}
      </div>

      {isArray ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {items.map((item) => (
              <Badge key={item} variant="secondary" className="gap-1 px-3 py-1.5 text-sm">
                {options ? (options.find(o => o.value === item)?.label ?? item) : item}
                <button type="button" onClick={() => removeItem(item)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {items.length === 0 && <span className="text-sm text-muted-foreground">Aucune valeur</span>}
          </div>
          {options ? (
            <div className="max-w-xs">
              <SearchableSelect
                value=""
                onValueChange={(v) => addItem(v)}
                options={options.filter(o => !items.includes(o.value))}
                placeholder="Ajouter..."
                searchPlaceholder="Rechercher..."
                emptyMessage="Toutes les valeurs sont déjà épinglées."
              />
            </div>
          ) : (
            <ArrayFreeTextInput onAdd={addItem} />
          )}
        </div>
      ) : isSelectSingle ? (
        <div className="max-w-sm">
          <SearchableSelect
            value={value}
            onValueChange={(v) => setValue(v)}
            options={options}
            placeholder="Sélectionner..."
            searchPlaceholder="Rechercher..."
          />
        </div>
      ) : (
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="max-w-sm"
        />
      )}

      {hasChanged && (
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="mr-1 h-3 w-3" />
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      )}
    </div>
  )
}

function ArrayFreeTextInput({ onAdd }: { onAdd: (val: string) => void }) {
  const [text, setText] = useState('')
  const handleAdd = () => {
    if (!text.trim()) return
    onAdd(text.trim())
    setText('')
  }
  return (
    <div className="flex gap-2">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
        placeholder="Ajouter une valeur..."
        className="max-w-xs"
      />
      <Button type="button" variant="outline" size="sm" onClick={handleAdd} disabled={!text.trim()}>
        Ajouter
      </Button>
    </div>
  )
}

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const updateMutation = useUpdateSetting()
  const [error, setError] = useState('')

  const handleSave = async (key: string, value: string) => {
    setError('')
    try {
      await updateMutation.mutateAsync({ key, value })
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  if (isLoading) return <LoadingSpinner />

  const grouped = (settings ?? []).reduce<Record<string, SettingDto[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {})

  const categoryLabels: Record<string, string> = {
    members: 'Membres',
    famille: 'Famille',
    general: 'Général',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings2 className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Paramètres</h1>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {Object.entries(grouped).map(([category, items]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle>{categoryLabels[category] ?? category}</CardTitle>
            <CardDescription>Configuration pour la section {categoryLabels[category]?.toLowerCase() ?? category}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 divide-y">
            {items.map((setting, i) => (
              <div key={setting.key} className={i > 0 ? 'pt-6' : ''}>
                <SettingEditor setting={setting} onSave={handleSave} />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
