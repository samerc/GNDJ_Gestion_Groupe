import { useState } from 'react'
import { toast } from 'sonner'
import { useMyTrombinoscopes, viewMyTrombinoscope, type MyTrombinoscopeYear } from '@/services/my-profile-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Users, FileText, Building2 } from 'lucide-react'

// "Trombinoscope" — a member views the photo grid (PDF) of the unit(s) they belong(ed) to, one per scout
// year they were active. The PDF is generated server-side (photos embedded), scoped to units the member
// was actually in. A deliberate exception to the member-data lock: a member sees their co-members' photos.
export default function MyTrombinoscopePage() {
  const { data: years, isLoading } = useMyTrombinoscopes()
  const [busy, setBusy] = useState<string | null>(null)

  const view = async (t: MyTrombinoscopeYear) => {
    const key = `${t.scoutYear}|${t.unitId}`
    setBusy(key)
    try { await viewMyTrombinoscope(t.unitId, t.scoutYear) }
    catch (err) { toast.error(parseApiError(err)) }
    finally { setBusy(null) }
  }

  if (isLoading) return <LoadingSpinner variant="table" />

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Trombinoscope</h1>
          <p className="text-sm text-muted-foreground">La photo de votre unité, année par année.</p>
        </div>
      </div>

      {!years || years.length === 0 ? (
        <EmptyState icon={Users} title="Aucun trombinoscope" description="Votre trombinoscope apparaîtra ici une fois que vous serez affecté à une unité." />
      ) : (
        <div className="space-y-3">
          {years.map(t => {
            const key = `${t.scoutYear}|${t.unitId}`
            return (
              <Card key={key}>
                <CardContent className="flex flex-wrap items-center gap-3 py-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{t.scoutYear}</p>
                    <p className="text-sm text-muted-foreground">{t.unitName}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => view(t)} disabled={busy === key}>
                    <FileText className="mr-1.5 h-4 w-4" />{busy === key ? 'Ouverture…' : 'Voir'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
