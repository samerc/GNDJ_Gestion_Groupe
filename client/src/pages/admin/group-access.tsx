// Admin "Accès maîtrise" screen (CG-only, perm roles.manage_group). One card per group-maîtrise
// function (CG, ACG, AUG, SG, …); for each, the CG sets the access level (Aucun / Lecture / Complet)
// per area (Membres, Demandes, Cotisations, …). The head Chef de Groupe is fixed at full access
// (fn.editable === false → read-only card). Backend lazy-forks the function to its own group-level
// profile on first save and caps grants to what the editor holds (non-delegatable perms never given).
import { useState, useMemo, useEffect } from 'react'
import { useGroupFunctionAccess, useSetGroupFunctionAccess, type GroupFunctionAccessDto } from '@/services/role-service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { ShieldCheck, Save } from 'lucide-react'
import { toast } from 'sonner'

const LEVELS = [
  { value: 'aucun', label: 'Aucun' },
  { value: 'lecture', label: 'Lecture' },
  { value: 'complet', label: 'Complet' },
]

export default function GroupAccessPage() {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Accès de la maîtrise de groupe</h1>
        <p className="text-sm text-muted-foreground">
          Définissez, pour chaque fonction de la maîtrise de groupe, le niveau d'accès par domaine
          (Aucun · Lecture · Complet). Le Chef de Groupe garde l'accès complet.
        </p>
      </div>

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
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            {fn.areas.map(a => (
              <div key={a.key} className="flex items-center justify-between gap-2">
                <span className="text-sm">{a.label}</span>
                <Select value={levels[a.key]} onValueChange={(v) => setLevels(prev => ({ ...prev, [a.key]: v }))}>
                  <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
