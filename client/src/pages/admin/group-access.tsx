// Admin "Fonctions" screen (a tab of the "Accès & permissions" hub, perm roles.manage_group). One card per
// group-maîtrise function (CG, ACG, AUG, SG, …); for each, the CG sets the access level (Aucun / Lecture /
// Complet) per domaine (Membres, Demandes, Cotisations, …) via the shared AreaLevels editor. The head Chef de
// Groupe is fixed at full access (fn.editable === false → read-only card). Backend lazy-forks the function to
// its own group-level profile on first save and caps grants to what the editor holds.
import { useState, useMemo, useEffect } from 'react'
import { useGroupFunctionAccess, useSetGroupFunctionAccess, type GroupFunctionAccessDto } from '@/services/role-service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { AreaLevels } from '@/components/admin/permission-editor'
import { parseApiError } from '@/lib/error-utils'
import { ShieldCheck, Save } from 'lucide-react'
import { toast } from 'sonner'

// `embedded` = rendered inside the "Accès & permissions" hub (its own title/tabs own the header), so we
// suppress this page's standalone header.
export default function GroupAccessPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { data: functions, isLoading } = useGroupFunctionAccess()
  // Track which function cards have unsaved edits so we can warn before the page is unloaded.
  const [dirtyCards, setDirtyCards] = useState<Set<string>>(new Set())
  const setCardDirty = (id: string, isDirty: boolean) =>
    setDirtyCards(prev => {
      if (isDirty === prev.has(id)) return prev
      const next = new Set(prev)
      if (isDirty) next.add(id); else next.delete(id)
      return next
    })

  // Native beforeunload guard: warns on tab close / refresh / external nav while any card is dirty.
  useEffect(() => {
    if (dirtyCards.size === 0) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirtyCards.size])

  if (isLoading) return <LoadingSpinner variant="table" />

  return (
    <div className="space-y-4">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold">Accès par fonction</h1>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Pour chaque fonction de la maîtrise de groupe, réglez le niveau d'accès par domaine
        (Aucun · Lecture · Complet). Le Chef de Groupe garde l'accès complet. Pour accorder un accès à
        <span className="font-medium"> une personne précise</span> (sans rôle), utilisez l'onglet « Membres ».
      </p>

      {(!functions || functions.length === 0) && (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Aucune fonction de maîtrise de groupe.</CardContent></Card>
      )}

      <div className="space-y-4">
        {functions?.map(fn => <FunctionAccessCard key={fn.functionalRoleId} fn={fn} onDirtyChange={setCardDirty} />)}
      </div>
    </div>
  )
}

function FunctionAccessCard({ fn, onDirtyChange }: { fn: GroupFunctionAccessDto; onDirtyChange: (id: string, dirty: boolean) => void }) {
  const setMutation = useSetGroupFunctionAccess()
  // area key → level, snapshotted from the server; `levels` is the editable working copy.
  const initial = useMemo(() => Object.fromEntries(fn.areas.map(a => [a.key, a.level])) as Record<string, string>, [fn])
  const [levels, setLevels] = useState<Record<string, string>>(initial)

  const dirty = fn.areas.some(a => levels[a.key] !== initial[a.key]) // any area changed → show Save

  // Report this card's dirty state up so the page can guard against navigating away with unsaved edits.
  useEffect(() => {
    onDirtyChange(fn.functionalRoleId, dirty)
    return () => onDirtyChange(fn.functionalRoleId, false)
  }, [dirty, fn.functionalRoleId, onDirtyChange])

  const save = async () => {
    try {
      await setMutation.mutateAsync({ functionalRoleId: fn.functionalRoleId, areaLevels: levels })
      toast.success(`Accès de « ${fn.name} » enregistré`)
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            {fn.name}
            {!fn.editable && <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" />Accès complet</Badge>}
          </CardTitle>
          {fn.editable && dirty && (
            <Button size="sm" onClick={save} disabled={setMutation.isPending}>
              <Save className="mr-1 h-4 w-4" />{setMutation.isPending ? '...' : 'Enregistrer'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!fn.editable ? (
          <p className="text-sm text-muted-foreground">Le Chef de Groupe dispose de l'accès complet à toute la gestion du groupe.</p>
        ) : (
          <AreaLevels areas={fn.areas} levels={levels} onChange={(key, v) => setLevels(prev => ({ ...prev, [key]: v }))} />
        )}
      </CardContent>
    </Card>
  )
}
