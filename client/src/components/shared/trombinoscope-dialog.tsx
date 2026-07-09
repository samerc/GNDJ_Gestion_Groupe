// Dialog that produces the unit "trombinoscope" (photo grid) PDF. Opened from the CU dashboard.
// Two actions:
//  - "Aperçu" downloads a live PDF of the CURRENT roster/photos (to check before saving) — not stored.
//  - "Enregistrer" FREEZES that PDF for the (unit, scout year): it becomes the file the CU re-downloads AND
//    the file every member sees on their Trombinoscope page. Photos are frozen at save time, so replacing a
//    member's photo later never rewrites a past year, and it isn't regenerated on every view.
// The leader picks which teams to include and whether to print photos. Year = cotisation.current_scout_year.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  generateTrombinoscope,
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
import { FileDown, Save, Download, CheckCircle2, AlertTriangle } from 'lucide-react'
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
  const [busy, setBusy] = useState<'' | 'preview' | 'save' | 'download'>('')
  const [error, setError] = useState('')

  // Status of the already-saved version for this unit + year (drives the hint + re-download button).
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

  // Live preview of the current roster/photos — not stored.
  const handlePreview = async () => {
    setBusy('preview'); setError('')
    try {
      const response = await generateTrombinoscope({ unitId, scoutYear, includePhotos, teamIds: teamIds() })
      saveBlob(response.data, defaultName)
      toast.success('Aperçu généré')
    } catch (err) {
      setError(parseApiError(err))
    } finally { setBusy('') }
  }

  // Freeze (save) the trombinoscope so members can see it.
  const handleSave = async () => {
    setBusy('save'); setError('')
    try {
      const info = await archiveTrombinoscope({ unitId, scoutYear, includePhotos, teamIds: teamIds() })
      toast.success(`Trombinoscope enregistré (${info.memberCount} membres) — visible par les membres`)
      refetchInfo()
    } catch (err) {
      setError(parseApiError(err))
    } finally { setBusy('') }
  }

  // Re-download the saved version.
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

          {/* Saved-version status: once saved, THIS file is what members see + what re-downloads. */}
          {archiveInfo && (archiveInfo.exists ? (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Version enregistrée{archiveInfo.savedAt ? ` le ${new Date(archiveInfo.savedAt).toLocaleDateString('fr-FR')}` : ''}</p>
                <p className="text-xs text-emerald-700">{archiveInfo.memberCount} membres · visible par les membres. Réenregistrez pour la mettre à jour.</p>
                <Button variant="link" size="sm" className="h-auto p-0 text-emerald-800" onClick={handleDownloadSaved} disabled={busy !== ''}>
                  <Download className="mr-1 h-3.5 w-3.5" />Télécharger la version enregistrée
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Aucune version enregistrée pour {scoutYear}. Les membres ne verront leur trombinoscope qu'après l'enregistrement.</p>
            </div>
          ))}

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

          <p className="text-xs text-muted-foreground">Année scoute : {scoutYear}</p>
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
          <Button variant="outline" onClick={handlePreview} disabled={busy !== ''}>
            {busy === 'preview' ? <LoadingSpinner className="py-0 mr-2 h-4 w-4" /> : <FileDown className="mr-1 h-4 w-4" />}
            Aperçu
          </Button>
          <Button onClick={handleSave} disabled={busy !== ''}>
            {busy === 'save' ? <LoadingSpinner className="py-0 mr-2 h-4 w-4" /> : <Save className="mr-1 h-4 w-4" />}
            {archiveInfo?.exists ? 'Réenregistrer' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
