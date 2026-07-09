// Dialog that produces the unit "trombinoscope" (photo grid) PDF. Opened from the CU dashboard.
// Generating is the SAVE: every "Générer" freezes the current-roster PDF for the (unit, scout year) —
// overwriting any previous version for everyone — AND downloads it. That saved file is what the CU
// re-downloads and what every member sees on their Trombinoscope page, with the photos as they were at
// generation time (so replacing a member's photo later never rewrites a past year, and it's never
// regenerated on view). The leader picks which teams to include and whether to print photos.
// Year = cotisation.current_scout_year.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  archiveTrombinoscope,
  getTrombinoscopeArchiveInfo,
  downloadTrombinoscopeArchive,
} from '@/services/report-service'
import { useTeams } from '@/services/team-service'
import { useSettingValue } from '@/services/settings-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { FileDown, Download, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  unitId: string
  unitName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TrombinoscoreDialog({ unitId, unitName, open, onOpenChange }: Props) {
  const scoutYear = useSettingValue('cotisation.current_scout_year') ?? '2025-2026'
  const { data: teamsData } = useTeams({ unitId, pageSize: 100 })
  const teams = teamsData?.items ?? []

  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set())
  const [includePhotos, setIncludePhotos] = useState(true)
  const [busy, setBusy] = useState<'' | 'generate' | 'download'>('')
  const [error, setError] = useState('')

  // Status of the currently-saved version (drives the "last saved" hint + a re-download link).
  const { data: archiveInfo, refetch: refetchInfo } = useQuery({
    queryKey: ['trombi-archive', unitId, scoutYear],
    queryFn: () => getTrombinoscopeArchiveInfo(unitId, scoutYear),
    enabled: open && !!unitId && !!scoutYear,
  })

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

  const teamIds = () => (allSelected ? null : Array.from(selectedTeams))

  // Downloads a blob to the browser as a named file.
  const saveBlob = (data: BlobPart, fileName: string) => {
    const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  const defaultName = `Trombinoscope ${unitName} ${scoutYear}.pdf`

  // Generate = save (freeze/overwrite) the current-roster trombinoscope, then download it.
  const handleGenerate = async () => {
    setBusy('generate'); setError('')
    try {
      const info = await archiveTrombinoscope({ unitId, scoutYear, includePhotos, teamIds: teamIds() })
      // Re-read the freshly saved bytes to download them (same file the members now see).
      const response = await downloadTrombinoscopeArchive(unitId, scoutYear)
      saveBlob(response.data, info.fileName ?? defaultName)
      toast.success(`Trombinoscope généré et enregistré (${info.memberCount} membres)`)
      refetchInfo()
      onOpenChange(false)
    } catch (err) {
      setError(parseApiError(err))
    } finally { setBusy('') }
  }

  // Re-download the already-saved version without regenerating.
  const handleDownloadSaved = async () => {
    setBusy('download'); setError('')
    try {
      const response = await downloadTrombinoscopeArchive(unitId, scoutYear)
      saveBlob(response.data, archiveInfo?.fileName ?? defaultName)
    } catch (err) {
      setError(parseApiError(err))
    } finally { setBusy('') }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trombinoscope — {unitName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

          {/* Saved-version status: generating overwrites this for everyone (CU re-download + members). */}
          {archiveInfo?.exists && (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Version enregistrée{archiveInfo.savedAt ? ` le ${new Date(archiveInfo.savedAt).toLocaleDateString('fr-FR')}` : ''}</p>
                <p className="text-xs text-emerald-700">{archiveInfo.memberCount} membres · visible par les membres. Générer à nouveau la remplacera.</p>
                <Button variant="link" size="sm" className="h-auto p-0 text-emerald-800" onClick={handleDownloadSaved} disabled={busy !== ''}>
                  <Download className="mr-1 h-3.5 w-3.5" />Télécharger la version enregistrée
                </Button>
              </div>
            </div>
          )}

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

          <p className="text-xs text-muted-foreground">
            Année scoute : {scoutYear} — la génération enregistre le trombinoscope (visible par les membres) et le télécharge.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
          <Button onClick={handleGenerate} disabled={busy !== ''}>
            {busy === 'generate' ? <LoadingSpinner className="py-0 mr-2 h-4 w-4" /> : <FileDown className="mr-1 h-4 w-4" />}
            {busy === 'generate' ? 'Génération...' : (archiveInfo?.exists ? 'Générer à nouveau' : 'Générer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
