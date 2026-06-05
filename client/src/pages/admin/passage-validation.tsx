import { useState, useEffect } from 'react'
import { useSettingValue } from '@/services/settings-service'
import {
  useAllPassages,
  usePassageSummary,
  usePassageStatus,
  useTogglePassage,
  useReviewPassage,
  useBulkReviewPassage,
  useFinalizePassages,
  type PassageDto,
} from '@/services/passage-service'
import { useUnits } from '@/services/unit-service'
import { useTeams } from '@/services/team-service'
import { useFunctionalRoles } from '@/services/role-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import {
  ArrowRightLeft,
  ArrowRight,
  Check,
  X,
  Pencil,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { toast } from 'sonner'

export default function PassageValidationPage() {
  const passageSchoolYear = useSettingValue('passage.school_year') ?? '2026-2027'
  const [schoolYear, setSchoolYear] = useState('2026-2027')
  const [statusFilter, setStatusFilter] = useState<string>('Pending')

  useEffect(() => { setSchoolYear(passageSchoolYear) }, [passageSchoolYear])
  const [unitFilter, setUnitFilter] = useState<string>('_all')

  const { data: passageStatus, isLoading: statusLoading } = usePassageStatus(schoolYear)
  const { data: summary, isLoading: summaryLoading } = usePassageSummary(schoolYear)
  const { data: passages, isLoading: passagesLoading } = useAllPassages(
    schoolYear,
    statusFilter === '_all' ? undefined : statusFilter,
    unitFilter === '_all' ? undefined : unitFilter,
  )
  const { data: unitsData } = useUnits({ isActive: true, pageSize: 100 })

  const toggleMutation = useTogglePassage()
  const reviewMutation = useReviewPassage()
  const bulkReviewMutation = useBulkReviewPassage()
  const finalizeMutation = useFinalizePassages()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editDialog, setEditDialog] = useState<PassageDto | null>(null)
  const [finalizeDialog, setFinalizeDialog] = useState(false)

  // Edit form state
  const [editFinalUnitId, setEditFinalUnitId] = useState('')
  const [editFinalTeamId, setEditFinalTeamId] = useState<string>('')
  const [editFinalRoleId, setEditFinalRoleId] = useState('')
  const [editCgNotes, setEditCgNotes] = useState('')
  const [editError, setEditError] = useState('')

  const units = unitsData?.items ?? []
  const { data: rolesData } = useFunctionalRoles()
  const roles = rolesData ?? []
  const { data: teamsData } = useTeams({ unitId: editFinalUnitId || undefined, pageSize: 100 })
  const teams = teamsData?.items ?? []

  const isLoading = statusLoading || summaryLoading || passagesLoading
  const passageList = passages ?? []

  const handleToggle = async () => {
    try {
      const newEnabled = !passageStatus?.isOpen
      await toggleMutation.mutateAsync({ enabled: newEnabled, schoolYear })
      toast.success(newEnabled ? 'Passage ouvert' : 'Passage ferme')
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === passageList.length) setSelected(new Set())
    else setSelected(new Set(passageList.map(p => p.id)))
  }

  const quickApprove = async (passage: PassageDto) => {
    try {
      await reviewMutation.mutateAsync({
        id: passage.id,
        status: 'Approved',
        finalUnitId: passage.proposedUnitId,
        finalTeamId: passage.proposedTeamId,
        finalRoleId: null,
        cgNotes: null,
      })
      toast.success('Passage approuve')
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const quickReject = async (passage: PassageDto) => {
    try {
      await reviewMutation.mutateAsync({
        id: passage.id,
        status: 'Rejected',
        cgNotes: null,
      })
      toast.success('Passage rejete')
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const openEditDialog = (passage: PassageDto) => {
    setEditDialog(passage)
    setEditFinalUnitId(passage.finalUnitId ?? passage.proposedUnitId)
    setEditFinalTeamId(passage.finalTeamId ?? passage.proposedTeamId ?? '')
    setEditFinalRoleId(passage.finalRoleName ? roles.find(r => r.name === passage.finalRoleName)?.id ?? '' : '')
    setEditCgNotes(passage.cgNotes ?? '')
    setEditError('')
  }

  const handleEditSubmit = async () => {
    if (!editDialog) return
    try {
      await reviewMutation.mutateAsync({
        id: editDialog.id,
        status: 'Approved',
        finalUnitId: editFinalUnitId || null,
        finalTeamId: editFinalTeamId || null,
        finalRoleId: editFinalRoleId || null,
        cgNotes: editCgNotes || null,
      })
      toast.success('Passage modifie et approuve')
      setEditDialog(null)
    } catch (err) {
      setEditError(parseApiError(err))
    }
  }

  const handleBulkApprove = async () => {
    try {
      const result = await bulkReviewMutation.mutateAsync({
        passageIds: Array.from(selected),
        status: 'Approved',
      })
      toast.success(`${result.count} passage(s) approuve(s)`)
      setSelected(new Set())
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const handleBulkReject = async () => {
    try {
      const result = await bulkReviewMutation.mutateAsync({
        passageIds: Array.from(selected),
        status: 'Rejected',
      })
      toast.success(`${result.count} passage(s) rejete(s)`)
      setSelected(new Set())
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const handleFinalize = async () => {
    try {
      const result = await finalizeMutation.mutateAsync({
        schoolYear,
        unitId: unitFilter === '_all' ? null : unitFilter,
      })
      toast.success(`${result.count} affectation(s) creee(s)`)
      setFinalizeDialog(false)
    } catch (err) {
      toast.error(parseApiError(err))
      setFinalizeDialog(false)
    }
  }

  const approvedCount = summary?.approved ?? 0

  const statusBadge = (status: string) => {
    switch (status) {
      case 'Approved': return <Badge className="bg-green-600">Approuvé</Badge>
      case 'Rejected': return <Badge variant="destructive">Rejeté</Badge>
      case 'Finalized': return <Badge className="bg-blue-600">Finalisé</Badge>
      default: return <Badge variant="secondary">En attente</Badge>
    }
  }

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Validation des passages — {schoolYear}</h1>
        <div className="flex items-center gap-3">
          <Select value={schoolYear} onValueChange={setSchoolYear}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['2026-2027', '2025-2026', '2024-2025'].map(y => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant={passageStatus?.isOpen ? 'default' : 'secondary'} className={passageStatus?.isOpen ? 'bg-green-600' : ''}>
            {passageStatus?.isOpen ? 'Ouvert' : 'Fermé'}
          </Badge>
          <Button
            variant={passageStatus?.isOpen ? 'destructive' : 'default'}
            onClick={handleToggle}
            disabled={toggleMutation.isPending}
          >
            {passageStatus?.isOpen ? (
              <><ToggleRight className="mr-1 h-4 w-4" />Fermer le passage</>
            ) : (
              <><ToggleLeft className="mr-1 h-4 w-4" />Ouvrir le passage</>
            )}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary?.totalMembers ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary?.pending ?? 0}</p>
              <p className="text-xs text-muted-foreground">En attente</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary?.approved ?? 0}</p>
              <p className="text-xs text-muted-foreground">Approuves</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-600">
              <XCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary?.rejected ?? 0}</p>
              <p className="text-xs text-muted-foreground">Rejetes</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={unitFilter} onValueChange={setUnitFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Toutes les unites" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Toutes les unites</SelectItem>
            {units.map(u => <SelectItem key={u.id} value={u.id}>{u.code} — {u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Tous les statuts</SelectItem>
            <SelectItem value="Pending">En attente</SelectItem>
            <SelectItem value="Approved">Approuvé</SelectItem>
            <SelectItem value="Rejected">Rejeté</SelectItem>
            <SelectItem value="Finalized">Finalisé</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <Card>
          <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 py-3">
            <span className="text-sm font-medium">{selected.size} passage(s) selectionne(s)</span>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleBulkApprove} disabled={bulkReviewMutation.isPending}>
                <Check className="mr-1 h-4 w-4" />Approuver la selection
              </Button>
              <Button size="sm" variant="destructive" onClick={handleBulkReject} disabled={bulkReviewMutation.isPending}>
                <X className="mr-1 h-4 w-4" />Rejeter la selection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {passageList.length === 0 ? (
        <EmptyState icon={ArrowRightLeft} title="Aucun passage" description="Aucune proposition de passage pour cette annee scolaire." />
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === passageList.length && passageList.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium">Membre</th>
                <th className="px-3 py-2 text-left font-medium">Unite actuelle</th>
                <th className="px-3 py-2 text-left font-medium">Proposition</th>
                <th className="px-3 py-2 text-left font-medium">Equipe</th>
                <th className="px-3 py-2 text-left font-medium">Fonction</th>
                <th className="px-3 py-2 text-left font-medium">Notes CU</th>
                <th className="px-3 py-2 text-left font-medium">Decision CG</th>
                <th className="px-3 py-2 text-left font-medium">Statut</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {passageList.map((p, idx) => (
                <tr key={p.id} className={`border-b hover:bg-muted/20 ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{p.memberName}</div>
                    {p.cardNumber && <div className="text-xs text-muted-foreground">{p.cardNumber}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-muted-foreground">{p.currentUnitCode}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">{p.currentUnitCode}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span className="font-medium">{p.proposedUnitCode}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">{p.proposedTeamName ?? '-'}</td>
                  <td className="px-3 py-2 text-xs">{p.proposedRoleName}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[120px] truncate">{p.cuNotes ?? ''}</td>
                  <td className="px-3 py-2 text-xs">
                    {p.finalUnitName ? (
                      <div>
                        <span className="font-medium">{p.finalUnitCode}</span>
                        {p.finalTeamName && <span className="text-muted-foreground"> / {p.finalTeamName}</span>}
                        {p.cgNotes && <div className="text-muted-foreground mt-0.5">{p.cgNotes}</div>}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{statusBadge(p.status)}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => quickApprove(p)}
                        disabled={reviewMutation.isPending}
                        title="Approuver"
                      >
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => quickReject(p)}
                        disabled={reviewMutation.isPending}
                        title="Rejeter"
                      >
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEditDialog(p)}
                        title="Modifier"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Finalize section */}
      {approvedCount > 0 && (
        <div className="flex justify-end pt-4">
          <Button size="lg" onClick={() => setFinalizeDialog(true)} disabled={finalizeMutation.isPending}>
            <CheckCircle2 className="mr-2 h-5 w-5" />
            Finaliser les passages
          </Button>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revue du passage — {editDialog?.memberName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {editError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{editError}</div>}

            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <p><strong>Proposition CU :</strong> {editDialog?.proposedUnitCode} — {editDialog?.proposedUnitName}</p>
              {editDialog?.proposedTeamName && <p>Equipe : {editDialog.proposedTeamName}</p>}
              <p>Fonction : {editDialog?.proposedRoleName}</p>
              {editDialog?.cuNotes && <p className="text-muted-foreground mt-1">Notes : {editDialog.cuNotes}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Unite finale</label>
              <Select value={editFinalUnitId} onValueChange={(v) => { setEditFinalUnitId(v); setEditFinalTeamId('') }}>
                <SelectTrigger><SelectValue placeholder="Selectionner une unite" /></SelectTrigger>
                <SelectContent>
                  {units.map(u => <SelectItem key={u.id} value={u.id}>{u.code} — {u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Equipe finale</label>
              <Select value={editFinalTeamId || '_none'} onValueChange={(v) => setEditFinalTeamId(v === '_none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Aucune equipe" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Aucune equipe</SelectItem>
                  {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Fonction finale</label>
              <Select value={editFinalRoleId} onValueChange={setEditFinalRoleId}>
                <SelectTrigger><SelectValue placeholder="Selectionner une fonction" /></SelectTrigger>
                <SelectContent>
                  {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes CG</label>
              <Input
                value={editCgNotes}
                onChange={e => setEditCgNotes(e.target.value)}
                placeholder="Notes du commissaire general..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Annuler</Button>
            <Button onClick={handleEditSubmit} disabled={reviewMutation.isPending}>
              {reviewMutation.isPending ? 'Enregistrement...' : 'Approuver et enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finalize Confirm */}
      <ConfirmDialog
        open={finalizeDialog}
        onOpenChange={setFinalizeDialog}
        title="Finaliser les passages"
        description={`Ceci va creer ${approvedCount} nouvelle(s) affectation(s) et cloturer les affectations actuelles. Continuer ?`}
        confirmLabel="Finaliser"
        loading={finalizeMutation.isPending}
        onConfirm={handleFinalize}
      />
    </div>
  )
}
