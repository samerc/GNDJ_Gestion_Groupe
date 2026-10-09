import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useUploadPhoto, useDeletePhoto } from '@/services/member-service'
import { parseApiError } from '@/lib/error-utils'
import apiClient from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Camera, ImageUp, UserRound, X } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { usePhotoSessionEnabled } from '@/services/settings-service'

// The camera (silhouette frame) is only loaded when someone actually takes a photo.
const CameraCapture = lazy(() => import('@/components/shared/camera-capture').then((m) => ({ default: m.CameraCapture })))
import { toast } from 'sonner'
import { confirmAsync } from '@/lib/confirm'

interface MemberPhotoProps {
  memberId: string
  name: string
  photoPath: string | null
  size?: number
  /** Optional explicit height (px); defaults to `size` (square). Use for 3:4 portraits. */
  height?: number
  /** Tailwind rounding class; defaults to a circle. */
  rounded?: string
  editable?: boolean
  className?: string
  /** Increment to force refresh after external upload */
  refreshKey?: number
  /** What to show when there is no photo: the initials (default) or a grey silhouette. */
  placeholder?: 'initials' | 'silhouette'
}

export function MemberPhoto({ memberId, name, photoPath, size = 40, height, rounded = 'rounded-full', editable = false, className, refreshKey = 0, placeholder = 'initials' }: MemberPhotoProps) {
  const h = height ?? size
  const [loading, setLoading] = useState(false)
  const [inView, setInView] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const elRef = useRef<HTMLElement | null>(null)
  const uploadMutation = useUploadPhoto(memberId)
  const deleteMutation = useDeletePhoto(memberId)
  // « Prendre une photo » (camera with the silhouette frame) is offered next to « Choisir une photo » — unless the
  // CG switched the photo session off (Paramètres → Membres), then the camera button picks a file directly.
  const cameraOn = usePhotoSessionEnabled()
  const [cameraOpen, setCameraOpen] = useState(false)

  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  // Lazy-load the photo: only fetch once the avatar scrolls near the viewport. Each photo is an
  // authenticated blob XHR (so native loading="lazy" can't apply), and pages like photo-session render
  // a whole unit at once — without this they'd fire a burst of full-res requests on mount. One-shot.
  useEffect(() => {
    const el = elRef.current
    if (!el || inView) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [inView])

  // The photo itself, cached by member + file (a new upload changes photoPath → new entry): going back to a list no
  // longer re-downloads every photo. The blob URL is freed when the cache entry is dropped (lib/query-client.ts),
  // and the whole cache is cleared at login/logout.
  // Small avatars / photo walls load the server's thumbnail (≤320 px tall, a few dozen KB) instead of the original
  // (often several MB from a phone); only big views (taller than 160 px) fetch the full photo.
  const thumb = h <= 160
  const { data: src = null } = useQuery({
    queryKey: ['member-photo', memberId, photoPath, refreshKey, thumb ? 'thumb' : 'full'],
    queryFn: () => apiClient.get(`/members/${memberId}/photo`, { responseType: 'blob', params: thumb ? { size: 'thumb' } : undefined })
      .then((r) => URL.createObjectURL(r.data)),
    enabled: !!photoPath && inView,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: false,
  })

  const upload = async (file: File) => {
    setLoading(true)
    try {
      await uploadMutation.mutateAsync(file)
      toast.success('Photo mise à jour')
      return true
    } catch (err) {
      toast.error(parseApiError(err))
      return false
    } finally {
      setLoading(false)
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) await upload(file)
  }

  // The camera hands back a 600×800 JPEG already cropped to the frame.
  const handleCapture = async (blob: Blob) => {
    if (await upload(new File([blob], 'photo.jpg', { type: 'image/jpeg' }))) setCameraOpen(false)
  }

  const handlePhotoDelete = async () => {
    if (!(await confirmAsync({ title: 'Supprimer la photo ?', description: 'La photo de ce membre sera supprimée.', confirmLabel: 'Supprimer', destructive: true }))) return
    setLoading(true)
    try {
      await deleteMutation.mutateAsync()
      toast.success('Photo supprimée')
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setLoading(false)
    }
  }

  const photoElement = src ? (
    <img
      ref={el => { elRef.current = el }}
      src={src}
      alt={name}
      className={cn(rounded, 'object-cover', className)}
      style={{ width: size, height: h }}
    />
  ) : placeholder === 'silhouette' ? (
    <div
      ref={el => { elRef.current = el }}
      className={cn('flex items-end justify-center overflow-hidden bg-muted text-muted-foreground/40', rounded, className)}
      style={{ width: size, height: h }}
      aria-label={`${name} — pas de photo`}
    >
      <UserRound style={{ width: size * 0.9, height: size * 0.9 }} strokeWidth={1.25} />
    </div>
  ) : (
    <div
      ref={el => { elRef.current = el }}
      className={cn(
        'flex items-center justify-center bg-primary/10 text-primary font-semibold',
        rounded,
        className,
      )}
      style={{ width: size, height: h, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  )

  if (!editable) return photoElement

  const cameraButtonClass = 'absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover transition-colors'
  const cameraButtonStyle = { width: size * 0.35, height: size * 0.35, minWidth: 20, minHeight: 20 }
  const cameraIconStyle = { width: size * 0.2, height: size * 0.2, minWidth: 12, minHeight: 12 }

  return (
    <div className="relative inline-block" style={{ width: size, height: h }}>
      {photoElement}
      {cameraOn ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" disabled={loading} className={cameraButtonClass} style={cameraButtonStyle} title="Modifier la photo">
              <Camera style={cameraIconStyle} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setCameraOpen(true)}>
              <Camera className="mr-2 h-4 w-4" />Prendre une photo
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
              <ImageUp className="mr-2 h-4 w-4" />Choisir une photo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={loading}
          className={cameraButtonClass} style={cameraButtonStyle} title="Modifier la photo">
          <Camera style={cameraIconStyle} />
        </button>
      )}
      <Dialog open={cameraOpen} onOpenChange={(o) => { if (!o && !loading) setCameraOpen(false) }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader><DialogTitle>Photo de {name}</DialogTitle></DialogHeader>
          {cameraOpen && (loading
            ? <div className="flex justify-center py-12"><LoadingSpinner /></div>
            : (
              <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
                <CameraCapture onCapture={handleCapture} onCancel={() => setCameraOpen(false)} />
              </Suspense>
            ))}
        </DialogContent>
      </Dialog>
      {/* Delete affordance — only when there's actually a photo to remove. Sits top-right, opposite the
          camera button, so it never overlaps it. */}
      {src && (
        <button
          type="button"
          onClick={handlePhotoDelete}
          disabled={loading}
          className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full bg-destructive text-white shadow-sm hover:bg-destructive-hover transition-colors"
          style={{ width: size * 0.35, height: size * 0.35, minWidth: 20, minHeight: 20 }}
          title="Supprimer la photo"
        >
          <X style={{ width: size * 0.2, height: size * 0.2, minWidth: 12, minHeight: 12 }} />
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={handlePhotoUpload}
      />
    </div>
  )
}
