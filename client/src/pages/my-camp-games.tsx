// "Mes jeux" — for the étapistes (heads of a game) of a live Camp BP. Each game shows its formatted
// description so the étapiste can read it and explain the game during the camp, plus a printable PDF to take
// along (no internet needed on the field). Reached from the menu when user.isCampEtapiste.
import { useState } from 'react'
import { toast } from 'sonner'
import { useMyCampGames, printGame, type MyCampGameDto } from '@/services/camp-service'
import { useAuthStore } from '@/stores/auth-store'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { RichContent } from '@/components/public/rich-content'
import { Tent, Printer, Users } from 'lucide-react'

export default function MyCampGamesPage() {
  const { data: games, isLoading } = useMyCampGames()
  const me = useAuthStore((s) => s.user?.memberId)
  const [busy, setBusy] = useState<string | null>(null)

  const print = async (g: MyCampGameDto) => {
    setBusy(g.id)
    try { await printGame(g.id, g.name) } catch (e) { toast.error(parseApiError(e)) } finally { setBusy(null) }
  }

  if (isLoading) return <LoadingSpinner variant="table" />

  return (
    <Page size="narrow">
      <PageHeader title="Mes jeux" icon={Tent} description="Les jeux du camp dont vous êtes étapiste : lisez la description pour pouvoir expliquer le jeu." />
      {!games || games.length === 0 ? (
        <EmptyState icon={Tent} title="Aucun jeu" description="Vous n'êtes étapiste d'aucun jeu pour le moment." />
      ) : (
        <div className="space-y-4">
          {games.map((g) => {
            const others = g.etapistes.filter((e) => e.memberId !== me)
            return (
              <Card key={g.id}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">{g.campName}</p>
                      <h2 className="text-lg font-semibold">{g.name}</h2>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => print(g)} disabled={busy === g.id}>
                      <Printer className="mr-1.5 h-4 w-4" />{busy === g.id ? 'Préparation…' : 'Imprimer (PDF)'}
                    </Button>
                  </div>
                  {others.length > 0 && (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="h-4 w-4 shrink-0" />Avec : {others.map((e) => `${e.firstName} ${e.lastName}`).join(', ')}
                    </p>
                  )}
                  {g.description && g.description.replace(/<[^>]*>/g, '').trim()
                    ? <RichContent html={g.description} className="border-t pt-3 text-sm" />
                    : <p className="border-t pt-3 text-sm italic text-muted-foreground">La description de ce jeu n'a pas encore été rédigée.</p>}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </Page>
  )
}
