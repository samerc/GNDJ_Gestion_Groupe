import { useState } from 'react'
import { Link } from 'react-router'
import {
  useRentreeTemplates, useSaveRentreeTemplate, useDeleteRentreeTemplate, useReorderRentreeTemplates,
  type RentreeTemplate,
} from '@/services/rentree-service'
import { useMembers } from '@/services/member-service'
import { useDebounce } from '@/hooks/use-debounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { RequiredLabel } from '@/components/shared/required-label'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { cn } from '@/lib/utils'
import { parseApiError } from '@/lib/error-utils'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, ArrowLeft, X, Users } from 'lucide-react'
import { toast } from 'sonner'

const ROLES = [
  { value: 'chef-de-groupe', label: 'Chef de Groupe' },
  { value: 'chef-unite', label: "Chef d'unité" },
  { value: 'assistant-de-groupe', label: 'Assistant de Groupe' },
  { value: 'read-only', label: 'Membre' },
]
const ROLE_LABEL = (v: string | null) => ROLES.find(r => r.value === v)?.label ?? v ?? '—'

type Form = {
  id: string | null; title: string; description: string; phase: string
  assigneeType: string; assigneeRole: string; fanOutPerUnit: boolean
  assigneeMemberIds: string[]; assigneeMemberNames: string[]
  defaultDeadlineLabel: string; dependsOnTemplateIds: string[]
}
const blank: Form = {
  id: null, title: '', description: '', phase: '', assigneeType: 'role', assigneeRole: 'chef-unite',
  fanOutPerUnit: true, assigneeMemberIds: [], assigneeMemberNames: [], defaultDeadlineLabel: '', dependsOnTemplateIds: [],
}

export default function RentreeTemplatePage() {
  const { data: templates, isLoading } = useRentreeTemplates()
  const save = useSaveRentreeTemplate()
  const del = useDeleteRentreeTemplate()
  const reorder = useReorderRentreeTemplates()

  const [form, setForm] = useState<Form | null>(null)
  const [deleting, setDeleting] = useState<RentreeTemplate | null>(null)
  const [memberSearch, setMemberSearch] = useState('')
  const debounced = useDebounce(memberSearch)
  const { data: memberResults } = useMembers({ search: debounced || undefined, pageSize: 8 })

  const phases = [...new Set((templates ?? []).map(t => t.phase))]

  const openNew = () => setForm({ ...blank, phase: phases[0] ?? 'Configuration' })
  const openEdit = (t: RentreeTemplate) => setForm({
    id: t.id, title: t.title, description: t.description ?? '', phase: t.phase,
    assigneeType: t.assigneeType, assigneeRole: t.assigneeRole ?? 'chef-unite', fanOutPerUnit: t.fanOutPerUnit,
    assigneeMemberIds: t.assigneeMemberIds, assigneeMemberNames: t.assigneeMemberNames,
    defaultDeadlineLabel: t.defaultDeadlineLabel ?? '', dependsOnTemplateIds: t.dependsOnTemplateIds,
  })

  const submit = async () => {
    if (!form) return
    try {
      await save.mutateAsync({
        id: form.id, title: form.title, description: form.description || null, phase: form.phase,
        assigneeType: form.assigneeType, assigneeRole: form.assigneeType === 'role' ? form.assigneeRole : null,
        fanOutPerUnit: form.assigneeType === 'role' && form.fanOutPerUnit,
        assigneeMemberIds: form.assigneeType === 'members' ? form.assigneeMemberIds : [],
        defaultDeadlineLabel: form.defaultDeadlineLabel || null, dependsOnTemplateIds: form.dependsOnTemplateIds,
      })
      toast.success('Modèle enregistré'); setForm(null)
    } catch (err) { toast.error(parseApiError(err)) }
  }

  const move = async (idx: number, dir: -1 | 1) => {
    if (!templates) return
    const arr = [...templates]
    const j = idx + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
    try { await reorder.mutateAsync(arr.map(t => t.id)) } catch (err) { toast.error(parseApiError(err)) }
  }

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner /></div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Modèle de rentrée</h1>
          <p className="text-sm text-muted-foreground">Les tâches type générées chaque année. Définissez responsables, échéances et dépendances.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild><Link to="/rentree"><ArrowLeft className="mr-1 h-4 w-4" />Liste</Link></Button>
          <Button size="sm" onClick={openNew}><Plus className="mr-1 h-4 w-4" />Ajouter</Button>
        </div>
      </div>

      <div className="space-y-1.5">
        {(templates ?? []).map((t, idx) => (
          <div key={t.id} className="flex items-center gap-2 rounded-lg border p-2.5">
            <div className="flex flex-col">
              <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={idx === 0} onClick={() => move(idx, -1)}><ChevronUp className="h-3.5 w-3.5" /></button>
              <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={idx === (templates!.length - 1)} onClick={() => move(idx, 1)}><ChevronDown className="h-3.5 w-3.5" /></button>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">{t.phase}</span>
                <p className="truncate text-sm font-medium">{t.title}</p>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>{t.assigneeType === 'members' ? (t.assigneeMemberNames.join(', ') || 'Membres') : ROLE_LABEL(t.assigneeRole)}{t.fanOutPerUnit && ' · par unité'}</span>
                {t.defaultDeadlineLabel && <span>· {t.defaultDeadlineLabel}</span>}
                {t.dependsOnTemplateIds.length > 0 && <span>· {t.dependsOnTemplateIds.length} dépendance(s)</span>}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(t)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
        {(templates ?? []).length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Aucune tâche dans le modèle.</p>}
      </div>

      {/* Add/Edit dialog */}
      <Dialog open={!!form} onOpenChange={() => setForm(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form?.id ? 'Modifier la tâche' : 'Nouvelle tâche'}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1"><RequiredLabel required>Titre</RequiredLabel><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
              <div className="space-y-1"><RequiredLabel>Description</RequiredLabel><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><RequiredLabel required>Phase</RequiredLabel>
                  <Input list="phases" value={form.phase} onChange={e => setForm({ ...form, phase: e.target.value })} placeholder="Configuration…" />
                  <datalist id="phases">{phases.map(p => <option key={p} value={p} />)}</datalist>
                </div>
                <div className="space-y-1"><RequiredLabel>Échéance (texte)</RequiredLabel><Input value={form.defaultDeadlineLabel} onChange={e => setForm({ ...form, defaultDeadlineLabel: e.target.value })} placeholder="1ʳᵉ sem. octobre" /></div>
              </div>

              <div className="space-y-1"><RequiredLabel required>Responsable</RequiredLabel>
                <Select value={form.assigneeType} onValueChange={v => setForm({ ...form, assigneeType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="role">Un rôle</SelectItem><SelectItem value="members">Des membres précis</SelectItem></SelectContent>
                </Select>
              </div>

              {form.assigneeType === 'role' ? (
                <div className="grid grid-cols-2 items-end gap-3">
                  <div className="space-y-1"><RequiredLabel>Rôle</RequiredLabel>
                    <Select value={form.assigneeRole} onValueChange={v => setForm({ ...form, assigneeRole: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={form.fanOutPerUnit} onChange={e => setForm({ ...form, fanOutPerUnit: e.target.checked })} />Une tâche par unité</label>
                </div>
              ) : (
                <div className="space-y-1">
                  <RequiredLabel>Membres</RequiredLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {form.assigneeMemberIds.map((id, i) => (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs">
                        {form.assigneeMemberNames[i] ?? '?'}
                        <button onClick={() => setForm({ ...form, assigneeMemberIds: form.assigneeMemberIds.filter(x => x !== id), assigneeMemberNames: form.assigneeMemberNames.filter((_, j) => j !== i) })}><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                  <Input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Rechercher un membre…" />
                  {debounced && memberResults && (
                    <div className="max-h-40 overflow-y-auto rounded-md border text-sm">
                      {memberResults.items.filter(m => !form.assigneeMemberIds.includes(m.id)).map(m => (
                        <button key={m.id} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted"
                          onClick={() => { setForm({ ...form, assigneeMemberIds: [...form.assigneeMemberIds, m.id], assigneeMemberNames: [...form.assigneeMemberNames, `${m.firstName} ${m.lastName}`] }); setMemberSearch('') }}>
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />{m.lastName} {m.firstName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Dependencies */}
              <div className="space-y-1">
                <RequiredLabel>Dépend de (tâches préalables)</RequiredLabel>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                  {(templates ?? []).filter(t => t.id !== form.id).map(t => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={form.dependsOnTemplateIds.includes(t.id)}
                        onChange={e => setForm({ ...form, dependsOnTemplateIds: e.target.checked ? [...form.dependsOnTemplateIds, t.id] : form.dependsOnTemplateIds.filter(x => x !== t.id) })} />
                      <span className={cn('truncate', form.dependsOnTemplateIds.includes(t.id) && 'font-medium')}>{t.title}</span>
                    </label>
                  ))}
                  {(templates ?? []).filter(t => t.id !== form.id).length === 0 && <p className="text-xs text-muted-foreground">Aucune autre tâche.</p>}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Annuler</Button>
            <Button onClick={submit} disabled={save.isPending}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} title="Supprimer la tâche du modèle"
        description={`Supprimer « ${deleting?.title} » ? (n'affecte pas les listes déjà générées)`} confirmLabel="Supprimer" variant="destructive"
        onConfirm={async () => { if (deleting) { try { await del.mutateAsync(deleting.id); toast.success('Supprimée'); setDeleting(null) } catch (err) { toast.error(parseApiError(err)) } } }} />
    </div>
  )
}
