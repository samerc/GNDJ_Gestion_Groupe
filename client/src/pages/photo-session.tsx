import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { useMembers, useUploadPhoto, type MemberListDto } from '@/services/member-service'
import { MemberPhoto } from '@/components/shared/member-photo'
import { CameraCapture } from '@/components/shared/camera-capture'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { BackLink } from '@/components/shared/back-link'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLeaderUnits } from '@/hooks/use-leader-units'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Check, ArrowRight, Camera, Users, List } from 'lucide-react'
import { useMobileDetail } from '@/hooks/use-mobile-detail'

// Camera capture for one member: snaps a photo, uploads it as a JPEG, then signals `onDone`.
function PhotoUploader({ memberId, memberName, onDone }: { memberId: string; memberName: string; onDone: () => void }) {
  const uploadMutation = useUploadPhoto(memberId)
  const [uploading, setUploading] = useState(false)

  const handleCapture = async (blob: Blob) => {
    const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' })
    setUploading(true)
    try {
      await uploadMutation.mutateAsync(file)
      toast.success(`Photo de ${memberName} enregistrée`)
      onDone()
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setUploading(false)
    }
  }

  if (uploading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <LoadingSpinner />
        <p className="text-sm text-muted-foreground">Envoi en cours…</p>
      </div>
    )
  }

  return (
    <CameraCapture
      onCapture={handleCapture}
      onCancel={() => {}}
    />
  )
}

// Batch photo workflow for a unit leader: pick a member from the list, capture their photo, repeat.
// A progress bar tracks how many members now have a photo. Scoped to the leader's first unit.
export default function PhotoSessionPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  // Units this leader runs (CU/ACU). A CU leading >1 unit gets a picker in the header; before, the page was
  // hardcoded to unitAccess[0] so a multi-unit CU could only ever photograph their first unit.
  const leaderUnits = useLeaderUnits()
  const [selectedUnit, setSelectedUnit] = useState('')
  const unitId = selectedUnit || leaderUnits[0]?.unitId || user?.unitAccess[0]?.unitId || ''
  const unitName = leaderUnits.find(u => u.unitId === unitId)?.unitName
    ?? user?.unitAccess.find(u => u.unitId === unitId)?.unitName ?? ''

  const { data: membersData, isLoading } = useMembers({ unitId, pageSize: 500 })
  const members = useMemo(() => membersData?.items ?? [], [membersData])

  // Phone: the member list fills the screen; tapping a member swaps to the camera (the phone's back button
  // returns to the list). Larger screens keep the list and the camera side by side.
  const { selectedId: selectedMemberId, setSelectedId: setSelectedMemberId, open: openMember, close: closeMember } = useMobileDetail()
  // Members photographed this session — drives the green check + progress before the list refetches.
  const [capturedPhotos, setCapturedPhotos] = useState<Set<string>>(new Set())
  // Per-member counter bumped after a capture to force MemberPhoto to re-fetch the (now updated) image.
  const [photoRefreshKeys, setPhotoRefreshKeys] = useState<Record<string, number>>({})

  const totalMembers = members.length
  // "Has a photo" = either already stored (photoPath) or captured during this session.
  const withPhotos = useMemo(() => members.filter(m => m.photoPath || capturedPhotos.has(m.id)).length, [members, capturedPhotos])

  const selectedMember = useMemo(() => members.find(m => m.id === selectedMemberId), [members, selectedMemberId])
  // Next member (after the current one, wrapping) who still has no photo — the "Suivant" shortcut on a phone.
  const nextWithoutPhoto = useMemo(() => {
    const i = members.findIndex(m => m.id === selectedMemberId)
    const order = [...members.slice(i + 1), ...members.slice(0, Math.max(i, 0))]
    return order.find(m => !m.photoPath && !capturedPhotos.has(m.id)) ?? null
  }, [members, selectedMemberId, capturedPhotos])

  // After an upload: mark the member done and bump its refresh key so the thumbnail reloads.
  const handleDone = () => {
    if (selectedMemberId) {
      setCapturedPhotos(prev => new Set(prev).add(selectedMemberId))
      setPhotoRefreshKeys(prev => ({ ...prev, [selectedMemberId]: (prev[selectedMemberId] ?? 0) + 1 }))
    }
  }

  if (isLoading) return <LoadingSpinner variant="page" />

  if (!unitId) {
    return (
      <EmptyState
        icon={Users}
        title="Aucune unité assignée"
        action={<Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>Retour</Button>}
      />
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="shrink-0 space-y-3 pb-3">
        <BackLink to="/dashboard" label="Mon unité" />
        <PageHeader
          title="Session photo"
          icon={Camera}
          description={unitName}
          actions={leaderUnits.length > 1 ? (
            <Select value={unitId} onValueChange={(v) => { setSelectedUnit(v); setSelectedMemberId(null) }}>
              <SelectTrigger className="h-9 w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {leaderUnits.map(u => <SelectItem key={u.unitId} value={u.unitId}>{u.unitName}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : undefined}
        />
        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-success rounded-full transition-all"
              style={{ width: totalMembers > 0 ? `${(withPhotos / totalMembers) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-sm font-medium">{withPhotos}/{totalMembers} photos</span>
        </div>
      </div>

      {/* 2-column layout */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 rounded-lg border overflow-hidden">
        {/* Left: member list */}
        <div className={cn('flex-1 overflow-y-auto bg-muted/30 md:w-72 md:flex-none md:shrink-0 md:border-r', selectedMemberId && 'hidden md:block')}>
          {members.length === 0 ? (
            <EmptyState icon={Users} title="Aucun membre dans cette unité" />
          ) : (
            members.map((m: MemberListDto) => (
              <div
                key={m.id}
                className={cn(
                  'flex items-center gap-3 p-2 cursor-pointer transition-colors border-b border-border/40',
                  selectedMemberId === m.id ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-muted/50',
                )}
                onClick={() => openMember(m.id)}
              >
                <div className="relative">
                  <MemberPhoto
                    memberId={m.id}
                    name={`${m.firstName} ${m.lastName}`}
                    photoPath={m.photoPath}
                    size={32}
                    refreshKey={photoRefreshKeys[m.id] ?? 0}
                  />
                  {(m.photoPath || capturedPhotos.has(m.id)) && (
                    <div className="absolute -bottom-0.5 -right-0.5 bg-success rounded-full p-0.5">
                      <Check className="h-2.5 w-2.5 text-success-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.firstName} {m.lastName}</p>
                  <p className="text-xs text-muted-foreground">{m.cardNumber}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right: camera area */}
        <div className={cn('flex-1 min-w-0 overflow-auto items-center justify-center p-4 md:flex md:p-6', selectedMemberId ? 'flex' : 'hidden')}>
          {selectedMember ? (
            <div className="flex flex-col items-center gap-4 w-full max-w-md">
              {/* Phone only: back to the list, or straight to the next member without a photo. */}
              <div className="flex w-full items-center justify-between gap-2 md:hidden">
                <Button variant="outline" size="sm" onClick={closeMember}><List className="mr-1 h-4 w-4" />Liste</Button>
                {nextWithoutPhoto && (
                  <Button variant="outline" size="sm" onClick={() => openMember(nextWithoutPhoto.id)}>
                    Suivant<ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="text-center">
                <h2 className="text-lg font-semibold">
                  {selectedMember.firstName} {selectedMember.lastName}
                </h2>
                {selectedMember.cardNumber && (
                  <p className="text-sm text-muted-foreground">{selectedMember.cardNumber}</p>
                )}
              </div>
              <PhotoUploader
                key={selectedMemberId}
                memberId={selectedMemberId!}
                memberName={`${selectedMember.firstName} ${selectedMember.lastName}`}
                onDone={handleDone}
              />
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
              <Camera className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Sélectionnez un membre pour prendre sa photo</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
