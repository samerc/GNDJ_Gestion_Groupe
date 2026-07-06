import { useState, useEffect, useRef } from 'react'
import { useUploadPhoto } from '@/services/member-service'
import { parseApiError } from '@/lib/error-utils'
import apiClient from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'

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
}

export function MemberPhoto({ memberId, name, photoPath, size = 40, height, rounded = 'rounded-full', editable = false, className, refreshKey = 0 }: MemberPhotoProps) {
  const h = height ?? size
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [inView, setInView] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const elRef = useRef<HTMLElement | null>(null)
  const uploadMutation = useUploadPhoto(memberId)

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

  useEffect(() => {
    if (!photoPath || !inView) {
      // Reset while there's nothing to show; the real work below is an async blob fetch with object-URL
      // cleanup, so this is legitimately an effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSrc(null)
      return
    }
    let revoked = false
    apiClient
      .get(`/members/${memberId}/photo`, { responseType: 'blob' })
      .then(r => {
        if (!revoked) setSrc(URL.createObjectURL(r.data))
      })
      .catch(() => {
        if (!revoked) setSrc(null)
      })
    return () => {
      revoked = true
    }
  }, [memberId, photoPath, refreshKey, inView])

  // Clean up blob URL on unmount or change
  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src)
    }
  }, [src])

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

  const photoElement = src ? (
    <img
      ref={el => { elRef.current = el }}
      src={src}
      alt={name}
      className={cn(rounded, 'object-cover', className)}
      style={{ width: size, height: h }}
    />
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
        className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        style={{ width: size * 0.35, height: size * 0.35, minWidth: 20, minHeight: 20 }}
        title="Modifier la photo"
      >
        <Camera style={{ width: size * 0.2, height: size * 0.2, minWidth: 12, minHeight: 12 }} />
      </button>
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
