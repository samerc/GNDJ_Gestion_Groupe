import { useState, useEffect } from 'react'
import { useSetting, useUpdateSetting } from '@/services/settings-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RequiredLabel } from '@/components/shared/required-label'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Save, CreditCard, User, Hash, Building2, Users, Shield, Calendar, Droplet, Phone, ListPlus } from 'lucide-react'
import { toast } from 'sonner'
import { parseApiError } from '@/lib/error-utils'

const CARD_FIELDS = [
  { key: 'photo', label: 'Photo', icon: User },
  { key: 'name', label: 'Nom complet', icon: User, alwaysOn: true },
  { key: 'cardNumber', label: 'Numéro de carte', icon: Hash },
  { key: 'unit', label: 'Unité', icon: Building2 },
  { key: 'team', label: 'Équipe', icon: Users },
  { key: 'role', label: 'Fonction', icon: Shield },
  { key: 'dateOfBirth', label: 'Date de naissance', icon: Calendar },
  { key: 'bloodType', label: 'Groupe sanguin', icon: Droplet },
  { key: 'emergencyContact', label: "Contact d'urgence", icon: Phone },
  { key: 'customFields', label: 'Champs personnalisés', icon: ListPlus },
] as const

type FieldKey = (typeof CARD_FIELDS)[number]['key']

interface CardConfig {
  orgName: string
  fields: Record<string, boolean>
}

const DEFAULT_CONFIG: CardConfig = {
  orgName: 'Groupe National Des Jeunes',
  fields: Object.fromEntries(CARD_FIELDS.map(f => [f.key, true])),
}

export default function CardDesignerPage() {
  const { data: setting, isLoading } = useSetting('card.config')
  const updateSetting = useUpdateSetting()
  const [config, setConfig] = useState<CardConfig>(DEFAULT_CONFIG)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (setting?.value && !loaded) {
      try {
        const parsed = JSON.parse(setting.value) as CardConfig
        setConfig({
          orgName: parsed.orgName || DEFAULT_CONFIG.orgName,
          fields: { ...DEFAULT_CONFIG.fields, ...parsed.fields },
        })
      } catch {
        // Use defaults
      }
      setLoaded(true)
    } else if (setting && !setting.value && !loaded) {
      setLoaded(true)
    }
  }, [setting, loaded])

  const toggleField = (key: FieldKey) => {
    const field = CARD_FIELDS.find(f => f.key === key)
    if (field && 'alwaysOn' in field && field.alwaysOn) return
    setConfig(prev => ({
      ...prev,
      fields: { ...prev.fields, [key]: !prev.fields[key] },
    }))
  }

  const handleSave = async () => {
    try {
      await updateSetting.mutateAsync({
        key: 'card.config',
        value: JSON.stringify(config),
      })
      toast.success('Configuration de la carte sauvegardée')
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CreditCard className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Carte membre</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <RequiredLabel htmlFor="orgName" required>
                Nom de l'organisation
              </RequiredLabel>
              <Input
                id="orgName"
                value={config.orgName}
                onChange={e => setConfig(prev => ({ ...prev, orgName: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Champs affichés sur la carte</p>
              <div className="space-y-1.5">
                {CARD_FIELDS.map(field => {
                  const Icon = field.icon
                  const isAlwaysOn = 'alwaysOn' in field && field.alwaysOn
                  const checked = isAlwaysOn || !!config.fields[field.key]
                  return (
                    <label
                      key={field.key}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted/60 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isAlwaysOn}
                        onChange={() => toggleField(field.key)}
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{field.label}</span>
                      {isAlwaysOn && (
                        <span className="ml-auto text-xs text-muted-foreground">Obligatoire</span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>

            <Button onClick={handleSave} disabled={updateSetting.isPending} className="w-full">
              <Save className="mr-2 h-4 w-4" />
              {updateSetting.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </CardContent>
        </Card>

        {/* Right: Live preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aperçu</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <div
              className="border-2 border-dashed rounded-lg p-4 bg-white mx-auto"
              style={{ width: 'min(340px, 100%)', aspectRatio: '1.59', position: 'relative' }}
            >
              <div className="text-center font-bold text-sm">{config.orgName}</div>
              <hr className="my-1" />
              <div className="flex gap-3 mt-2">
                {config.fields.photo && (
                  <div className="w-14 h-16 bg-muted rounded flex items-center justify-center text-muted-foreground text-lg font-bold shrink-0">
                    JD
                  </div>
                )}
                <div className="flex-1 text-xs space-y-0.5">
                  {config.fields.name && <div className="font-bold text-sm">Jean Dupont</div>}
                  {config.fields.cardNumber && <div>N° M-0001</div>}
                  {config.fields.unit && <div>Meute 2ème Beyrouth</div>}
                  {config.fields.team && <div>Sizaine Brune</div>}
                  {config.fields.role && <div className="italic">Louveteau</div>}
                  {config.fields.dateOfBirth && <div>Né(e) le 15/03/2012</div>}
                </div>
              </div>
              <hr className="my-1" />
              <div className="flex gap-3 text-[10px]">
                {config.fields.bloodType && <span>Sang: A+</span>}
                {config.fields.emergencyContact && (
                  <span>Urgence: Marie Dupont +961 71 234 567</span>
                )}
              </div>
              {config.fields.customFields && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Véhicule: Toyota Yaris
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
