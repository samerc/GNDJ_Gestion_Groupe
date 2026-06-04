import { useState } from 'react'
import { generateTrombinoscope } from '@/services/report-service'
import { useTeams } from '@/services/team-service'
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
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TrombinoscoreDialog({ unitId, unitName, open, onOpenChange }: Props) {
  const schoolYear = useSettingValue('cotisation.current_school_year') ?? '2025-2026'
  const { data: teamsData } = useTeams({ unitId, pageSize: 100 })
  const teams = teamsData?.items ?? []

  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set())
  const [includePhotos, setIncludePhotos] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  // Default: all teams selected when none are individually selected
  const allSelected = selectedTeams.size === 0 || selectedTeams.size === teams.length

  const toggleTeam = (id: string) => {
    setSelectedTeams(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    try {
      const teamIds = allSelected ? null : Array.from(selectedTeams)
      const response = await generateTrombinoscope({ unitId, schoolYear, includePhotos, teamIds })
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Trombinoscope_${unitName.replace(/\s+/g, '_')}_${schoolYear}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Trombinoscope généré')
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
          <DialogTitle>Trombinoscope — {unitName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

          <div>
            <p className="text-sm font-medium mb-2">Équipes à inclure</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-md border p-2">
              {teams.map(t => (
                <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected || selectedTeams.has(t.id)}
                    onChange={() => toggleTeam(t.id)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  {t.name}
                </label>
              ))}
              {teams.length === 0 && <p className="text-xs text-muted-foreground">Aucune équipe</p>}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={includePhotos}
              onChange={(e) => setIncludePhotos(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Imprimer les photos
          </label>

          <p className="text-xs text-muted-foreground">Année scoute : {schoolYear}</p>
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
