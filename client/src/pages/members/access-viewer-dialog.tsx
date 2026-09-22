// Effective-access viewer ("Voir les accès") — read-only. Shows exactly what a member can do and WHERE each
// piece comes from (fonction / accès délégué / super-admin), grouped by domain. Mirrors the union the login
// token is built from, so it reflects reality. Visible to any group manager (maitrise.manage / super-admin).
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { useMemberEffectiveAccess, type AccessSource } from '@/services/member-service'
import { cn } from '@/lib/utils'
import { Crown, Shield, ShieldCheck, MapPin, TriangleAlert } from 'lucide-react'

// Colour + icon per source kind, reused by the legend and the little per-permission source badges.
function sourceStyle(kind: string) {
  if (kind === 'superadmin') return { icon: Crown, badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' }
  if (kind === 'delegation') return { icon: ShieldCheck, badge: 'bg-primary/15 text-primary' }
  return { icon: Shield, badge: 'bg-muted text-muted-foreground' } // fonction
}

// A tiny numbered badge pointing back to a source in the legend (e.g. ② = "via the ACG fonction").
function SourceBadge({ index, kind }: { index: number; kind: string }) {
  return (
    <span className={cn('inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none', sourceStyle(kind).badge)}>
      {index + 1}
    </span>
  )
}

export function AccessViewerDialog({ memberId, memberName, open, onOpenChange }: {
  memberId: string; memberName: string; open: boolean; onOpenChange: (v: boolean) => void
}) {
  const { data, isLoading } = useMemberEffectiveAccess(memberId, open)

  const sourceKind = (i: number): string => data?.sources[i]?.kind ?? 'fonction'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Accès effectifs — {memberName}</DialogTitle>
          <DialogDescription>
            Ce que cette personne peut faire, et d'où vient chaque accès. Reflète ce qui est appliqué à sa
            prochaine connexion.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? <LoadingSpinner variant="form" /> : (
          <div className="space-y-4">
            {/* Super-admin: everything — no point listing 50 permissions. */}
            {data.isSuperAdmin ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
                <Crown className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                <p className="text-sm"><span className="font-medium">Super-administrateur</span> — accès total à toutes les fonctionnalités et toutes les unités.</p>
              </div>
            ) : (
              <>
                {/* Scope */}
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">Agit sur :</span>
                  <span className="font-medium">
                    {data.allUnits ? 'toutes les unités' : data.unitLabels.length ? data.unitLabels.join(' · ') : 'aucune unité'}
                  </span>
                </div>

                {/* maitrise.manage master-key note (honest until the coupling is removed) */}
                {data.maitriseManageBypass && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs dark:border-amber-900 dark:bg-amber-950/40">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
                    <span>Détient <span className="font-medium">maîtrise.manage</span> : accès à toutes les fiches membres, quel que soit le niveau « Membres » réglé par domaine.</span>
                  </div>
                )}

                {/* Sources legend */}
                {data.sources.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border p-3">
                    <p className="text-xs font-medium text-muted-foreground">D'où viennent ces accès</p>
                    {data.sources.map((s: AccessSource, i: number) => {
                      const St = sourceStyle(s.kind)
                      return (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <SourceBadge index={i} kind={s.kind} />
                          <St.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="font-medium">{s.label}</span>
                          {s.detail && <span className="text-xs text-muted-foreground">— {s.detail}</span>}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Permissions grouped by domain, each with its source badge(s) */}
                {data.domains.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun accès de gestion — cette personne ne voit que sa propre fiche.</p>
                ) : (
                  <div className="space-y-3">
                    {data.domains.map(dom => (
                      <div key={dom.key}>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{dom.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {dom.permissions.map(p => (
                            <span key={p.key} className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs">
                              {p.label}
                              <span className="inline-flex gap-0.5">
                                {p.sources.map(si => <SourceBadge key={si} index={si} kind={sourceKind(si)} />)}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
