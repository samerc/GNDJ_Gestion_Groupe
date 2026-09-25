// "Personnaliser" dialog of the CU "Mon unité" page: the CU reorders / hides the action-bar buttons, picks what
// each roster row shows, and chooses the grouping (by team or one A–Z list). Saved to the CU's account
// (useUpdateUnitDashboardPrefs) so it follows them on every device. Edits a local draft; nothing is saved until
// "Enregistrer". The member file itself is NOT customizable (all tabs stay; only permissions hide things).
import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { parseApiError } from '@/lib/error-utils'
import { cn } from '@/lib/utils'
import { useUpdateUnitDashboardPrefs } from '@/services/dashboard-service'
import {
  UNIT_BUTTONS, ROW_FIELDS, defaultUnitPrefs, serializeUnitPrefs,
  type UnitDashboardPrefs, type RosterGrouping,
} from '@/lib/unit-dashboard-prefs'

const BUTTON_LABEL = Object.fromEntries(UNIT_BUTTONS.map(b => [b.id, b.label])) as Record<string, string>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefs: UnitDashboardPrefs
  cardsEnabled: boolean // the "Cartes" button only exists when member cards are enabled group-wide
}

export function UnitDashboardCustomizeDialog({ open, onOpenChange, prefs, cardsEnabled }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mounted only while open, so the draft re-initializes from the saved prefs on every opening. */}
      {open && <CustomizeBody prefs={prefs} cardsEnabled={cardsEnabled} onClose={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function CustomizeBody({ prefs, cardsEnabled, onClose }: { prefs: UnitDashboardPrefs; cardsEnabled: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<UnitDashboardPrefs>(prefs)
  const save = useUpdateUnitDashboardPrefs()

  const move = (i: number, dir: -1 | 1) => setDraft(d => {
    const buttons = [...d.buttons]
    const j = i + dir
    if (j < 0 || j >= buttons.length) return d
    ;[buttons[i], buttons[j]] = [buttons[j], buttons[i]]
    return { ...d, buttons }
  })

  const persist = async (next: UnitDashboardPrefs, ok: string) => {
    try {
      await save.mutateAsync(serializeUnitPrefs(next))
      toast.success(ok)
      onClose()
    } catch (err) { toast.error(parseApiError(err)) }
  }

  return (
    <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Personnaliser « Mon unité »</DialogTitle>
        <DialogDescription>Ces réglages sont enregistrés sur votre compte et vous suivent sur tous vos appareils.</DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        {/* Action-bar buttons: order + visibility */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Boutons en haut de la page</h4>
          <div className="divide-y rounded-lg border">
            {draft.buttons.map((b, i) => (
              <div key={b.id} className={cn('flex items-center gap-2 px-3 py-2', !b.visible && 'opacity-60')}>
                <div className="flex flex-col">
                  <button type="button" aria-label="Monter" disabled={i === 0} onClick={() => move(i, -1)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label="Descendre" disabled={i === draft.buttons.length - 1} onClick={() => move(i, 1)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                </div>
                <span className="flex-1 text-sm">
                  {BUTTON_LABEL[b.id]}
                  {b.id === 'cards' && !cardsEnabled && <span className="ml-1 text-xs text-muted-foreground">(désactivé par le groupe)</span>}
                  {b.id === 'birthdays' && <span className="ml-1 text-xs text-muted-foreground">(visible seulement s'il y en a)</span>}
                </span>
                <Switch checked={b.visible} aria-label={`Afficher ${BUTTON_LABEL[b.id]}`}
                  onCheckedChange={(v) => setDraft(d => ({ ...d, buttons: d.buttons.map(x => x.id === b.id ? { ...x, visible: v } : x) }))} />
              </div>
            ))}
          </div>
        </section>

        {/* What each roster row shows */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dans la liste des membres, afficher</h4>
          <div className="divide-y rounded-lg border">
            {ROW_FIELDS.map(f => (
              <label key={f.id} className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
                {f.label}
                <Switch checked={draft.row[f.id]}
                  onCheckedChange={(v) => setDraft(d => ({ ...d, row: { ...d.row, [f.id]: v } }))} />
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">Le nom est toujours affiché.</p>
        </section>

        {/* Grouping */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Regroupement</h4>
          <div className="grid grid-cols-2 gap-2">
            {([['team', 'Par équipe'], ['alpha', 'Liste alphabétique']] as [RosterGrouping, string][]).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setDraft(d => ({ ...d, grouping: v }))}
                className={cn('rounded-lg border px-3 py-2 text-sm transition-colors',
                  draft.grouping === v ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted')}>
                {label}
              </button>
            ))}
          </div>
        </section>
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        <Button variant="ghost" disabled={save.isPending} onClick={() => persist(defaultUnitPrefs(), 'Réglages par défaut rétablis')}>
          Réinitialiser
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button disabled={save.isPending} onClick={() => persist(draft, 'Préférences enregistrées')}>
            {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  )
}
