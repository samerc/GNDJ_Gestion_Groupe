// "Groupes" — admin page (CG/ACG/super-admin, perm maitrise.manage) to create reusable rule-based member groups
// (Grande Maîtrise, Chefs d'unité, "Haute Patrouille", …). A group = a scope (whole group / branch / unit) + a
// set of membership rules (union of includes, minus excludes), resolved live. Used as réunion scopes today.
import { useState } from 'react'
import {
  useMemberGroups, useCreateMemberGroup, useUpdateMemberGroup, useDeleteMemberGroup,
  GROUP_SCOPES, GROUP_SCOPE_LABELS, GROUP_CRITERIA, CRITERION_LABELS,
  type MemberGroupDto, type MemberGroupRuleDto,
} from '@/services/member-group-service'
import { useUnits } from '@/services/unit-service'
import { useUnitTypes } from '@/services/unit-type-service'
import { useFunctionalRoles, useSecurityProfiles } from '@/services/role-service'
import { useMembers } from '@/services/member-service'
import { useDebounce } from '@/hooks/use-debounce'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { parseApiError } from '@/lib/error-utils'
import { Plus, Users, Pencil, Trash2, ShieldCheck, X, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

export default function MemberGroupsPage() {
  const { data: groups, isLoading } = useMemberGroups()
  const [editing, setEditing] = useState<MemberGroupDto | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<MemberGroupDto | null>(null)
  const del = useDeleteMemberGroup()

  const remove = async () => {
    if (!deleting) return
    try { await del.mutateAsync(deleting.id); toast.success('Groupe supprimé'); setDeleting(null) }
    catch (e) { toast.error(parseApiError(e)); setDeleting(null) }
  }

  if (isLoading) return <LoadingSpinner variant="table" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Groupes</h1>
          <p className="text-sm text-muted-foreground">
            Groupes de membres définis par des règles (Grande Maîtrise, Chefs d'unité, Haute Patrouille…). Utilisables comme portée de réunion.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" />Nouveau groupe</Button>
      </div>

      {(!groups || groups.length === 0) ? (
        <EmptyState icon={Users} title="Aucun groupe" description="Créez un groupe pour l'utiliser dans les réunions." />
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <Card key={g.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {g.name}
                    {g.isSystem && <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" />Prédéfini</Badge>}
                    {!g.isVisible && <Badge variant="secondary" className="gap-1"><EyeOff className="h-3 w-3" />Masqué</Badge>}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(g)}><Pencil className="mr-1 h-3.5 w-3.5" />Modifier</Button>
                    {!g.isSystem && (
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleting(g)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" />Supprimer
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline">{scopeLabel(g)}</Badge>
                <Badge variant="secondary" className="gap-1"><Users className="h-3 w-3" />{g.memberCount} membre{g.memberCount > 1 ? 's' : ''}</Badge>
                <span className="text-muted-foreground">·</span>
                {g.rules.map((r, i) => (
                  <Badge key={i} variant={r.include ? 'default' : 'destructive'} className="font-normal">
                    {r.include ? '' : '– '}{CRITERION_LABELS[r.criterion] ?? r.criterion}{r.value ? ` : ${r.value}` : ''}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <GroupDialog group={editing} onClose={() => { setCreating(false); setEditing(null) }} />
      )}
      <ConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)}
        title="Supprimer le groupe" description={`Supprimer « ${deleting?.name} » ? Cette action est définitive.`}
        confirmLabel="Supprimer" variant="destructive" loading={del.isPending} onConfirm={remove} />
    </div>
  )
}

function scopeLabel(g: MemberGroupDto): string {
  if (g.scopeType === 'UnitType') return `Branche : ${g.unitTypeName ?? '—'}`
  if (g.scopeType === 'Unit') return `Unité : ${g.unitName ?? '—'}`
  return GROUP_SCOPE_LABELS.Group
}

// ── Create / edit dialog ──
function GroupDialog({ group, onClose }: { group: MemberGroupDto | null; onClose: () => void }) {
  const create = useCreateMemberGroup()
  const update = useUpdateMemberGroup()
  const isSystem = !!group?.isSystem

  const [name, setName] = useState(group?.name ?? '')
  const [scopeType, setScopeType] = useState(group?.scopeType ?? 'Group')
  const [unitTypeId, setUnitTypeId] = useState(group?.unitTypeId ?? '')
  const [unitId, setUnitId] = useState(group?.unitId ?? '')
  const [isVisible, setIsVisible] = useState(group?.isVisible ?? true)
  const [rules, setRules] = useState<MemberGroupRuleDto[]>(group?.rules ?? [{ include: true, criterion: 'maitrise', value: null }])
  const [error, setError] = useState('')

  const { data: unitTypes } = useUnitTypes({ pageSize: 100 })
  const { data: units } = useUnits({ isActive: true, pageSize: 200 })

  // Roles for the "role" criterion, narrowed to the scope's branch when set (else all).
  const scopeUnitTypeId = scopeType === 'UnitType' ? unitTypeId
    : scopeType === 'Unit' ? (units?.items.find(u => u.id === unitId)?.unitTypeId ?? '') : ''
  const { data: roles } = useFunctionalRoles(scopeUnitTypeId || undefined)
  const { data: profiles } = useSecurityProfiles()

  const setRule = (i: number, patch: Partial<MemberGroupRuleDto>) =>
    setRules(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addRule = () => setRules(rs => [...rs, { include: true, criterion: 'maitrise', value: null }])
  const removeRule = (i: number) => setRules(rs => rs.filter((_, idx) => idx !== i))

  const submit = async () => {
    setError('')
    if (!isSystem) {
      if (!name.trim()) { setError('Le nom est requis.'); return }
      if (scopeType === 'UnitType' && !unitTypeId) { setError('Choisissez une branche.'); return }
      if (scopeType === 'Unit' && !unitId) { setError('Choisissez une unité.'); return }
      if (!rules.some(r => r.include)) { setError('Ajoutez au moins une règle d\'inclusion.'); return }
      const needy = rules.find(r => GROUP_CRITERIA.find(c => c.key === r.criterion)?.needsValue && !r.value)
      if (needy) { setError('Une règle est incomplète (valeur manquante).'); return }
    }
    const payload = {
      name: name.trim(), scopeType,
      unitTypeId: scopeType === 'UnitType' ? (unitTypeId || null) : null,
      unitId: scopeType === 'Unit' ? (unitId || null) : null,
      isVisible, rules,
    }
    try {
      if (group) { await update.mutateAsync({ id: group.id, ...payload }); toast.success('Groupe modifié') }
      else { await create.mutateAsync(payload); toast.success('Groupe créé') }
      onClose()
    } catch (e) { setError(parseApiError(e)) }
  }

  const saving = create.isPending || update.isPending

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{group ? 'Modifier le groupe' : 'Nouveau groupe'}</DialogTitle>
          {isSystem && <DialogDescription>Groupe prédéfini : vous pouvez seulement le masquer/afficher.</DialogDescription>}
        </DialogHeader>

        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nom</label>
            <Input value={name} onChange={e => setName(e.target.value)} disabled={isSystem} maxLength={150} placeholder="Ex : Haute Patrouille" />
          </div>

          {/* Visibility toggle — the "hide from pickers" control (works for presets too). */}
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Visible dans les réunions</p>
              <p className="text-xs text-muted-foreground">Décochez pour masquer ce groupe du sélecteur de portée.</p>
            </div>
            <Switch checked={isVisible} onCheckedChange={setIsVisible} />
          </div>

          {!isSystem && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Portée</label>
                  <Select value={scopeType} onValueChange={v => { setScopeType(v); setUnitTypeId(''); setUnitId('') }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{GROUP_SCOPES.map(s => <SelectItem key={s} value={s}>{GROUP_SCOPE_LABELS[s]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {scopeType === 'UnitType' && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Branche</label>
                    <Select value={unitTypeId} onValueChange={setUnitTypeId}>
                      <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                      <SelectContent>{unitTypes?.items.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                {scopeType === 'Unit' && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Unité</label>
                    <Select value={unitId} onValueChange={setUnitId}>
                      <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                      <SelectContent>{units?.items.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Rules builder */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Règles d'appartenance</label>
                  <Button type="button" variant="outline" size="sm" onClick={addRule}><Plus className="mr-1 h-3.5 w-3.5" />Ajouter une règle</Button>
                </div>
                <p className="text-xs text-muted-foreground">Le groupe = l'union des règles « Inclure », moins les règles « Exclure ».</p>
                <div className="space-y-2">
                  {rules.map((r, i) => (
                    <RuleRow key={i} rule={r} roles={roles ?? []} profiles={profiles ?? []} units={units?.items ?? []} unitTypes={unitTypes?.items ?? []}
                      onChange={patch => setRule(i, patch)} onRemove={() => removeRule(i)} canRemove={rules.length > 1} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button onClick={submit} disabled={saving}>{saving ? '...' : 'Enregistrer'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// One editable rule row: include/exclude + criterion + (optional) value picker.
function RuleRow({ rule, roles, profiles, units, unitTypes, onChange, onRemove, canRemove }: {
  rule: MemberGroupRuleDto
  roles: { id: string; name: string }[]
  profiles: { id: string; code: string; name: string }[]
  units: { id: string; name: string }[]
  unitTypes: { id: string; name: string }[]
  onChange: (patch: Partial<MemberGroupRuleDto>) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search)
  const { data: memberResults } = useMembers({ search: debounced || undefined, pageSize: 6 })

  return (
    <div className="rounded-md border p-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Include / Exclude */}
        <Select value={rule.include ? 'inc' : 'exc'} onValueChange={v => onChange({ include: v === 'inc' })}>
          <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="inc">Inclure</SelectItem>
            <SelectItem value="exc">Exclure</SelectItem>
          </SelectContent>
        </Select>
        {/* Criterion */}
        <Select value={rule.criterion} onValueChange={v => onChange({ criterion: v, value: null })}>
          <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{GROUP_CRITERIA.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
        {/* Value picker (per criterion) */}
        {rule.criterion === 'profile' && (
          <Select value={rule.value ?? ''} onValueChange={v => onChange({ value: v })}>
            <SelectTrigger className="h-8 min-w-40 flex-1"><SelectValue placeholder="Profil..." /></SelectTrigger>
            <SelectContent>{profiles.map(p => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {rule.criterion === 'role' && (
          <Select value={rule.value ?? ''} onValueChange={v => onChange({ value: v })}>
            <SelectTrigger className="h-8 min-w-40 flex-1"><SelectValue placeholder="Fonction..." /></SelectTrigger>
            <SelectContent>{roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {rule.criterion === 'unit' && (
          <Select value={rule.value ?? ''} onValueChange={v => onChange({ value: v })}>
            <SelectTrigger className="h-8 min-w-40 flex-1"><SelectValue placeholder="Unité..." /></SelectTrigger>
            <SelectContent>{units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {rule.criterion === 'unit-type' && (
          <Select value={rule.value ?? ''} onValueChange={v => onChange({ value: v })}>
            <SelectTrigger className="h-8 min-w-40 flex-1"><SelectValue placeholder="Branche..." /></SelectTrigger>
            <SelectContent>{unitTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {canRemove && (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onRemove}><X className="h-4 w-4" /></Button>
        )}
      </div>
      {/* Member search (its own row — value = a member id). */}
      {rule.criterion === 'member' && (
        <div className="pl-1">
          {rule.value
            ? <div className="flex items-center gap-2 text-sm"><Badge variant="secondary">Membre sélectionné</Badge><Button type="button" variant="ghost" size="sm" onClick={() => onChange({ value: null })}>Changer</Button></div>
            : <>
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un membre…" className="h-8" />
                {debounced && memberResults && (
                  <div className="mt-1 max-h-36 overflow-y-auto rounded-md border text-sm">
                    {memberResults.items.map(m => (
                      <button key={m.id} type="button" className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted"
                        onClick={() => { onChange({ value: m.id }); setSearch('') }}>
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />{m.lastName} {m.firstName}
                      </button>
                    ))}
                  </div>
                )}
              </>}
        </div>
      )}
    </div>
  )
}
