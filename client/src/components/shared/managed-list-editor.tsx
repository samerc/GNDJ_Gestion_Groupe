import { useState } from 'react'
import {
  useListValueUsage, useAddListValue, useRenameListValue, useArchiveListValue, useUnarchiveListValue,
} from '@/services/settings-service'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { Search, X, Check, Users, Pencil, Trash2, ArchiveRestore } from 'lucide-react'
import { toast } from 'sonner'

// Editor for free-text json_array lists (schools/classes/cities/profession domains). Unlike a plain
// pill/table editor, every action here is IMMEDIATE (it can touch member data, so it can't be staged behind
// a Save button): inline RENAME cascades onto the records holding the old value, DELETE archives an in-use
// value (kept on those records, restorable) or hard-removes an unused one, and each row shows its live usage
// count. Un-managed free lists still work — they just report 0 usage and always hard-delete.
//
// Shared by the CG-accessible "Listes gérées" page (écoles/classes/villes) and the super-admin Settings page
// (profession domains). All operations go through the /settings/list-value/* endpoints, which are gated on
// maitrise.manage but server-side restrict a non-super-admin to the member-data lists (écoles/classes/villes).
export function ManagedListEditor({ settingKey }: { settingKey: string }) {
  const { data, isLoading } = useListValueUsage(settingKey)
  const addValue = useAddListValue()
  const rename = useRenameListValue()
  const archive = useArchiveListValue()
  const unarchive = useUnarchiveListValue()

  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<string | null>(null) // value currently being renamed
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ value: string; count: number } | null>(null)

  const active = data?.active ?? []
  const archived = data?.archived ?? []
  const f = filter.trim().toLowerCase()
  const shown = f ? active.filter((i) => i.value.toLowerCase().includes(f)) : active

  const add = async () => {
    const v = adding.trim()
    if (!v) return
    if (active.some((a) => a.value.toLowerCase() === v.toLowerCase())) { toast.error('Cette valeur existe déjà.'); return }
    try { await addValue.mutateAsync({ key: settingKey, value: v }); setAdding(''); toast.success('Valeur ajoutée') }
    catch (err) { toast.error(parseApiError(err)) }
  }

  const saveRename = async (oldValue: string) => {
    const nv = draft.trim()
    if (!nv || nv === oldValue) { setEditing(null); return }
    try {
      const r = await rename.mutateAsync({ key: settingKey, oldValue, newValue: nv })
      toast.success(r.affected > 0 ? `Renommé — ${r.affected} fiche(s) mise(s) à jour` : 'Valeur renommée')
      setEditing(null)
    } catch (err) { toast.error(parseApiError(err)) }
  }

  const doDelete = async () => {
    if (!pendingDelete) return
    try {
      const r = await archive.mutateAsync({ key: settingKey, value: pendingDelete.value })
      toast.success(r.archived ? 'Valeur archivée (conservée sur les fiches concernées)' : 'Valeur supprimée')
    } catch (err) { toast.error(parseApiError(err)) }
    finally { setPendingDelete(null) }
  }

  const doUnarchive = async (value: string) => {
    try { await unarchive.mutateAsync({ key: settingKey, value }); toast.success('Valeur réactivée') }
    catch (err) { toast.error(parseApiError(err)) }
  }

  if (isLoading) return <LoadingSpinner variant="table" />

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{active.length} valeur{active.length > 1 ? 's' : ''}</span>
        {active.length > 8 && (
          <div className="relative w-full max-w-[16rem]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Filtrer la liste..." value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-9 pr-8" />
            {filter && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setFilter('')}><X className="h-3.5 w-3.5" /></button>}
          </div>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {shown.map((item) => (
              <tr key={item.value} className="hover:bg-muted/40">
                <td className="px-3 py-2">
                  {editing === item.value ? (
                    <div className="flex items-center gap-2">
                      <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveRename(item.value) } if (e.key === 'Escape') setEditing(null) }}
                        className="h-8 max-w-xs" />
                      <Tip content="Enregistrer"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={rename.isPending} onClick={() => saveRename(item.value)}><Check className="h-4 w-4 text-primary" /></Button></Tip>
                      <Tip content="Annuler"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button></Tip>
                    </div>
                  ) : (
                    <span>{item.value}</span>
                  )}
                </td>
                <td className="w-24 px-2 py-1 text-right">
                  {item.count > 0 && (
                    <Tip content={`${item.count} fiche(s) utilisent cette valeur`}>
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"><Users className="h-3 w-3" />{item.count}</span>
                    </Tip>
                  )}
                </td>
                <td className="w-20 px-2 py-1 text-right">
                  {editing !== item.value && (
                    <div className="flex justify-end gap-0.5">
                      <Tip content="Renommer"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(item.value); setDraft(item.value) }}><Pencil className="h-4 w-4" /></Button></Tip>
                      <Tip content={item.count > 0 ? 'Archiver (conservée sur les fiches)' : 'Supprimer'}><Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPendingDelete({ value: item.value, count: item.count })}><Trash2 className="h-4 w-4 text-destructive" /></Button></Tip>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">{f ? 'Aucun résultat' : 'Aucune valeur'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Input value={adding} onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="Ajouter une valeur..." className="max-w-xs" />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!adding.trim() || addValue.isPending}>Ajouter</Button>
      </div>

      {/* Archived values — hidden from pickers, still shown on the records that hold them, restorable. */}
      {archived.length > 0 && (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Valeurs archivées ({archived.length}) — masquées des listes, conservées sur les fiches</p>
          <div className="flex flex-wrap gap-2">
            {archived.map((item) => (
              <span key={item.value} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-sm">
                <span className="text-muted-foreground">{item.value}</span>
                {item.count > 0 && <span className="text-xs text-muted-foreground">· {item.count}</span>}
                <Tip content="Réactiver"><button type="button" onClick={() => doUnarchive(item.value)} className="text-primary hover:text-primary/80"><ArchiveRestore className="h-3.5 w-3.5" /></button></Tip>
              </span>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null) }}
        title={pendingDelete && pendingDelete.count > 0 ? 'Archiver cette valeur ?' : 'Supprimer cette valeur ?'}
        description={pendingDelete && pendingDelete.count > 0
          ? `« ${pendingDelete.value} » est utilisée par ${pendingDelete.count} fiche(s). Elle sera retirée des listes déroulantes mais conservée sur ces fiches, et pourra être réactivée.`
          : `« ${pendingDelete?.value} » sera définitivement retirée de la liste.`}
        confirmLabel={pendingDelete && pendingDelete.count > 0 ? 'Archiver' : 'Supprimer'}
        variant="destructive"
        loading={archive.isPending}
        onConfirm={doDelete}
      />
    </div>
  )
}
