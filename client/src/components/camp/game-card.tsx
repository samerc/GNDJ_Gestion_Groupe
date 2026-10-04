// Camp BP — one game (jeu / étape) in the commission's Jeux tab.
//   Header: number badge (amber « ? » when the game isn't in the rotation yet), name, places (lieu A / lieu B) and
//           quiet icon actions (print, edit, delete).
//   Body:   left = étapistes (chips + « Gérer »), plan B game, description (shortened, « Voir plus »);
//           right = the « Matériel » list (GameMaterials). Stacks on narrow screens.
import { useState } from 'react'
import { CloudRain, MapPin, Package, Pencil, Printer, Trash2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/tooltip'
import { Callout } from '@/components/shared/callout'
import { RichContent } from '@/components/public/rich-content'
import { GameMaterials } from '@/components/camp/game-materials'
import type { CampGameDto } from '@/services/camp-service'

// True when a (possibly rich-text) description has visible text — an emptied TipTap editor leaves "<p></p>".
function hasRichText(html: string | null) {
  return !!html && html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0
}

const initials = (first: string, last: string) => `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase()

export function GameCard({ campId, game: g, readOnly, onEdit, onEtapistes, onDelete, onPrint }: {
  campId: string; game: CampGameDto; readOnly: boolean
  onEdit: () => void; onEtapistes: () => void; onDelete: () => void; onPrint: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const longDescription = (g.description ?? '').replace(/<[^>]*>/g, '').length > 280
  const materials = g.materials ?? []

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-card">
      {/* Header */}
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <Tip content={g.number != null ? `Jeu ${g.number} dans la rotation` : 'Pas encore de numéro dans la rotation (modifier le jeu)'}>
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-bold tabular-nums',
            g.number != null ? 'bg-primary text-primary-foreground' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300')}>
            {g.number ?? '?'}
          </div>
        </Tip>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-base font-semibold leading-tight">{g.name}</h3>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-primary" />{g.mainLocation ?? <i>lieu à choisir</i>}</span>
            <span className="flex items-center gap-1"><CloudRain className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />{g.backupLocation ?? <i>pas de repli</i>}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <Tip content="Imprimer la fiche du jeu (PDF)"><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Imprimer la fiche du jeu" onClick={onPrint}><Printer className="h-4 w-4" /></Button></Tip>
          {!readOnly && <>
            <Tip content="Modifier le jeu"><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Modifier le jeu" onClick={onEdit}><Pencil className="h-4 w-4" /></Button></Tip>
            <Tip content="Supprimer le jeu"><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Supprimer le jeu" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button></Tip>
          </>}
        </div>
      </div>

      {/* Body */}
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
        <div className="min-w-0 space-y-3">
          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Users className="h-3.5 w-3.5" />Étapistes</p>
              {!readOnly && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onEtapistes}>Gérer</Button>}
            </div>
            {g.etapistes.length === 0
              ? <p className="text-sm text-amber-700 dark:text-amber-400">Aucun étapiste pour l'instant.</p>
              : <div className="flex flex-wrap gap-1.5">
                  {g.etapistes.map(e => (
                    <span key={e.memberId} className="inline-flex items-center gap-1.5 rounded-full border bg-background py-0.5 pl-0.5 pr-2.5 text-sm">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{initials(e.firstName, e.lastName)}</span>
                      {e.firstName} {e.lastName}
                    </span>
                  ))}
                </div>}
          </section>

          {g.backupGameName && (
            <Callout tone="info" icon={CloudRain} className="p-2.5">Plan B : on joue <b>{g.backupGameName}</b></Callout>
          )}

          <section>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
            {hasRichText(g.description)
              ? <>
                  <div className={cn('relative', !expanded && longDescription && 'max-h-28 overflow-hidden')}>
                    <RichContent html={g.description!} className="text-sm [&>*:first-child]:mt-0" />
                    {!expanded && longDescription && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent" />}
                  </div>
                  {longDescription && <button type="button" className="mt-1 text-xs font-medium text-primary hover:underline" onClick={() => setExpanded(v => !v)}>{expanded ? 'Voir moins' : 'Voir plus'}</button>}
                </>
              : readOnly
                ? <p className="text-sm italic text-muted-foreground">Pas encore de description.</p>
                : <button type="button" className="text-sm text-muted-foreground hover:text-foreground hover:underline" onClick={onEdit}>+ Ajouter une description</button>}
          </section>
        </div>

        <section className="rounded-lg bg-muted/40 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Package className="h-3.5 w-3.5" />Matériel{materials.length > 0 && <span className="font-normal normal-case tracking-normal">· {materials.length}</span>}
          </p>
          <GameMaterials gameId={g.id} campId={campId} items={materials} canEdit={!readOnly} />
        </section>
      </div>
    </div>
  )
}
