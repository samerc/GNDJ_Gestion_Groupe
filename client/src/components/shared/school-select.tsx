import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { matchSchool } from '@/services/settings-service'
import { cn } from '@/lib/utils'

// School picker over the managed member.schools list, with an "Autre…" free-text escape hatch for a school not
// on the list. The dropdown is SEARCHABLE (type-to-filter) so a parent finds their school instead of scrolling
// a long list and resorting to "Autre…" (the root cause of spelling-variant duplicates). A typed name is snapped
// onto the canonical list entry (accent/case/punctuation-insensitive via matchSchool) on blur — and collapses
// back to the list when it matched — so spellings are deduped while a genuinely new school still passes through.
// Pure component: the caller supplies `schools` (authenticated forms via useSettingArray('member.schools'); the
// applicant portal via its config) so the isolated portal never calls the authenticated /settings endpoint.
// Mirrors CitySelect.
export function SchoolSelect({
  value,
  onChange,
  schools,
  className,
  invalid,
}: {
  value: string
  onChange: (value: string) => void
  schools: string[]
  className?: string
  invalid?: boolean
}) {
  // inList = the current value matches a managed school (case-insensitive). Start in free-text ("custom") mode
  // when there's an existing value that isn't on the list, so legacy/unusual entries stay editable.
  const inList = value ? schools.some((s) => s.toLowerCase() === value.toLowerCase()) : false
  const [custom, setCustom] = useState(!!value && !inList)

  if (custom) {
    return (
      <div className={cn('space-y-1', className)}>
        <Input
          className={invalid ? 'border-destructive' : ''}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // Snap a typed name onto the canonical list on blur; collapse back to the list when it matched.
          onBlur={(e) => { const m = matchSchool(e.target.value, schools); onChange(m); if (schools.includes(m)) setCustom(false) }}
          placeholder="Nom de l'école…"
        />
        {schools.length > 0 && (
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
      value={inList ? schools.find((s) => s.toLowerCase() === value.toLowerCase()) ?? value : ''}
      onValueChange={(v) => {
        if (v === '__other__') { setCustom(true); onChange('') }
        else onChange(v)
      }}
      options={[...schools.map((s) => ({ value: s, label: s })), { value: '__other__', label: 'Autre… (saisir)' }]}
      placeholder="Sélectionner une école…"
      searchPlaceholder="Rechercher une école…"
    />
  )
}
