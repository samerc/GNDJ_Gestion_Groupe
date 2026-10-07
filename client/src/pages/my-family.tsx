// « Ma famille » — the signed-in member and their confirmed brothers and sisters on one screen, each with what is
// left to do this year (coordonnées, documents, cotisation). « Ouvrir son compte » switches account in one tap
// when no password is needed (same main email, no chef account), else asks that account's password once
// (useSiblingSwitch). A chef's account (maîtrise) shows the name only.
import { Link } from 'react-router'
import { CheckCircle2, AlertTriangle, Users, ShieldCheck, ArrowRight, UserRound } from 'lucide-react'
import { useMyFamily, useSwitchAccounts, type FamilyChild } from '@/services/my-profile-service'
import { useSiblingSwitch } from '@/hooks/use-sibling-switch'
import { todoLeft } from '@/lib/my-todo'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'

export default function MyFamilyPage() {
  const { data: family, isLoading } = useMyFamily()
  // Usernames for the password dialog come from the switch list (same confirmed siblings).
  const { data: accounts } = useSwitchAccounts()
  const { switchTo, switchingId, dialog } = useSiblingSwitch()

  const open = (c: FamilyChild) => {
    const acc = accounts?.find((a) => a.memberId === c.memberId)
    if (acc) void switchTo({ ...acc, passwordless: c.passwordless })
  }

  return (
    <Page size="narrow">
      <PageHeader title="Ma famille" icon={Users}
        description="Vos frères et sœurs inscrits au groupe, et ce qu'il reste à faire pour chacun cette année." />

      {isLoading ? (
        <LoadingSpinner variant="cards" />
      ) : !family || family.length === 0 ? (
        <EmptyState icon={Users} title="Aucun frère ou sœur relié"
          description="Quand le groupe aura relié les frères et sœurs de votre famille, vous les verrez ici." />
      ) : (
        <div className="space-y-3">
          {family.map((c) => {
            const left = c.todo ? todoLeft(c.todo) : []
            const canOpen = !c.isMe && c.hasLogin && accounts?.some((a) => a.memberId === c.memberId)
            return (
              <Card key={c.memberId} className={cn(c.isMe && 'border-primary/40')}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <UserRound className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {c.name}
                      {c.isMe && <Badge variant="secondary" className="ml-2 align-middle">Vous</Badge>}
                    </p>
                    {c.unitName && <p className="text-sm text-muted-foreground">{c.unitName}</p>}
                    {c.todo?.onHold ? (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-red-700 dark:text-red-400">
                        <AlertTriangle className="h-4 w-4 shrink-0" />Inscription suspendue : dossier incomplet.
                      </p>
                    ) : c.todo ? (
                      left.length === 0 ? (
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />Tout est en ordre.
                        </p>
                      ) : (
                        <p className="mt-1 flex items-start gap-1.5 text-sm text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>À faire : {left.join(', ')}.</span>
                        </p>
                      )
                    ) : (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <ShieldCheck className="h-4 w-4 shrink-0" />Compte de chef : son mot de passe est demandé.
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {c.isMe ? (
                      <Button size="sm" variant="outline" asChild><Link to="/my-profile">Ma fiche</Link></Button>
                    ) : canOpen ? (
                      <Button size="sm" variant={left.length > 0 ? 'default' : 'outline'}
                        disabled={switchingId === c.memberId} onClick={() => open(c)}>
                        {switchingId === c.memberId ? 'Ouverture…' : <>Ouvrir son compte<ArrowRight className="ml-1.5 h-4 w-4" /></>}
                      </Button>
                    ) : !c.hasLogin ? (
                      <span className="text-xs text-muted-foreground">Pas de compte</span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
      {dialog}
    </Page>
  )
}
