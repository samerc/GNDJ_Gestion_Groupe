// "Groupes" — admin page (CG/ACG/super-admin, perm maitrise.manage) to create reusable rule-based member groups
// (Grande Maîtrise, Chefs d'unité, "Haute Patrouille", …). A group = a scope (whole group / branch / unit) + a
// set of membership rules (union of includes, minus excludes), resolved live. Used as réunion scopes today.
import { useState, useMemo } from 'react'
import {
  useMemberGroups, useCreateMemberGroup, useUpdateMemberGroup, useDeleteMemberGroup, useMemberGroupMembers, useSendGroupMessage,
  GROUP_SCOPES, GROUP_SCOPE_LABELS, GROUP_CRITERIA, CRITERION_LABELS,
  type MemberGroupDto, type MemberGroupRuleDto, type MemberGroupMemberDto,
} from '@/services/member-group-service'
import { useLeaderMessageTemplates } from '@/services/communications-service'
import { saveBlob } from '@/lib/download'
import { useUnits } from '@/services/unit-service'
import { useUnitTypes } from '@/services/unit-type-service'
import { useFunctionalRoles, useSecurityProfiles } from '@/services/role-service'
import { useMembers } from '@/services/member-service'
import { useDebounce } from '@/hooks/use-debounce'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tip } from '@/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { parseApiError } from '@/lib/error-utils'
import { cn } from '@/lib/utils'
import { Plus, Users, Pencil, Trash2, ShieldCheck, X, Search, Check, Minus, Globe, Layers, Building2, Mail, Copy, FileDown, ChevronUp, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'

export default function MemberGroupsPage() {
  const { data: groups, isLoading } = useMemberGroups()
  const [editing, setEditing] = useState<MemberGroupDto | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<MemberGroupDto | null>(null)
  const [viewing, setViewing] = useState<MemberGroupDto | null>(null)
  const [search, setSearch] = useState('')
  const del = useDeleteMemberGroup()

  const remove = async () => {
    if (!deleting) return
    try { await del.mutateAsync(deleting.id); toast.success('Groupe supprimé'); setDeleting(null) }
    catch (e) { toast.error(parseApiError(e)); setDeleting(null) }
  }

  if (isLoading) return <LoadingSpinner variant="table" />

  const all = groups ?? []
  const q = search.trim().toLowerCase()
  const filtered = q ? all.filter(g => g.name.toLowerCase().includes(q)) : all

  return (
    <div className="space-y-5">
      {/* Header: title + live count + create. Search appears once there are several groups. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Groupes
            {all.length > 0 && <span className="text-base font-normal text-muted-foreground">({all.length})</span>}
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Ensembles de membres définis par des règles (Grande Maîtrise, Chefs d'unité, Haute Patrouille…), recalculés
            automatiquement. Réutilisables comme portée de réunion et comme filtre dans la liste d'une unité.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" />Nouveau groupe</Button>
      </div>

      {all.length > 4 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un groupe…" className="pl-8" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
      )}

      {all.length === 0 ? (
        <EmptyState icon={Users} title="Aucun groupe" description="Créez un groupe pour l'utiliser dans les réunions ou comme filtre d'unité." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="Aucun résultat" description="Aucun groupe ne correspond à votre recherche." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map(g => (
            <GroupCard key={g.id} g={g} onEdit={() => setEditing(g)} onDelete={() => setDeleting(g)} onView={() => setViewing(g)} />
          ))}
        </div>
      )}

      {(creating || editing) && (
        <GroupDialog group={editing} onClose={() => { setCreating(false); setEditing(null) }} />
      )}
      {viewing && <MembersDialog group={viewing} onClose={() => setViewing(null)} />}
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

// Human-readable text for one rule chip (resolved name, never a GUID).
function ruleText(r: MemberGroupRuleDto): string {
  const base = CRITERION_LABELS[r.criterion] ?? r.criterion
  if (GROUP_CRITERIA.find(c => c.key === r.criterion)?.needsValue)
    return `${base} : ${r.valueLabel ?? '(supprimé)'}`
  return base
}

// A single visibility indicator ("Réunions" / "Liste d'unité") — green when the group is offered there.
function VisChip({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
      on ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-border bg-muted/50 text-muted-foreground'
    )}>
      {on ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}{label}
    </span>
  )
}

// One group card: icon + name/scope, member count, both visibility states, and readable rules (Membres / Sauf).
function GroupCard({ g, onEdit, onDelete, onView }: { g: MemberGroupDto; onEdit: () => void; onDelete: () => void; onView: () => void }) {
  const includes = g.rules.filter(r => r.include)
  const excludes = g.rules.filter(r => !r.include)
  const scopeIcon = g.scopeType === 'Group' ? Globe : g.scopeType === 'UnitType' ? Layers : Building2

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-semibold">{g.name}</h3>
                {g.isSystem && <Badge variant="outline" className="gap-1 text-[10px]"><ShieldCheck className="h-3 w-3" />Prédéfini</Badge>}
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  {(() => { const I = scopeIcon; return <I className="h-3 w-3 shrink-0" /> })()}
                  <span className="truncate">{scopeLabel(g)}</span>
                </span>
                {g.scopeType === 'UnitType' && (
                  <Badge variant="outline" className="text-[10px] font-normal">{g.perUnit ? 'Par unité' : 'Combiné'}</Badge>
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Tip content="Modifier"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}><Pencil className="h-4 w-4" /></Button></Tip>
            {!g.isSystem && (
              <Tip content="Supprimer"><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button></Tip>
            )}
          </div>
        </div>

        {/* Member count (click to see who) + visibility */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={onView}
            disabled={g.memberCount === 0}
            className="group/count flex items-baseline gap-1 rounded-md text-left transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-60"
            title="Voir les membres"
          >
            <span className="text-2xl font-bold leading-none tabular-nums">{g.memberCount}</span>
            <span className="text-xs text-muted-foreground group-hover/count:text-primary">membre{g.memberCount > 1 ? 's' : ''}</span>
            {g.memberCount > 0 && <span className="ml-0.5 text-xs font-medium text-primary underline-offset-2 group-hover/count:underline">voir</span>}
          </button>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Apparaît dans :</span>
            <VisChip on={g.isVisible} label="Réunions" />
            <VisChip on={g.showInUnitList} label="Liste d'unité" />
          </div>
        </div>

        {/* Rules — resolved names, grouped into includes and "sauf" excludes */}
        <div className="mt-auto space-y-1.5 rounded-md bg-muted/40 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Membres :</span>
            {includes.map((r, i) => (
              <Badge key={i} variant="secondary" className="font-normal">{ruleText(r)}</Badge>
            ))}
          </div>
          {excludes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-destructive">Sauf :</span>
              {excludes.map((r, i) => (
                <Badge key={i} variant="outline" className="border-destructive/30 font-normal text-destructive">{ruleText(r)}</Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Members of a group (resolved live) with their reachable contact — doubles as a mailing / contact export.
// A PER-UNIT branch group is shown as one TAB per unit (separate lists, each with its own actions targeting that
// unit); every other group is one combined list. Actions: copy emails, export CSV, send email.
function MembersDialog({ group, onClose }: { group: MemberGroupDto; onClose: () => void }) {
  const { data: members, isLoading } = useMemberGroupMembers(group.id)

  // Buckets by unit (stable order by name) — used for the per-unit tabs.
  const unitBuckets = useMemo(() => {
    const map = new Map<string, { unitId: string; unitName: string; members: MemberGroupMemberDto[] }>()
    for (const m of members ?? []) {
      if (!map.has(m.unitId)) map.set(m.unitId, { unitId: m.unitId, unitName: m.unitName ?? 'Sans unité', members: [] })
      map.get(m.unitId)!.members.push(m)
    }
    return [...map.values()].sort((a, b) => a.unitName.localeCompare(b.unitName, 'fr'))
  }, [members])

  const tabbed = group.perUnit && unitBuckets.length > 1

  return (
    <Dialog open onOpenChange={onClose}>
      {/* Fixed height so the dialog opens at its final size — otherwise it pops open small (header + spinner) then
          snaps to full height when the list arrives, which reads as a flicker. */}
      <DialogContent className="flex h-[80vh] max-h-[calc(100dvh-2rem)] w-full max-w-[95vw] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" />{group.name}</DialogTitle>
          <DialogDescription>
            {group.memberCount} membre{group.memberCount > 1 ? 's' : ''} · {scopeLabel(group)}
            {tabbed && ' · séparé par unité'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center"><LoadingSpinner /></div>
        ) : tabbed ? (
          <Tabs defaultValue={unitBuckets[0].unitId} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="shrink-0 justify-start overflow-x-auto flex-nowrap">
              {unitBuckets.map(b => <TabsTrigger key={b.unitId} value={b.unitId}>{b.unitName} ({b.members.length})</TabsTrigger>)}
            </TabsList>
            {unitBuckets.map(b => (
              <TabsContent key={b.unitId} value={b.unitId} className="mt-2 flex min-h-0 flex-1 flex-col">
                <MemberPane group={group} members={b.members} unitId={b.unitId} unitName={b.unitName} grouped={false} />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <MemberPane group={group} members={members ?? []} unitId={null} unitName={null} grouped={unitBuckets.length > 1} />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// One list of members (all of a combined group, or one unit of a per-unit group) + its mailing actions (copy /
// export / send). `grouped` shows per-unit section headers (combined group with several units); a per-unit tab is flat.
function MemberPane({ group, members, unitId, unitName, grouped }: {
  group: MemberGroupDto; members: MemberGroupMemberDto[]; unitId: string | null; unitName: string | null; grouped: boolean
}) {
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const q = search.trim().toLowerCase()
  const filtered = members.filter(m => !q || `${m.lastName} ${m.firstName}`.toLowerCase().includes(q))
  const withEmail = members.filter(m => m.email)

  const copyEmails = async () => {
    const list = [...new Set(withEmail.map(m => m.email!.trim()))].join('; ')
    try { await navigator.clipboard.writeText(list); toast.success(`${new Set(withEmail.map(m => m.email!.trim())).size} adresse(s) copiée(s)`) }
    catch { toast.error('Impossible de copier') }
  }
  const exportCsv = () => {
    const rows = [['Nom', 'Prénom', 'Unité', 'Fonction', 'Équipe', 'Email', 'Téléphone']]
    for (const m of members)
      rows.push([m.lastName, m.firstName, m.unitName ?? '', m.roleName, m.teamName ?? '', m.email ?? '', m.phone ?? ''])
    const csv = '﻿' + rows.map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const name = `${group.name}${unitName ? '_' + unitName : ''}`.replace(/\s+/g, '_')
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${name}.csv`, 'text/csv')
  }

  // Section the list by unit only for a combined group with several units; a per-unit tab is a flat list.
  const byUnit = new Map<string, MemberGroupMemberDto[]>()
  for (const m of filtered) {
    const u = m.unitName ?? 'Sans unité'
    if (!byUnit.has(u)) byUnit.set(u, [])
    byUnit.get(u)!.push(m)
  }
  const units = [...byUnit.keys()].sort((a, b) => a.localeCompare(b, 'fr'))

  const row = (m: MemberGroupMemberDto) => (
    <li key={m.memberId} className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{m.lastName} {m.firstName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {m.email ?? <span className="text-amber-600">Aucun email</span>}{m.phone ? ` · ${m.phone}` : ''}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{m.roleName}{m.teamName ? ` · ${m.teamName}` : ''}</span>
    </li>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setSending(true)} disabled={withEmail.length === 0}><Mail className="mr-1 h-4 w-4" />Envoyer un email</Button>
        <Button size="sm" variant="outline" onClick={copyEmails} disabled={withEmail.length === 0}><Copy className="mr-1 h-4 w-4" />Copier les emails</Button>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={members.length === 0}><FileDown className="mr-1 h-4 w-4" />Exporter (CSV)</Button>
      </div>
      <p className="text-xs text-muted-foreground">{members.length} membre{members.length > 1 ? 's' : ''} · {withEmail.length} avec email</p>

      {members.length > 8 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" className="pl-8" />
        </div>
      )}

      <div className="-mx-1 flex-1 overflow-y-auto px-1">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucun membre.</p>
        ) : grouped ? (
          <div className="space-y-3">
            {units.map(u => (
              <div key={u}>
                <div className="sticky top-0 flex items-center justify-between gap-2 bg-background/95 py-1 text-xs font-semibold text-muted-foreground">
                  <span className="truncate">{u}</span><span>{byUnit.get(u)!.length}</span>
                </div>
                <ul className="divide-y">{byUnit.get(u)!.map(row)}</ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="divide-y">{filtered.map(row)}</ul>
        )}
      </div>

      {sending && <SendMessageDialog group={group} unitId={unitId} unitName={unitName} onClose={() => setSending(false)} />}
    </div>
  )
}

// Compose + send an email to a group's members: a saved template OR a free-text subject/body. Delivery is queued
// (durable outbox) — the toast reports how many were queued and who has no reachable email.
function SendMessageDialog({ group, unitId, unitName, onClose }: { group: MemberGroupDto; unitId?: string | null; unitName?: string | null; onClose: () => void }) {
  const { data: templates } = useLeaderMessageTemplates()
  const send = useSendGroupMessage()
  const [mode, setMode] = useState<'free' | 'template'>('free')
  const [templateCode, setTemplateCode] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    if (mode === 'template' && !templateCode) { setError('Choisissez un modèle.'); return }
    if (mode === 'free' && (!subject.trim() || !body.trim())) { setError('Saisissez un objet et un message.'); return }
    try {
      const base = { id: group.id, unitId: unitId ?? null }
      const r = await send.mutateAsync(mode === 'template'
        ? { ...base, templateCode }
        : { ...base, subject: subject.trim(), bodyHtml: body.trim() })
      const extra = r.noContact > 0 ? ` · ${r.noContact} sans email` : ''
      toast.success(`Email envoyé à ${r.recipients} destinataire(s)${extra}`)
      onClose()
    } catch (e) { setError(parseApiError(e)) }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Envoyer un email — {group.name}{unitName ? ` · ${unitName}` : ''}</DialogTitle>
          <DialogDescription>Un email par membre (adresse du membre, sinon celle d'un parent). Envoi mis en file.</DialogDescription>
        </DialogHeader>

        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Contenu</label>
            <Select value={mode} onValueChange={v => setMode(v as 'free' | 'template')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Message libre</SelectItem>
                <SelectItem value="template">Modèle existant</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === 'template' ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Modèle</label>
              <Select value={templateCode} onValueChange={setTemplateCode}>
                <SelectTrigger><SelectValue placeholder="Choisir un modèle…" /></SelectTrigger>
                <SelectContent>{(templates ?? []).map(t => <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Le contenu du modèle est envoyé tel quel (modifiable dans Email).</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Objet</label>
                <Input value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} placeholder="Objet de l'email" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Message</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={10000} rows={8}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm" placeholder="Votre message…" />
                <p className="text-xs text-muted-foreground">Texte simple : les sauts de ligne sont conservés.</p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={send.isPending}>Annuler</Button>
          <Button onClick={submit} disabled={send.isPending}>{send.isPending ? 'Envoi…' : 'Envoyer'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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
  const [showInUnitList, setShowInUnitList] = useState(group?.showInUnitList ?? false)
  const [perUnit, setPerUnit] = useState(group?.perUnit ?? true) // branch scope: default = one list per unit
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
  // Reorder a rule (cosmetic — the order is preserved on save for readability).
  const moveRule = (i: number, dir: -1 | 1) => setRules(rs => {
    const j = i + dir
    if (j < 0 || j >= rs.length) return rs
    const copy = [...rs]; [copy[i], copy[j]] = [copy[j], copy[i]]; return copy
  })

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
      perUnit: scopeType === 'UnitType' ? perUnit : false,
      isVisible, showInUnitList, rules,
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

          {/* Visibility toggles — where this group is offered (both work for presets too). */}
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Visible dans les réunions</p>
              <p className="text-xs text-muted-foreground">Décochez pour masquer ce groupe du sélecteur de portée des réunions.</p>
            </div>
            <Switch checked={isVisible} onCheckedChange={setIsVisible} />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Visible dans la liste de l'unité</p>
              <p className="text-xs text-muted-foreground">Le chef d'unité peut filtrer sa liste de membres sur ce groupe. N'apparaît pas sur le site public ni pour les membres.</p>
            </div>
            <Switch checked={showInUnitList} onCheckedChange={setShowInUnitList} />
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

              {/* Per-unit vs combined — only meaningful for a branch (UnitType) scope, which spans several units. */}
              {scopeType === 'UnitType' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Organisation</label>
                  <Select value={perUnit ? 'per' : 'combined'} onValueChange={v => setPerUnit(v === 'per')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per">Une liste par unité (séparé)</SelectItem>
                      <SelectItem value="combined">Une seule liste combinée</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {perUnit
                      ? "Le groupe est séparé par unité — une liste, une réunion et un envoi par unité de la branche (ex. la Haute Patrouille de chaque troupe)."
                      : "Toutes les unités de la branche forment une seule liste — une réunion et un envoi communs (ex. réunir les 3 troupes)."}
                  </p>
                </div>
              )}

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
                      onChange={patch => setRule(i, patch)} onRemove={() => removeRule(i)} canRemove={rules.length > 1}
                      onMoveUp={() => moveRule(i, -1)} onMoveDown={() => moveRule(i, 1)} canMoveUp={i > 0} canMoveDown={i < rules.length - 1} />
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

// One editable rule row: reorder handles + include/exclude + criterion + (optional) value picker.
function RuleRow({ rule, roles, profiles, units, unitTypes, onChange, onRemove, canRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: {
  rule: MemberGroupRuleDto
  roles: { id: string; name: string }[]
  profiles: { id: string; code: string; name: string }[]
  units: { id: string; name: string }[]
  unitTypes: { id: string; name: string }[]
  onChange: (patch: Partial<MemberGroupRuleDto>) => void
  onRemove: () => void
  canRemove: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  return (
    <div className="flex items-start gap-1.5 rounded-md border p-2">
      {/* Reorder handles (cosmetic ordering for readability) */}
      <div className="flex flex-col">
        <Button type="button" variant="ghost" size="icon" className="h-4 w-6 text-muted-foreground disabled:opacity-30" onClick={onMoveUp} disabled={!canMoveUp} aria-label="Monter"><ChevronUp className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-4 w-6 text-muted-foreground disabled:opacity-30" onClick={onMoveDown} disabled={!canMoveDown} aria-label="Descendre"><ChevronDown className="h-4 w-4" /></Button>
      </div>
      <div className="flex-1 space-y-2">
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
        {/* Member search only mounts for the "member" criterion, so its query doesn't fire for other rules. */}
        {rule.criterion === 'member' && <MemberRuleSearch value={rule.value} onChange={v => onChange({ value: v })} />}
      </div>
    </div>
  )
}

// Member picker for a "member" rule — self-contained so its /members search query only runs when this rule
// is a member rule (mounting/unmounting with the criterion), not for every rule row.
function MemberRuleSearch({ value, onChange }: { value: string | null | undefined; onChange: (v: string | null) => void }) {
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search)
  const { data: memberResults } = useMembers({ search: debounced || undefined, pageSize: 6 })
  if (value)
    return <div className="flex items-center gap-2 text-sm"><Badge variant="secondary">Membre sélectionné</Badge><Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>Changer</Button></div>
  return (
    <div>
      <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un membre…" className="h-8" />
      {debounced && memberResults && (
        <div className="mt-1 max-h-36 overflow-y-auto rounded-md border text-sm">
          {memberResults.items.map(m => (
            <button key={m.id} type="button" className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted"
              onClick={() => { onChange(m.id); setSearch('') }}>
              <Users className="h-3.5 w-3.5 text-muted-foreground" />{m.lastName} {m.firstName}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
