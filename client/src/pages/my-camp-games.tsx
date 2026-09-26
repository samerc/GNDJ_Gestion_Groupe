// "Mes jeux" — for étapistes who don't have the unit Camp BP page (e.g. routiers / caravelles / JEM): their
// games with the description, the other étapistes and the locations. Leaders see the same block at the top of
// their unit's Camp BP page (/camp). Reached from the menu when user.isCampEtapiste.
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { MyGamesList } from '@/components/camp/my-games-list'
import { Tent } from 'lucide-react'

export default function MyCampGamesPage() {
  return (
    <Page size="narrow">
      <PageHeader title="Mes jeux" icon={Tent} description="Les jeux du camp dont vous êtes étapiste : lisez la description pour pouvoir expliquer le jeu." />
      <MyGamesList />
    </Page>
  )
}
