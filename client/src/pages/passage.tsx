import { useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useSettingValue } from '@/services/settings-service'
import {
  usePassagesByUnit,
  usePassageStatus,
  useProposePassage,
  useBulkProposePassage,
  useDeletePassage,
  type PassageDto,
} from '@/services/passage-service'
import { useMembers } from '@/services/member-service'
import { useAssignments } from '@/services/assignment-service'
import { useUnits } from '@/services/unit-service'
import { useTeams } from '@/services/team-service'
import { useFunctionalRoles } from '@/services/role-service'
import apiClient from '@/lib/api-client'
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
import { ArrowRightLeft, Check, Trash2, Users, ArrowRight, LogOut } from 'lucide-react'
import { toast } from 'sonner'

interface MemberRow {
  memberId: string
  memberName: string
  cardNumber: string | null
  dateOfBirth: string | null
  age: number | null
  currentUnitId: string
  currentUnitName: string
  currentTeamName: string | null
  currentRoleName: string
  currentRoleId: string
  currentTeamId: string | null
  passage: PassageDto | null
}

function calculateAge(dob: string | null): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export default function PassagePage() {
  const { user } = useAuthStore()
  const passageScoutYear = useSettingValue('passage.scout_year') ?? '2026-2027'
  const unitId = user?.unitAccess[0]?.unitId ?? ''
  const unitName = user?.unitAccess[0]?.unitName ?? ''

  const { data: passageStatus, isLoading: statusLoading } = usePassageStatus(passageScoutYear)
  const { data: passages, isLoading: passagesLoading } = usePassagesByUnit(unitId, passageScoutYear)
  const { data: membersData, isLoading: membersLoading } = useMembers({ unitId, pageSize: 500 })
  const { data: assignmentsData } = useAssignments({ unitId, isActive: true, pageSize: 500 })
  const { data: unitsData } = useUnits({ isActive: true, pageSize: 100 })
  const { data: rolesData } = useFunctionalRoles()

  const proposeMutation = useProposePassage()
  const bulkProposeMutation = useBulkProposePassage()
  const deleteMutation = useDeletePassage()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [proposeDialogOpen, setProposeDialogOpen] = useState(false)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [bulkMode, setBulkMode] = useState<'same' | 'move'>('same')
  const [editingMember, setEditingMember] = useState<MemberRow | null>(null)
  const [deletingPassage, setDeletingPassage] = useState<PassageDto | null>(null)

  // Form state for propose dialog
  const [propUnitId, setPropUnitId] = useState('')
  const [propTeamId, setPropTeamId] = useState<string>('')
  const [propRoleId, setPropRoleId] = useState('')
  const [propNotes, setPropNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [suggestionHint, setSuggestionHint] = useState<string | null>(null)

  const units = unitsData?.items ?? []
  const roles = rolesData ?? []

  // Teams filtered by selected unit
  const { data: teamsData } = useTeams({ unitId: propUnitId || undefined, pageSize: 100 })
  const teams = teamsData?.items ?? []

  // Build member rows with assignment + passage data
  const memberRows: MemberRow[] = useMemo(() => {
    const members = membersData?.items ?? []
    const assignments = assignmentsData?.items ?? []
    const passageMap = new Map((passages ?? []).map(p => [p.memberId, p]))

    return members.map(m => {
      const assignment = assignments.find(a => a.memberId === m.id)
      return {
        memberId: m.id,
        memberName: `${m.firstName} ${m.lastName}`,
        cardNumber: m.cardNumber,
        dateOfBirth: m.dateOfBirth,
        age: calculateAge(m.dateOfBirth),
        currentUnitId: assignment?.unitId ?? unitId,
        currentUnitName: assignment?.unitName ?? unitName,
        currentTeamName: assignment?.teamName ?? null,
        currentRoleName: assignment?.functionalRoleName ?? '-',
        currentRoleId: assignment?.functionalRoleId ?? '',
        currentTeamId: assignment?.teamId ?? null,
        passage: passageMap.get(m.id) ?? null,
      }
    })
  }, [membersData, assignmentsData, passages, unitId, unitName])

  const isLoading = statusLoading || passagesLoading || membersLoading

  if (isLoading) return <LoadingSpinner variant="table" />

  if (!passageStatus?.isOpen) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Passage annuel</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <ArrowRightLeft className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-lg font-medium text-muted-foreground">Le processus de passage n'est pas encore ouvert</p>
            <p className="text-sm text-muted-foreground">Contactez la Maîtrise de Groupe pour démarrer le passage.</p>
          </CardContent>
        </Card>
      </div>
    )
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
    if (selected.size === memberRows.length) setSelected(new Set())
    else setSelected(new Set(memberRows.map(m => m.memberId)))
  }

  const openPropose = async (row: MemberRow) => {
    setEditingMember(row)
    setPropTeamId(row.passage?.proposedTeamId ?? row.currentTeamId ?? '')
    setPropRoleId(row.passage?.proposedRoleName ? roles.find(r => r.name === row.passage?.proposedRoleName)?.id ?? row.currentRoleId : row.currentRoleId)
    setPropNotes(row.passage?.cuNotes ?? '')
    setFormError('')
    setSuggestionHint(null)

    // If already has a passage, use its proposed unit
    if (row.passage?.proposedUnitId) {
      setPropUnitId(row.passage.proposedUnitId)
    } else {
      // Try to auto-suggest from progression path
      setPropUnitId(row.currentUnitId)
      try {
        const { data: suggestion } = await apiClient.get(`/unit-type-progressions/suggest/${row.memberId}`)
        if (suggestion?.suggestedUnitTypeId) {
          // Find a unit of that type
          const suggestedUnit = units.find(u => u.unitTypeId === suggestion.suggestedUnitTypeId)
          if (suggestedUnit) {
            setPropUnitId(suggestedUnit.id)
            setSuggestionHint(suggestion.reason)
          }
        }
      } catch { /* suggestion is optional */ }
    }

    setProposeDialogOpen(true)
  }

  const handlePropose = async () => {
    if (!editingMember || !propUnitId || !propRoleId) {
      setFormError('Veuillez remplir tous les champs obligatoires.')
      return
    }
    try {
      await proposeMutation.mutateAsync({
        memberId: editingMember.memberId,
        scoutYear: passageScoutYear,
        proposedUnitId: propUnitId,
        proposedTeamId: propTeamId || null,
        proposedRoleId: propRoleId,
        cuNotes: propNotes || null,
      })
      toast.success('Proposition enregistree')
      setProposeDialogOpen(false)
    } catch (err) {
      setFormError(parseApiError(err))
    }
  }

  const openBulk = (mode: 'same' | 'move') => {
    setBulkMode(mode)
    if (mode === 'same') {
      // For "no change", we'll use the first selected member's current unit
      const firstSelected = memberRows.find(m => selected.has(m.memberId))
      if (firstSelected) {
        setPropUnitId(firstSelected.currentUnitId)
        setPropRoleId(firstSelected.currentRoleId)
        setPropTeamId(firstSelected.currentTeamId ?? '')
      }
    } else {
      setPropUnitId('')
      setPropTeamId('')
      setPropRoleId('')
    }
    setPropNotes('')
    setFormError('')
    setBulkDialogOpen(true)
  }

  const handleBulk = async () => {
    if (!propUnitId || !propRoleId) {
      setFormError('Veuillez remplir tous les champs obligatoires.')
      return
    }
    try {
      const result = await bulkProposeMutation.mutateAsync({
        memberIds: Array.from(selected),
        scoutYear: passageScoutYear,
        proposedUnitId: propUnitId,
        proposedTeamId: propTeamId || null,
        proposedRoleId: propRoleId,
        cuNotes: propNotes || null,
      })
      toast.success(`${result.count} proposition(s) enregistree(s)`)
      setBulkDialogOpen(false)
      setSelected(new Set())
    } catch (err) {
      setFormError(parseApiError(err))
    }
  }

  const handleBulkDelete = async () => {
    const passagesToDelete = memberRows.filter(m => selected.has(m.memberId) && m.passage).map(m => m.passage!)
    let count = 0
    for (const p of passagesToDelete) {
      try {
        await deleteMutation.mutateAsync(p.id)
        count++
      } catch { /* skip */ }
    }
    if (count > 0) toast.success(`${count} proposition(s) supprimee(s)`)
    setSelected(new Set())
  }

  const handleDelete = async () => {
    if (!deletingPassage) return
    try {
      await deleteMutation.mutateAsync(deletingPassage.id)
      toast.success('Proposition supprimee')
      setDeletingPassage(null)
    } catch (err) {
      toast.error(parseApiError(err))
      setDeletingPassage(null)
    }
  }

  const statusBadge = (passage: PassageDto) => {
    if (passage.isLeaving) return <Badge className="bg-orange-600">Quitte le groupe{passage.status === 'Approved' ? ' ✓' : passage.status === 'Rejected' ? ' ✗' : ''}</Badge>
    switch (passage.status) {
      case 'Approved': return <Badge className="bg-green-600">{passage.proposedUnitId === passage.currentUnitId && passage.proposedRoleName === passage.currentRoleName ? 'Pas de changement' : 'Approuvé'}</Badge>
      case 'Rejected': return <Badge variant="destructive">Rejeté</Badge>
      case 'Finalized': return <Badge className="bg-blue-600">Finalisé</Badge>
      default: return <Badge variant="secondary">En attente</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Passage annuel — {passageScoutYear}</h1>
          <p className="text-sm text-muted-foreground mt-1">{unitName}</p>
        </div>
        <Badge className="bg-green-600 text-sm">Passage ouvert</Badge>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <Card>
          <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 py-3">
            <span className="text-sm font-medium">{selected.size} membre(s) selectionne(s)</span>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button size="sm" variant="outline" onClick={() => openBulk('same')}>
                <Check className="mr-1 h-4 w-4" />Pas de changement
              </Button>
              <Button size="sm" onClick={() => openBulk('move')}>
                <ArrowRight className="mr-1 h-4 w-4" />Deplacer vers...
              </Button>
              <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
                <Trash2 className="mr-1 h-4 w-4" />Supprimer la proposition
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {memberRows.length === 0 ? (
        <EmptyState icon={Users} title="Aucun membre" description="Aucun membre actif dans cette unite." />
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === memberRows.length && memberRows.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium">Membre</th>
                <th className="px-3 py-2 text-left font-medium">Age</th>
                <th className="px-3 py-2 text-left font-medium">Unite actuelle</th>
                <th className="px-3 py-2 text-left font-medium">Equipe</th>
                <th className="px-3 py-2 text-left font-medium">Proposition</th>
                <th className="px-3 py-2 text-left font-medium">Notes</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {memberRows.map((row, idx) => (
                <tr key={row.memberId} className={`border-b hover:bg-muted/20 ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(row.memberId)}
                      onChange={() => toggleSelect(row.memberId)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{row.memberName}</div>
                    {row.cardNumber && <div className="text-xs text-muted-foreground">{row.cardNumber}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {row.age !== null ? `${row.age} ans` : '-'}
                      {/* Age warning placeholder — would need unit type age ranges from backend */}
                    </div>
                  </td>
                  <td className="px-3 py-2">{row.currentUnitName}</td>
                  <td className="px-3 py-2">{row.currentTeamName ?? '-'}</td>
                  <td className="px-3 py-2">
                    {row.passage ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs">{row.passage.proposedUnitName}</span>
                          {row.passage.proposedTeamName && (
                            <span className="text-xs text-muted-foreground">/ {row.passage.proposedTeamName}</span>
                          )}
                        </div>
                        {row.passage.proposedRoleName !== row.currentRoleName && (
                          <div className="text-xs text-blue-600">Fonction : {row.passage.proposedRoleName}</div>
                        )}
                        {statusBadge(row.passage)}
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={async () => {
                          try {
                            await proposeMutation.mutateAsync({
                              memberId: row.memberId,
                              scoutYear: passageScoutYear,
                              proposedUnitId: row.currentUnitId,
                              proposedTeamId: row.currentTeamId,
                              proposedRoleId: row.currentRoleId,
                              cuNotes: null,
                            })
                            toast.success('Pas de changement enregistré')
                          } catch (err) { toast.error(parseApiError(err)) }
                        }} disabled={proposeMutation.isPending}>
                          <Check className="mr-1 h-3 w-3" />Pas de changement
                        </Button>
                        <Button size="sm" onClick={() => openPropose(row)}>
                          Proposer
                        </Button>
                        <Button size="sm" variant="ghost" className="text-orange-600 hover:text-orange-700" title="Quitte le groupe" onClick={async () => {
                          try {
                            await proposeMutation.mutateAsync({
                              memberId: row.memberId,
                              scoutYear: passageScoutYear,
                              proposedUnitId: row.currentUnitId,
                              proposedTeamId: row.currentTeamId,
                              proposedRoleId: row.currentRoleId,
                              cuNotes: null,
                              isLeaving: true,
                            })
                            toast.success('Départ enregistré (en attente de validation)')
                          } catch (err) { toast.error(parseApiError(err)) }
                        }} disabled={proposeMutation.isPending}>
                          <LogOut className="mr-1 h-3 w-3" />Quitte le groupe
                        </Button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[150px] truncate">
                    {row.passage?.cuNotes ?? ''}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {row.passage && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPropose(row)} title="Modifier">
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletingPassage(row.passage)} title="Supprimer">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Propose Dialog (single member) */}
      <Dialog open={proposeDialogOpen} onOpenChange={setProposeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Proposer un passage — {editingMember?.memberName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {formError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}

            {suggestionHint && (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-700 flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                {suggestionHint}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Unité de destination</label>
              <Select value={propUnitId} onValueChange={(v) => { setPropUnitId(v); setPropTeamId('') }}>
                <SelectTrigger><SelectValue placeholder="Selectionner une unite" /></SelectTrigger>
                <SelectContent>
                  {units.map(u => <SelectItem key={u.id} value={u.id}>{u.code} — {u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {propUnitId === editingMember?.currentUnitId && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Équipe</label>
                <Select value={propTeamId || '_none'} onValueChange={(v) => setPropTeamId(v === '_none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Aucune équipe" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Aucune équipe</SelectItem>
                    {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {propUnitId !== editingMember?.currentUnitId && (
              <p className="text-xs text-muted-foreground rounded-md bg-muted/50 p-2">L'équipe sera assignée par le nouveau chef d'unité après le passage.</p>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Fonction</label>
              <Select value={propRoleId} onValueChange={setPropRoleId}>
                <SelectTrigger><SelectValue placeholder="Selectionner une fonction" /></SelectTrigger>
                <SelectContent>
                  {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Input
                value={propNotes}
                onChange={e => setPropNotes(e.target.value)}
                placeholder="Notes pour la Maîtrise de Groupe..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProposeDialogOpen(false)}>Annuler</Button>
            <Button onClick={handlePropose} disabled={proposeMutation.isPending}>
              {proposeMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Propose Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkMode === 'same' ? 'Pas de changement' : 'Deplacer vers...'}
              {' — '}{selected.size} membre(s)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {formError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}

            {bulkMode === 'move' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Unite de destination</label>
                  <Select value={propUnitId} onValueChange={(v) => { setPropUnitId(v); setPropTeamId('') }}>
                    <SelectTrigger><SelectValue placeholder="Selectionner une unite" /></SelectTrigger>
                    <SelectContent>
                      {units.map(u => <SelectItem key={u.id} value={u.id}>{u.code} — {u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {propUnitId === unitId ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Équipe</label>
                    <Select value={propTeamId || '_none'} onValueChange={(v) => setPropTeamId(v === '_none' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Aucune équipe" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Aucune équipe</SelectItem>
                        {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : propUnitId && (
                  <p className="text-xs text-muted-foreground rounded-md bg-muted/50 p-2">L'équipe sera assignée par le nouveau chef d'unité après le passage.</p>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Fonction</label>
                  <Select value={propRoleId} onValueChange={setPropRoleId}>
                    <SelectTrigger><SelectValue placeholder="Selectionner une fonction" /></SelectTrigger>
                    <SelectContent>
                      {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Input
                value={propNotes}
                onChange={e => setPropNotes(e.target.value)}
                placeholder="Notes pour la Maîtrise de Groupe..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleBulk} disabled={bulkProposeMutation.isPending}>
              {bulkProposeMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deletingPassage}
        onOpenChange={() => setDeletingPassage(null)}
        title="Supprimer la proposition"
        description="Etes-vous sur de vouloir supprimer cette proposition de passage ?"
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
