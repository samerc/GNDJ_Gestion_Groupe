import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useUploadPhoto, useDeletePhoto } from '@/services/member-service'
import { parseApiError } from '@/lib/error-utils'
import apiClient from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Camera, UserRound, X } from 'lucide-react'
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
  const { data: src = null } = useQuery({
    queryKey: ['member-photo', memberId, photoPath, refreshKey],
    queryFn: () => apiClient.get(`/members/${memberId}/photo`, { responseType: 'blob' }).then((r) => URL.createObjectURL(r.data)),
    enabled: !!photoPath && inView,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: false,
  })

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      await uploadMutation.mutateAsync(file)
      toast.success('Photo mise à jour')
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setLoading(false)
      e.target.value = ''
    }
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

  return (
    <div className="relative inline-block" style={{ width: size, height: h }}>
      {photoElement}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover transition-colors"
        style={{ width: size * 0.35, height: size * 0.35, minWidth: 20, minHeight: 20 }}
        title="Modifier la photo"
      >
        <Camera style={{ width: size * 0.2, height: size * 0.2, minWidth: 12, minHeight: 12 }} />
      </button>
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
