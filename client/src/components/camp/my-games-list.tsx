// The games the signed-in member runs as étapiste (live camps only): name, the other étapistes of THAT game,
// the main + bad-weather locations, and the formatted description — so they can explain the game at the camp.
// Each member only sees their own games (GET /camps/my-games). Used by the unit's Camp BP page (/camp) and by
// the standalone "Mes jeux" page (étapistes who don't have the Camp BP page, e.g. routiers).
import { useState } from 'react'
import { toast } from 'sonner'
import { useMyCampGames, printGame, useCampMatches, printScoreSheets, type MyCampGameDto } from '@/services/camp-service'
import { GameMaterials } from '@/components/camp/game-materials'
import { MatchList } from '@/components/camp/camp-scoring'
import { parseBlobError } from '@/lib/error-utils'
import { useAuthStore } from '@/stores/auth-store'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { RichContent } from '@/components/public/rich-content'
import { Tent, Printer, Users, MapPin, CloudRain, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'

// Main place + bad-weather place of a game (either may be unset).
export function GameLocations({ main, backup }: { main: string | null; backup: string | null }) {
  if (!main && !backup) return null
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {main && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 shrink-0 text-primary" />Lieu : <b>{main}</b></span>}
      {backup && <span className="flex items-center gap-1.5"><CloudRain className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />Si mauvais temps : <b>{backup}</b></span>}
    </div>
  )
}

// hideWhenEmpty: render nothing when the member runs no game (the Camp BP page shows it only to étapistes).
export function MyGamesList({ hideWhenEmpty = false }: { hideWhenEmpty?: boolean }) {
  const { data: games, isLoading } = useMyCampGames()
  const me = useAuthStore((s) => s.user?.memberId)
  const [busy, setBusy] = useState<string | null>(null)

  const print = async (g: MyCampGameDto) => {
    setBusy(g.id)
    try { await printGame(g.id, g.name) } catch (e) { toast.error(parseApiError(e)) } finally { setBusy(null) }
  }

  if (isLoading) return hideWhenEmpty ? null : <LoadingSpinner variant="table" />
  if (!games || games.length === 0)
    return hideWhenEmpty ? null : <EmptyState icon={Tent} title="Aucun jeu" description="Vous n'êtes étapiste d'aucun jeu pour le moment." />

  return (
    <div className="space-y-4">
      {games.map((g) => {
        const others = g.etapistes.filter((e) => e.memberId !== me)
        return (
          <Card key={g.id}>
            <CardContent className="space-y-3 py-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{g.campName} · votre jeu</p>
                  <h2 className="text-lg font-semibold">{g.name}</h2>
                </div>
                <Button size="sm" variant="outline" onClick={() => print(g)} disabled={busy === g.id}>
                  <Printer className="mr-1.5 h-4 w-4" />{busy === g.id ? 'Préparation…' : 'Imprimer (PDF)'}
                </Button>
              </div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="h-4 w-4 shrink-0" />
                {others.length > 0 ? <>Avec : {others.map((e) => `${e.firstName} ${e.lastName}`).join(', ')}</> : 'Vous êtes le seul étapiste de ce jeu.'}
              </p>
              <GameLocations main={g.mainLocation} backup={g.backupLocation} />
              {g.backupGameName && (
                <div className={cn('rounded-md border px-3 py-2 text-sm', g.useBackupLocations ? 'border-sky-300 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40' : 'bg-muted/40')}>
                  <p className="flex items-center gap-1.5 font-medium"><CloudRain className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                    Si mauvais temps (plan B), jouez : {g.backupGameName}{g.useBackupLocations && <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[11px] text-white">Plan B actif</span>}</p>
                  {g.backupGameDescription && g.backupGameDescription.replace(/<[^>]*>/g, '').trim() && <RichContent html={g.backupGameDescription} className="mt-1 text-sm" />}
                </div>
              )}
              {/* The étapiste can complete the material list of their own game. */}
              <GameMaterials gameId={g.id} campId={g.campId} items={g.materials ?? []} canEdit framed />
              {g.number != null && <GameScoring campId={g.campId} gameNumber={g.number} />}
              {g.description && g.description.replace(/<[^>]*>/g, '').trim()
                ? <RichContent html={g.description} className="border-t pt-3 text-sm" />
                : <p className="border-t pt-3 text-sm italic text-muted-foreground">La description de ce jeu n'a pas encore été rédigée.</p>}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// The étapiste's scoring of their game: the matches (one per time slot) with "Saisir" — or the paper sheet to fill
// by hand and hand over to the commission, who types it in later.
function GameScoring({ campId, gameNumber }: { campId: string; gameNumber: number }) {
  const [open, setOpen] = useState(false)
  const { data: matches, isLoading } = useCampMatches(campId, { game: gameNumber }, open)
  const done = (matches ?? []).filter(m => m.scoredAt).length
  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen(v => !v)} className="flex items-center gap-2 text-sm font-medium">
          <ClipboardList className="h-4 w-4 text-primary" />Pointage du jeu {gameNumber}{open && matches && <span className="font-normal text-muted-foreground">· {done}/{matches.length} saisis</span>}
        </button>
        <Button size="sm" variant="ghost" onClick={() => printScoreSheets(campId, gameNumber).catch(async e => toast.error(await parseBlobError(e)))}>
          <Printer className="mr-1 h-4 w-4" />Feuille papier
        </Button>
      </div>
      {open && <div className="border-t p-2">{isLoading ? <LoadingSpinner /> : <MatchList campId={campId} matches={matches ?? []} defaultSource="online" />}</div>}
    </div>
  )
}
