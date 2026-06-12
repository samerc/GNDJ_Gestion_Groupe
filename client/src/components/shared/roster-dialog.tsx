import { useState } from 'react'
import { generateRoster } from '@/services/report-service'
import { useSettingValue } from '@/services/settings-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { FileDown } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  unitId: string
  unitName: string
  teamId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ColumnGroup {
  label: string
  columns: { key: string; label: string }[]
}

const COLUMN_GROUPS: ColumnGroup[] = [
  {
    label: 'Identité',
    columns: [
      { key: 'cardNumber', label: 'N° carte' },
      { key: 'gender', label: 'Sexe' },
      { key: 'dateOfBirth', label: 'Date de naissance' },
      { key: 'age', label: 'Âge' },
    ],
  },
  {
    label: 'Scolarité',
    columns: [
      { key: 'school', label: 'École' },
      { key: 'classe', label: 'Classe' },
      { key: 'section', label: 'Section' },
    ],
  },
  {
    label: 'Contact',
    columns: [
      { key: 'phone', label: 'Téléphone' },
      { key: 'email', label: 'Courriel' },
    ],
  },
  {
    label: 'Affectation',
    columns: [
      { key: 'role', label: 'Fonction' },
      { key: 'team', label: 'Équipe' },
    ],
  },
  {
    label: 'Médical',
    columns: [
      { key: 'bloodType', label: 'Groupe sanguin' },
      { key: 'nationality', label: 'Nationalité' },
    ],
  },
]

const ALL_COLUMN_KEYS = COLUMN_GROUPS.flatMap(g => g.columns.map(c => c.key))

export function RosterDialog({ unitId, unitName, teamId, open, onOpenChange }: Props) {
  const scoutYear = useSettingValue('cotisation.current_scout_year') ?? '2025-2026'
  const [selected, setSelected] = useState<Set<string>>(new Set(ALL_COLUMN_KEYS))
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(ALL_COLUMN_KEYS))
  const selectNone = () => setSelected(new Set())

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    try {
      const columns = Array.from(selected)
      const response = await generateRoster({ unitId, teamId: teamId || null, scoutYear, columns })
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Liste_${unitName.replace(/\s+/g, '_')}_${scoutYear}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Liste générée')
      onOpenChange(false)
    } catch (err) {
      setError(parseApiError(err))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Liste des membres — {unitName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>Tout sélectionner</Button>
            <Button variant="outline" size="sm" onClick={selectNone}>Tout désélectionner</Button>
          </div>

          <div className="space-y-3 max-h-64 overflow-y-auto rounded-md border p-3">
            {COLUMN_GROUPS.map(group => (
              <div key={group.label}>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{group.label}</p>
                <div className="space-y-1 ml-1">
                  {group.columns.map(col => (
                    <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(col.key)}
                        onChange={() => toggle(col.key)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            Le nom et prénom sont toujours inclus. Année scoute : {scoutYear}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? <LoadingSpinner className="py-0 mr-2 h-4 w-4" /> : <FileDown className="mr-1 h-4 w-4" />}
            {generating ? 'Génération...' : 'Générer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
