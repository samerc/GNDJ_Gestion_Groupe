import { useState } from 'react'
import { toast } from 'sonner'
import { useSetting, useUpdateSetting } from '@/services/settings-service'
import { ROLE_LABELS, DEFAULT_ROLE_COLORS, type RoleKey } from '@/lib/use-is-manager'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { parseApiError } from '@/lib/error-utils'
import { Palette, Save, RotateCcw } from 'lucide-react'

// CG/super-admin page — set the chrome (header + sidebar) colour per role category. Colours are stored as a
// hex map in the `ui.role_colors` setting and applied inline by useRoleTheme, so any colour works. Order shown
// = member → CU → CG → super-admin.
const ROLE_ORDER: RoleKey[] = ['member', 'cu', 'cg', 'superadmin']

// Quick-pick palette — dark shades that read well with white text, spread across the colour wheel with no
// near-duplicates (one or two distinct shades per hue). Custom hex is always available too.
const PRESETS = [
  // Reds · roses · pinks · magentas
  '#b91c1c', '#9f1239', '#be185d', '#9d174d', '#a21caf', '#86198f',
  // Purples · violets · indigos
  '#7e22ce', '#6b21a8', '#6d28d9', '#4338ca', '#3730a3',
  // Blues · sky · cyan · teal
  '#1d4ed8', '#1e40af', '#1e3a8a', '#0369a1', '#0e7490', '#0f766e',
  // Greens · olive
  '#047857', '#15803d', '#166534', '#3f6212',
  // Warm: orange · rust · brown
  '#c2410c', '#9a3412', '#92400e',
  // Neutrals
  '#334155', '#1e293b', '#0f172a', '#292524', '#3f3f46',
]

// `embedded` = rendered inside the Paramètres → Apparence tab (suppresses the page's own big heading).
export default function AppearancePage({ embedded = false }: { embedded?: boolean } = {}) {
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

  const actions = (
    <>
      <Button variant="outline" onClick={() => setColors(DEFAULT_ROLE_COLORS)} disabled={update.isPending}>
        <RotateCcw className="mr-1.5 h-4 w-4" />Réinitialiser
      </Button>
      <Button onClick={save} disabled={update.isPending || !allValid}><Save className="mr-1.5 h-4 w-4" />Enregistrer</Button>
    </>
  )

  return (
    <Page>
      {embedded ? (
        <div className="flex flex-wrap justify-end gap-2">{actions}</div>
      ) : (
        <PageHeader title="Apparence" icon={Palette} description="Couleur du bandeau (en-tête / menu) selon le rôle de l'utilisateur connecté." actions={actions} />
      )}

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
    </Page>
  )
}
