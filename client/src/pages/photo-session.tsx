import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { useMembers, useUploadPhoto, type MemberListDto } from '@/services/member-service'
import { MemberPhoto } from '@/components/shared/member-photo'
import { CameraCapture } from '@/components/shared/camera-capture'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Check, ArrowLeft, Camera, Users } from 'lucide-react'

function PhotoUploader({ memberId, memberName, onDone }: { memberId: string; memberName: string; onDone: () => void }) {
  const uploadMutation = useUploadPhoto(memberId)
  const [uploading, setUploading] = useState(false)

  const handleCapture = async (blob: Blob) => {
    const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' })
    setUploading(true)
    try {
      await uploadMutation.mutateAsync(file)
      toast.success(`Photo de ${memberName} enregistree`)
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
        <p className="text-sm text-muted-foreground">Envoi en cours...</p>
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

export default function PhotoSessionPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const unitId = user?.unitAccess[0]?.unitId ?? ''
  const unitName = user?.unitAccess[0]?.unitName ?? ''

  const { data: membersData, isLoading } = useMembers({ unitId, pageSize: 500 })
  const members = membersData?.items ?? []

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [capturedPhotos, setCapturedPhotos] = useState<Set<string>>(new Set())
  const [photoRefreshKeys, setPhotoRefreshKeys] = useState<Record<string, number>>({})

  const totalMembers = members.length
  const withPhotos = members.filter(m => m.photoPath || capturedPhotos.has(m.id)).length

  const selectedMember = members.find(m => m.id === selectedMemberId)

  const handleDone = () => {
    if (selectedMemberId) {
      setCapturedPhotos(prev => new Set(prev).add(selectedMemberId))
      setPhotoRefreshKeys(prev => ({ ...prev, [selectedMemberId]: (prev[selectedMemberId] ?? 0) + 1 }))
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner variant="cards" />
      </div>
    )
  }

  if (!unitId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Users className="h-12 w-12 opacity-30" />
        <p className="text-sm">Aucune unite assignee.</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/')}>
          Retour
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="shrink-0 space-y-3 pb-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Session photo — {unitName}</h1>
          </div>
        </div>
        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: totalMembers > 0 ? `${(withPhotos / totalMembers) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-sm font-medium">{withPhotos}/{totalMembers} photos</span>
        </div>
      </div>

      {/* 2-column layout */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 rounded-lg border overflow-hidden">
        {/* Left: member list */}
        <div className="md:w-72 shrink-0 overflow-y-auto bg-muted/30 border-b md:border-b-0 md:border-r max-h-48 md:max-h-full">
          {members.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4">
              Aucun membre dans cette unite
            </div>
          ) : (
            members.map((m: MemberListDto) => (
              <div
                key={m.id}
                className={cn(
                  'flex items-center gap-3 p-2 cursor-pointer transition-colors border-b border-border/40',
                  selectedMemberId === m.id ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-muted/50',
                )}
                onClick={() => setSelectedMemberId(m.id)}
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
                    <div className="absolute -bottom-0.5 -right-0.5 bg-green-500 rounded-full p-0.5">
                      <Check className="h-2.5 w-2.5 text-white" />
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
        <div className="flex-1 min-w-0 overflow-auto flex items-center justify-center p-6">
          {selectedMember ? (
            <div className="flex flex-col items-center gap-4 w-full max-w-md">
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
              <p className="text-sm">Selectionnez un membre pour prendre sa photo</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
