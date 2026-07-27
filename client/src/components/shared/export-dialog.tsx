// Dialog that exports the unit member list as a spreadsheet (Excel .xlsx via ClosedXML, or UTF-8 CSV).
// Opened from the CU dashboard / admin members page. Grouped column picker (name always forced on) plus
// a format radio; optionally scoped to a single team via teamId. Calls the report API and downloads the
// returned blob with the matching MIME type / extension.
import { useState } from 'react'
import { generateExport } from '@/services/report-service'
import { useSettingValue } from '@/services/settings-service'
import { parseBlobError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { FileSpreadsheet, FileDown } from 'lucide-react'
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
    label: 'Identite',
    columns: [
      { key: 'name', label: 'Nom' },
      { key: 'cardNumber', label: 'Matricule' },
      { key: 'gender', label: 'Genre' },
      { key: 'dateOfBirth', label: 'Date naissance' },
      { key: 'age', label: '\u00c2ge' },
    ],
  },
  {
    label: 'Scolarite',
    columns: [
      { key: 'school', label: '\u00c9cole' },
      { key: 'classe', label: 'Classe' },
      { key: 'section', label: 'Section' },
    ],
  },
  {
    label: 'Contact',
    columns: [
      { key: 'phone', label: 'T\u00e9l\u00e9phone' },
      { key: 'email', label: 'Email' },
    ],
  },
  {
    label: 'Affectation',
    columns: [
      { key: 'role', label: 'Fonction' },
      { key: 'team', label: '\u00c9quipe' },
    ],
  },
  {
    label: 'Medical',
    columns: [
      { key: 'bloodType', label: 'Groupe sanguin' },
      { key: 'nationality', label: 'Nationalit\u00e9' },
    ],
  },
]

// Columns ticked when the dialog first opens (a sensible subset, not every column).
const DEFAULT_SELECTED = new Set(['name', 'cardNumber', 'age', 'phone', 'email', 'role', 'team'])

export function ExportDialog({ unitId, unitName, teamId, open, onOpenChange }: Props) {
  const scoutYear = useSettingValue('cotisation.current_scout_year') ?? '2025-2026'
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set(DEFAULT_SELECTED))
  const [format, setFormat] = useState<'excel' | 'csv'>('excel')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const toggleCol = (key: string) => {
    setSelectedCols(prev => {
      const next = new Set(prev)
      if (key === 'name') return next // name always included
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAll = () => setSelectedCols(new Set(COLUMN_GROUPS.flatMap(g => g.columns.map(c => c.key))))
  const deselectAll = () => setSelectedCols(new Set(['name']))

  const handleExport = async () => {
    setGenerating(true)
    setError('')
    try {
      const response = await generateExport({
        unitId,
        teamId: teamId || null,
        scoutYear,
        columns: Array.from(selectedCols),
        format,
      })
      // Pick extension + MIME from the chosen format, then download the blob via a temporary anchor.
      const ext = format === 'csv' ? 'csv' : 'xlsx'
      const contentType = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      const blob = new Blob([response.data], { type: contentType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${unitName.replace(/\s+/g, '_')}_${scoutYear}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Export ${format.toUpperCase()} g\u00e9n\u00e9r\u00e9`)
      onOpenChange(false)
    } catch (err) {
      setError(await parseBlobError(err))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exporter — {unitName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

          {/* Format selection */}
          <div>
            <p className="text-sm font-medium mb-2">Format</p>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="format" checked={format === 'excel'} onChange={() => setFormat('excel')} className="h-4 w-4" />
                <FileSpreadsheet className="h-4 w-4 text-green-600" />
                Excel (.xlsx)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="format" checked={format === 'csv'} onChange={() => setFormat('csv')} className="h-4 w-4" />
                <FileDown className="h-4 w-4 text-blue-600" />
                CSV
              </label>
            </div>
          </div>

          {/* Column picker */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Colonnes</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={selectAll}>Tout</Button>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={deselectAll}>Aucun</Button>
              </div>
            </div>
            <div className="space-y-3 max-h-56 overflow-y-auto rounded-md border p-3">
              {COLUMN_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">{group.label}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {group.columns.map(col => (
                      <label key={col.key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCols.has(col.key)}
                          onChange={() => toggleCol(col.key)}
                          disabled={col.key === 'name'}
                          className="h-3.5 w-3.5 rounded border-gray-300"
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">Année scoute : {scoutYear}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
          <Button onClick={handleExport} disabled={generating}>
            {generating ? <LoadingSpinner className="py-0 mr-2 h-4 w-4" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}
            {generating ? 'G\u00e9n\u00e9ration...' : 'Exporter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
