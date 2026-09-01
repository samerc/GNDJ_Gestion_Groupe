// Dialog that produces the unit "trombinoscope" (photo grid) PDF. Opened from the CU dashboard.
// Generating is the SAVE: every "Générer" freezes the current-roster PDF for the (unit, scout year) —
// overwriting any previous version for everyone — AND downloads it. That saved file is what the CU
// re-downloads and what every member sees on their Trombinoscope page, with the photos as they were at
// generation time (so replacing a member's photo later never rewrites a past year, and it's never
// regenerated on view). The leader picks which teams to include and whether to print photos.
// Year = the active scout year (follows the passage year).
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  archiveTrombinoscope,
  getTrombinoscopeArchiveInfo,
  downloadTrombinoscopeArchive,
  setTrombinoscopePublished,
} from '@/services/report-service'
import { useTeams } from '@/services/team-service'
import { useCurrentScoutYear } from '@/hooks/use-scout-year'
import { parseApiError } from '@/lib/error-utils'
import { saveBlob } from '@/lib/download'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { FileDown, Download, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  unitId: string
  unitName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TrombinoscoreDialog({ unitId, unitName, open, onOpenChange }: Props) {
  const scoutYear = useCurrentScoutYear()
  const { data: teamsData } = useTeams({ unitId, pageSize: 100 })
  const teams = teamsData?.items ?? []

  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set())
  const [includePhotos, setIncludePhotos] = useState(true)
  const [publish, setPublish] = useState(false) // make it visible to members (else CU-only overview)
  const [busy, setBusy] = useState<'' | 'generate' | 'download' | 'publish'>('')
  const [error, setError] = useState('')

  // Status of the currently-saved version (drives the "last saved" hint + a re-download link).
  const { data: archiveInfo, refetch: refetchInfo } = useQuery({
    queryKey: ['trombi-archive', unitId, scoutYear],
    queryFn: () => getTrombinoscopeArchiveInfo(unitId, scoutYear),
    enabled: open && !!unitId && !!scoutYear,
  })

  // Default the "visible aux membres" checkbox to the saved version's current state (preserve intent on
  // re-generate); a brand-new save (no archive) defaults to unpublished — safe, the CU opts in to publish.
  // Render-phase reset keyed on the loaded archive so it follows the real state without a set-in-effect.
  const [publishKey, setPublishKey] = useState<string | null>(null)
  const infoKey = archiveInfo ? `${unitId}|${scoutYear}|${archiveInfo.published}` : null
  if (infoKey && infoKey !== publishKey) { setPublishKey(infoKey); setPublish(archiveInfo!.published) }

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

  const defaultName = `Trombinoscope ${unitName} ${scoutYear}.pdf`

  // Generate = save (freeze/overwrite) the current-roster trombinoscope, then download it.
  const handleGenerate = async () => {
    setBusy('generate'); setError('')
    try {
      const info = await archiveTrombinoscope({ unitId, scoutYear, includePhotos, teamIds: teamIds(), publish })
      // Re-read the freshly saved bytes to download them.
      const response = await downloadTrombinoscopeArchive(unitId, scoutYear)
      saveBlob(response.data, info.fileName ?? defaultName, 'application/pdf')
      toast.success(`Trombinoscope généré et enregistré (${info.memberCount} membres) — ${publish ? 'visible par les membres' : 'non visible par les membres'}`)
      refetchInfo()
      onOpenChange(false)
    } catch (err) {
      setError(parseApiError(err))
    } finally { setBusy('') }
  }

  // Publish / unpublish the already-saved version WITHOUT regenerating (just flips member visibility).
  const handleTogglePublished = async (next: boolean) => {
    setBusy('publish'); setError('')
    try {
      await setTrombinoscopePublished(unitId, scoutYear, next)
      setPublish(next)
      await refetchInfo()
      toast.success(next ? 'Trombinoscope rendu visible par les membres' : 'Trombinoscope masqué aux membres')
    } catch (err) {
      setError(parseApiError(err))
    } finally { setBusy('') }
  }

  // Re-download the already-saved version without regenerating.
  const handleDownloadSaved = async () => {
    setBusy('download'); setError('')
    try {
      const response = await downloadTrombinoscopeArchive(unitId, scoutYear)
      saveBlob(response.data, archiveInfo?.fileName ?? defaultName, 'application/pdf')
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

          {/* Saved-version status: generating overwrites this. Published = members can see it; the CU can
              flip visibility here without regenerating. */}
          {archiveInfo?.exists && (
            <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${archiveInfo.published ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              {archiveInfo.published ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />}
              <div className="flex-1">
                <p className="font-medium">Version enregistrée{archiveInfo.savedAt ? ` le ${new Date(archiveInfo.savedAt).toLocaleDateString('fr-FR')}` : ''}</p>
                <p className={`text-xs ${archiveInfo.published ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {archiveInfo.memberCount} membres · {archiveInfo.published ? 'visible par les membres' : 'non visible par les membres (usage interne)'}. Générer à nouveau la remplacera.
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <Button variant="link" size="sm" className={`h-auto p-0 ${archiveInfo.published ? 'text-emerald-800' : 'text-amber-800'}`} onClick={handleDownloadSaved} disabled={busy !== ''}>
                    <Download className="mr-1 h-3.5 w-3.5" />Télécharger
                  </Button>
                  <Button variant="link" size="sm" className={`h-auto p-0 ${archiveInfo.published ? 'text-amber-800' : 'text-emerald-800'}`} onClick={() => handleTogglePublished(!archiveInfo.published)} disabled={busy !== ''}>
                    {archiveInfo.published ? <><EyeOff className="mr-1 h-3.5 w-3.5" />Masquer aux membres</> : <><Eye className="mr-1 h-3.5 w-3.5" />Rendre visible aux membres</>}
                  </Button>
                </div>
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

          {/* Publish flag: only a checked "visible aux membres" makes the saved PDF appear on members' Trombinoscope
              page. Leave unchecked for an internal overview (e.g. without photos). */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Rendre visible par les membres
          </label>

          <p className="text-xs text-muted-foreground">
            Année scoute : {scoutYear} — la génération enregistre le trombinoscope et le télécharge. Il n'apparaît
            pour les membres que si « Rendre visible par les membres » est coché (vous pouvez le masquer/afficher ensuite).
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
