import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { matchCity } from '@/services/settings-service'
import { cn } from '@/lib/utils'

// City picker over a managed list, with an "Autre…" free-text escape hatch. A typed value is snapped
// onto a canonical city (accent/case-insensitive) on blur; genuinely new names pass through so the
// list stays curated while never blocking an unusual address. Pure component — the caller supplies
// `cities` (authenticated forms via useCities(); the applicant portal via its config) so we never
// call the authenticated /settings endpoint from the isolated portal.
export function CitySelect({
  value,
  onChange,
  className,
  cities,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
  cities: string[]
}) {
  const inList = value ? cities.some((c) => c.toLowerCase() === value.toLowerCase()) : false
  const [custom, setCustom] = useState(!!value && !inList)

  if (custom) {
    return (
      <div className={cn('space-y-1', className)}>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(matchCity(e.target.value, cities))}
          placeholder="Nom de la ville…"
        />
        {cities.length > 0 && (
          <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs"
            onClick={() => { setCustom(false); onChange('') }}>
            Choisir dans la liste
          </Button>
        )}
      </div>
    )
  }

  return (
    <SearchableSelect
      value={inList ? cities.find((c) => c.toLowerCase() === value.toLowerCase()) ?? value : ''}
      onValueChange={(v) => {
        if (v === '__other__') { setCustom(true); onChange('') }
        else onChange(v)
      }}
      options={[...cities.map((c) => ({ value: c, label: c })), { value: '__other__', label: 'Autre… (saisir)' }]}
      placeholder="Sélectionner une ville…"
      searchPlaceholder="Rechercher une ville…"
    />
  )
}
