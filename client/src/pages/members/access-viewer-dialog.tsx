// Effective-access viewer ("Voir les accès") — read-only. Master/detail: a compact list of domaines (each with
// a level Voir / Gérer / Complet) on the left, and the exact actions + their source (fonction / accès délégué /
// super-admin) for the selected domaine on the right (below the list on mobile). Mirrors the union the login
// token is built from, so it reflects reality. Visible to any group manager (maitrise.manage / super-admin).
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { useMemberEffectiveAccess, type MemberEffectiveAccess, type AccessDomain } from '@/services/member-service'
import { cn } from '@/lib/utils'
import { Crown, MapPin, TriangleAlert, ChevronRight } from 'lucide-react'

// One-word domaine level → pill styling (left list).
function levelPill(level: string) {
  if (level === 'complet') return { label: 'Complet', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' }
  if (level === 'gerer') return { label: 'Gérer', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300' }
  return { label: 'Voir', cls: 'bg-muted text-muted-foreground' }
}

// A source name tag shown next to each action (words, not numbers). Délégué = primary, super-admin = amber.
function SourceTag({ label, kind }: { label: string; kind: string }) {
  const cls = kind === 'superadmin'
    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
    : kind === 'delegation'
      ? 'bg-primary/15 text-primary'
      : 'bg-muted text-muted-foreground'
  return <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', cls)}>{label}</span>
}

// The right pane (or, on mobile, the block under the list): the selected domaine's exact actions + sources.
function DomainDetail({ domain, data }: { domain: AccessDomain; data: MemberEffectiveAccess }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{domain.label}</p>
      <div className="space-y-1.5">
        {domain.permissions.map(p => (
          <div key={p.key} className="flex items-center justify-between gap-2 text-sm">
            <span>{p.label}</span>
            <span className="flex shrink-0 flex-wrap justify-end gap-1">
              {p.sources.map(si => {
                const s = data.sources[si]
                return s ? <SourceTag key={si} label={s.label} kind={s.kind} /> : null
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AccessViewerDialog({ memberId, memberName, open, onOpenChange }: {
  memberId: string; memberName: string; open: boolean; onOpenChange: (v: boolean) => void
}) {
  const { data, isLoading } = useMemberEffectiveAccess(memberId, open)
  const [selected, setSelected] = useState<string | null>(null)

  // Selected domaine = the user's pick if it still exists (guards a stale key when switching members), else the
  // first domaine. Derived (no effect needed).
  const selectedKey = data && (selected && data.domains.some(d => d.key === selected) ? selected : data.domains[0]?.key)
  const selectedDomain = data?.domains.find(d => d.key === selectedKey)

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

        {isLoading || !data ? <LoadingSpinner variant="form" /> : data.isSuperAdmin ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
            <Crown className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
            <p className="text-sm"><span className="font-medium">Super-administrateur</span> — accès total à toutes les fonctionnalités et toutes les unités.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Scope */}
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">Agit sur :</span>
              <span className="font-medium">
                {data.allUnits ? 'toutes les unités' : data.unitLabels.length ? data.unitLabels.join(' · ') : 'aucune unité'}
              </span>
            </div>

            {/* maitrise.manage master-key note (honest until the coupling is removed in a later step) */}
            {data.maitriseManageBypass && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs dark:border-amber-900 dark:bg-amber-950/40">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
                <span>Détient <span className="font-medium">maîtrise.manage</span> : accès à toutes les fiches membres, quel que soit le niveau « Membres » réglé par domaine.</span>
              </div>
            )}

            {data.domains.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun accès de gestion — cette personne ne voit que sa propre fiche.</p>
            ) : (
              <div className="md:flex md:gap-4">
                {/* Left: domaines with a level. Selecting one shows its actions (right on desktop, below on mobile). */}
                <div className="md:w-56 md:shrink-0 space-y-1">
                  {data.domains.map(dom => {
                    const pill = levelPill(dom.level)
                    const active = dom.key === selectedKey
                    return (
                      <div key={dom.key}>
                        <button
                          type="button"
                          onClick={() => setSelected(dom.key)}
                          className={cn('flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm',
                            active ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted')}
                        >
                          <span className="flex items-center gap-1 truncate">
                            <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', active && 'rotate-90')} />
                            {dom.label}
                          </span>
                          <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium', pill.cls)}>{pill.label}</span>
                        </button>
                        {/* Mobile: the selected domaine's detail opens inline right under its row. */}
                        {active && (
                          <div className="mt-1 mb-2 rounded-md border bg-muted/30 p-3 md:hidden">
                            <DomainDetail domain={dom} data={data} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Desktop: the detail pane on the right. */}
                <div className="hidden flex-1 border-l pl-4 md:block">
                  {selectedDomain && <DomainDetail domain={selectedDomain} data={data} />}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
