import { useState } from 'react'
import { toast } from 'sonner'
import { useSetting, useUpdateSetting } from '@/services/settings-service'
import { ROLE_LABELS, DEFAULT_ROLE_COLORS, type RoleKey } from '@/lib/use-is-manager'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { Palette, Save, RotateCcw } from 'lucide-react'

// CG/super-admin page — set the chrome (header + sidebar) colour per role category. Colours are stored as a
// hex map in the `ui.role_colors` setting and applied inline by useRoleTheme, so any colour works. Order shown
// = member → CU → CG → super-admin.
const ROLE_ORDER: RoleKey[] = ['member', 'cu', 'cg', 'superadmin']

// Quick-pick palette (dark shades that read well with white text). Custom hex is always available too.
const PRESETS = [
  '#0f766e', '#047857', '#065f46', '#166534', '#3f6212', // teals / greens
  '#3730a3', '#312e81', '#1e40af', '#1e3a8a', '#075985', '#155e75', // indigos / blues
  '#5b21b6', '#6b21a8', '#86198f', '#be185d', // violets / purples / pink
  '#be123c', '#991b1b', '#9a3412', '#92400e', // rose / red / warm
  '#1e293b', '#0f172a', '#292524', '#27272a', // neutrals
]

export default function AppearancePage() {
  const { data, isLoading, dataUpdatedAt } = useSetting('ui.role_colors')
  const update = useUpdateSetting()

  const [colors, setColors] = useState<Record<RoleKey, string>>(DEFAULT_ROLE_COLORS)
  const [syncedAt, setSyncedAt] = useState(0)
  // Re-sync from the server only when a NEW fetch lands (so in-progress edits aren't clobbered).
  if (data && dataUpdatedAt !== syncedAt) {
    let parsed: Partial<Record<RoleKey, string>>
    try { parsed = data.value ? JSON.parse(data.value) : {} } catch { parsed = {} }
    setColors({ ...DEFAULT_ROLE_COLORS, ...parsed })
    setSyncedAt(dataUpdatedAt)
  }

  const setColor = (role: RoleKey, value: string) => setColors((c) => ({ ...c, [role]: value }))

  const save = async () => {
    try {
      await update.mutateAsync({ key: 'ui.role_colors', value: JSON.stringify(colors) })
      toast.success('Couleurs enregistrées. Rechargez la page pour les voir partout.')
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v)
  const allValid = ROLE_ORDER.every((r) => isHex(colors[r]))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Palette className="h-6 w-6" />Apparence</h1>
          <p className="text-sm text-muted-foreground">Couleur du bandeau (en-tête / menu) selon le rôle de l'utilisateur connecté.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setColors(DEFAULT_ROLE_COLORS)} disabled={update.isPending}>
            <RotateCcw className="mr-1 h-4 w-4" />Réinitialiser
          </Button>
          <Button onClick={save} disabled={update.isPending || !allValid}><Save className="mr-1 h-4 w-4" />Enregistrer</Button>
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : (
        <div className="space-y-4">
          {ROLE_ORDER.map((role) => (
            <div key={role} className="rounded-lg border p-4">
              {/* Live preview bar in the chosen colour */}
              <div className="mb-3 flex items-center gap-3 rounded-md px-3 py-2 text-white shadow-sm" style={{ backgroundColor: isHex(colors[role]) ? colors[role] : '#334155' }}>
                <span className="text-sm font-semibold">{ROLE_LABELS[role]}</span>
                <span className="text-xs text-white/70">Tableau de bord · Membres · …</span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Native colour picker + hex text */}
                <input
                  type="color"
                  value={isHex(colors[role]) ? colors[role] : '#334155'}
                  onChange={(e) => setColor(role, e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border bg-transparent p-0.5"
                  aria-label={`Couleur ${ROLE_LABELS[role]}`}
                />
                <Input
                  value={colors[role]}
                  onChange={(e) => setColor(role, e.target.value)}
                  className={`w-32 font-mono ${isHex(colors[role]) ? '' : 'border-destructive'}`}
                  placeholder="#0f766e"
                />
                {/* Preset swatches */}
                <div className="flex flex-wrap gap-1">
                  {PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      title={p}
                      onClick={() => setColor(role, p)}
                      className={`h-6 w-6 rounded ring-1 ring-black/10 transition-transform hover:scale-110 ${colors[role].toLowerCase() === p ? 'ring-2 ring-foreground' : ''}`}
                      style={{ backgroundColor: p }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            La couleur s'applique à l'en-tête (et au menu latéral). Le texte reste en blanc — choisissez des teintes foncées.
            Les changements sont visibles après un rechargement de page.
          </p>
        </div>
      )}
    </div>
  )
}
