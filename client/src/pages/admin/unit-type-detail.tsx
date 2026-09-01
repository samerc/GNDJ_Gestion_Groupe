// Admin detail screen for one unit type / branch (super-admin) — the SINGLE record page for both
// creating and editing. The "Informations" section edits the core fields inline (Nom, Code, années,
// âges, couleur, description publique); below are the branch-scoped tabs: Fonctions (FunctionalRolesList
// in sortable/drag-to-rank mode), Étapes (StagesLadder) and Badges (BadgesGrid). Reached by clicking a
// row on /admin/unit-types; "Nouveau type" navigates here with id="new" (create mode, form shown blank).
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { FunctionalRolesList } from '@/components/shared/functional-roles-list'
import { StagesLadder, BadgesGrid } from '@/pages/admin/progression'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Tip } from '@/components/ui/tooltip'
import { useFormValidation } from '@/hooks/use-form-validation'
import { useCreateUnitType, useUpdateUnitType, type UnitTypeFormData } from '@/services/unit-type-service'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { ArrowLeft, Shield, Star, Award, Pencil, ChevronDown, ChevronRight, Info as InfoIcon } from 'lucide-react'

interface UnitTypeDetail {
  id: string; name: string; code: string; description: string | null
  numberOfYears: number | null; ageMin: number | null; ageMax: number | null
  color: string | null; publicDescription: string | null; gender: string | null
  createdAt: string; updatedAt: string
}

const EMPTY: UnitTypeFormData = { name: '', code: '', description: '', numberOfYears: null, ageMin: null, ageMax: null, color: '', publicDescription: '', gender: null }

// Branch gender — drives which units a boy/girl demande is eligible for + suggested. '' = non précisé (matches any).
const GENDER_NONE = '__none__'
const GENDER_LABELS: Record<string, string> = { Masculin: 'Garçons', Féminin: 'Filles', Mixte: 'Mixte' }

export default function UnitTypeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const { data: unitType, isLoading } = useQuery({
    queryKey: ['unitTypes', id],
    queryFn: () => apiClient.get<UnitTypeDetail>(`/unit-types/${id}`).then(r => r.data),
    enabled: !!id && !isNew,
  })

  const createMutation = useCreateUnitType()
  const updateMutation = useUpdateUnitType()
  const { validate, clearField, clearAll, fieldClass } = useFormValidation()

  // In create mode we start in the editing form immediately; in edit mode the header shows read-only until "Modifier".
  const [editing, setEditing] = useState(isNew)
  // The Informations box is collapsed by default for an existing type (open in create mode).
  const [infoOpen, setInfoOpen] = useState(isNew)
  const [form, setForm] = useState<UnitTypeFormData>(EMPTY)
  const [error, setError] = useState('')

  const openEdit = () => {
    if (!unitType) return
    setInfoOpen(true)
    setForm({
      name: unitType.name, code: unitType.code, description: unitType.description ?? '',
      numberOfYears: unitType.numberOfYears, ageMin: unitType.ageMin, ageMax: unitType.ageMax,
      color: unitType.color ?? '', publicDescription: unitType.publicDescription ?? '',
      gender: unitType.gender ?? null,
    })
    setError(''); clearAll()
    setEditing(true)
  }

  const cancel = () => {
    if (isNew) { navigate('/admin/unit-types'); return }
    setEditing(false); setError(''); clearAll()
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ name: !form.name, code: !form.code })) return
    try {
      if (isNew) {
        const res = await createMutation.mutateAsync(form)
        toast.success("Type d'unité créé")
        setEditing(false)
        navigate(`/admin/unit-types/${res.id}`, { replace: true })
      } else {
        await updateMutation.mutateAsync({ id: id!, ...form })
        toast.success("Type d'unité modifié")
        setEditing(false)
      }
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  if (!isNew && isLoading) return <LoadingSpinner variant="detail" />
  if (!isNew && !unitType) return <div className="py-12 text-center text-muted-foreground">Type d'unité introuvable.</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Tip content="Retour"><Button variant="ghost" size="icon" onClick={() => navigate('/admin/unit-types')}><ArrowLeft className="h-5 w-5" /></Button></Tip>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">
            {isNew ? "Nouveau type d'unité" : unitType!.name}
          </h1>
          {!isNew && !editing && (
            <p className="text-sm text-muted-foreground">
              Code : {unitType!.code}
              {unitType!.numberOfYears ? ` — ${unitType!.numberOfYears} an${unitType!.numberOfYears > 1 ? 's' : ''}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Informations — collapsible; read-only card with "Modifier", or the inline edit form */}
      <Card>
        <CardHeader className="cursor-pointer py-3" onClick={() => setInfoOpen(o => !o)}>
          <CardTitle className="flex items-center gap-2 text-base">
            {infoOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <InfoIcon className="h-4 w-4" />Informations
            {!infoOpen && !isNew && <span className="ml-1 truncate text-sm font-normal text-muted-foreground">{unitType!.name} · {unitType!.code}</span>}
          </CardTitle>
        </CardHeader>
        {infoOpen && (
        <CardContent>
          {editing ? (
            <form onSubmit={handleSave} className="space-y-4">
              {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <RequiredLabel htmlFor="name" required>Nom</RequiredLabel>
                  <Input id="name" className={fieldClass('name')} value={form.name} onChange={(e) => { setForm(f => ({ ...f, name: e.target.value })); clearField('name') }} required />
                </div>
                <div className="space-y-2">
                  <RequiredLabel htmlFor="code" required>Code</RequiredLabel>
                  <Input id="code" className={fieldClass('code')} value={form.code} onChange={(e) => { setForm(f => ({ ...f, code: e.target.value })); clearField('code') }} required />
                </div>
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="description">Description</RequiredLabel>
                <Input id="description" value={form.description ?? ''} onChange={(e) => setForm(f => ({ ...f, description: e.target.value || null }))} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <RequiredLabel htmlFor="numberOfYears">Nb d'années</RequiredLabel>
                  <Input id="numberOfYears" type="number" min={1} value={form.numberOfYears ?? ''} onChange={(e) => setForm(f => ({ ...f, numberOfYears: e.target.value ? Number(e.target.value) : null }))} />
                </div>
                <div className="space-y-2">
                  <RequiredLabel htmlFor="ageMin">Âge min</RequiredLabel>
                  <Input id="ageMin" type="number" min={0} value={form.ageMin ?? ''} onChange={(e) => setForm(f => ({ ...f, ageMin: e.target.value ? Number(e.target.value) : null }))} />
                </div>
                <div className="space-y-2">
                  <RequiredLabel htmlFor="ageMax">Âge max</RequiredLabel>
                  <Input id="ageMax" type="number" min={0} value={form.ageMax ?? ''} onChange={(e) => setForm(f => ({ ...f, ageMax: e.target.value ? Number(e.target.value) : null }))} />
                </div>
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="gender">Genre</RequiredLabel>
                <Select value={form.gender || GENDER_NONE} onValueChange={(v) => setForm(f => ({ ...f, gender: v === GENDER_NONE ? null : v }))}>
                  <SelectTrigger id="gender"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GENDER_NONE}>Non précisé</SelectItem>
                    <SelectItem value="Masculin">Garçons</SelectItem>
                    <SelectItem value="Féminin">Filles</SelectItem>
                    <SelectItem value="Mixte">Mixte</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Détermine les unités proposées à un garçon / une fille lors d'une demande d'inscription. « Non précisé » correspond à toute personne.</p>
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="color">Couleur</RequiredLabel>
                <div className="flex items-center gap-2">
                  <Input id="color" type="color" value={form.color || '#3B82F6'} onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))} className="h-9 w-14 cursor-pointer p-1" />
                  <Input value={form.color || ''} onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))} placeholder="#3B82F6" className="flex-1" />
                  {form.color && <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setForm(f => ({ ...f, color: '' }))}>Effacer</button>}
                </div>
                <p className="text-xs text-muted-foreground">Chaque type doit avoir une couleur unique.</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="publicDescription" className="text-sm font-medium">Description publique (site)</label>
                <textarea
                  id="publicDescription"
                  value={form.publicDescription ?? ''}
                  onChange={(e) => setForm(f => ({ ...f, publicDescription: e.target.value }))}
                  rows={4}
                  maxLength={4000}
                  placeholder="Présentation de cette branche affichée sur le site public (partagée par toutes les unités de ce type)…"
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-2xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" type="button" onClick={cancel}>Annuler</Button>
                <Button type="submit" disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  {unitType!.color && <div className="h-4 w-4 rounded-full border" style={{ backgroundColor: unitType!.color }} />}
                  <span className="text-lg font-semibold">{unitType!.name}</span>
                </div>
                <Tip content="Modifier les informations"><Button variant="outline" size="sm" onClick={openEdit}><Pencil className="mr-1 h-4 w-4" />Modifier</Button></Tip>
              </div>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Info label="Code" value={unitType!.code} />
                <Info label="Nombre d'années" value={unitType!.numberOfYears != null ? `${unitType!.numberOfYears} an${unitType!.numberOfYears > 1 ? 's' : ''}` : '—'} />
                <Info label="Âge min" value={unitType!.ageMin != null ? `${unitType!.ageMin} ans` : '—'} />
                <Info label="Âge max" value={unitType!.ageMax != null ? `${unitType!.ageMax} ans` : '—'} />
                <Info label="Genre" value={unitType!.gender ? (GENDER_LABELS[unitType!.gender] ?? unitType!.gender) : '—'} />
                <Info label="Description" value={unitType!.description || '—'} className="sm:col-span-2" />
                <Info label="Description publique (site)" value={unitType!.publicDescription || '—'} className="sm:col-span-2" />
              </dl>
            </div>
          )}
        </CardContent>
        )}
      </Card>

      {/* Branch-scoped management — only meaningful once the type exists. */}
      {!isNew && (
        <Tabs defaultValue="roles">
          <TabsList>
            <TabsTrigger value="roles"><Shield className="mr-1 h-4 w-4" />Fonctions</TabsTrigger>
            <TabsTrigger value="stages"><Star className="mr-1 h-4 w-4" />Étapes</TabsTrigger>
            <TabsTrigger value="badges"><Award className="mr-1 h-4 w-4" />Badges</TabsTrigger>
          </TabsList>

          <TabsContent value="roles">
            <FunctionalRolesList unitTypeId={id} unitTypeName={unitType!.name} sortable />
          </TabsContent>
          <TabsContent value="stages">
            <StagesLadder unitTypeId={unitType!.id} />
          </TabsContent>
          <TabsContent value="badges">
            <BadgesGrid unitTypeId={unitType!.id} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function Info({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line">{value}</dd>
    </div>
  )
}
