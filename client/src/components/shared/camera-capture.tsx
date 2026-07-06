// In-app webcam capture for member photos (used by the photo-session workflow).
// Opens getUserMedia, frames a 3:4 portrait with a dashed head/shoulders silhouette guide, and on
// capture cover-crops the live frame to a fixed 600x800 JPEG (quality 0.85) handed back via onCapture.
// Supports front/back camera toggle (facingMode) and falls back to a file import on desktop or when
// camera access is denied. Has a capture -> preview (Garder/Reprendre) confirm step.
import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { SwitchCamera, Camera, RotateCcw, Check, Upload } from 'lucide-react'

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void
  onCancel: () => void
}

export function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [captured, setCaptured] = useState<string | null>(null)
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)

  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    // Stop existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setStarting(true)
    setCameraError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 800 }, height: { ideal: 1067 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setStarting(false)
    } catch {
      setCameraError("Impossible d'acceder a la camera. Verifiez les permissions ou utilisez l'import fichier.")
      setStarting(false)
    }
  }, [])

  useEffect(() => {
    // Genuine side-effect: opens the camera stream on mount (startCamera sets loading/error flags as
    // part of an async operation) and stops the tracks on unmount — legitimately an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startCamera(facingMode)
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleCamera = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    startCamera(next)
  }

  const handleCapture = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const outW = 600
    const outH = 800
    canvas.width = outW
    canvas.height = outH

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Compute cover crop from video
    const vw = video.videoWidth
    const vh = video.videoHeight
    const targetRatio = outW / outH
    const videoRatio = vw / vh

    let sx = 0, sy = 0, sw = vw, sh = vh
    if (videoRatio > targetRatio) {
      // Video is wider — crop sides
      sw = vh * targetRatio
      sx = (vw - sw) / 2
    } else {
      // Video is taller — crop top/bottom
      sh = vw / targetRatio
      sy = (vh - sh) / 2
    }

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH)

    canvas.toBlob(
      (blob) => {
        if (blob) {
          setCapturedBlob(blob)
          setCaptured(URL.createObjectURL(blob))
        }
      },
      'image/jpeg',
      0.85
    )
  }

  const handleRetake = () => {
    if (captured) URL.revokeObjectURL(captured)
    setCaptured(null)
    setCapturedBlob(null)
  }

  const handleKeep = () => {
    if (capturedBlob) {
      onCapture(capturedBlob)
      // Clean up after handing off
      if (captured) URL.revokeObjectURL(captured)
      setCaptured(null)
      setCapturedBlob(null)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return

      const outW = 600
      const outH = 800
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const targetRatio = outW / outH
      const imgRatio = img.width / img.height
      let sx = 0, sy = 0, sw = img.width, sh = img.height
      if (imgRatio > targetRatio) {
        sw = img.height * targetRatio
        sx = (img.width - sw) / 2
      } else {
        sh = img.width / targetRatio
        sy = (img.height - sh) / 2
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)
      URL.revokeObjectURL(url)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            setCapturedBlob(blob)
            setCaptured(URL.createObjectURL(blob))
          }
        },
        'image/jpeg',
        0.85
      )
    }
    img.src = url
    e.target.value = ''
  }

  // Hidden canvas for capture
  const hiddenCanvas = <canvas ref={canvasRef} className="hidden" />

  // Captured preview
  if (captured) {
    return (
      <div className="flex flex-col items-center gap-4">
        {hiddenCanvas}
        <div className="relative w-full max-w-sm aspect-[3/4] rounded-lg overflow-hidden bg-black">
          <img src={captured} alt="Apercu" className="w-full h-full object-cover" />
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleRetake}>
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Reprendre
          </Button>
          <Button onClick={handleKeep}>
            <Check className="mr-1.5 h-4 w-4" />
            Garder
          </Button>
        </div>
      </div>
    )
  }

  // Camera error — fallback to file upload
  if (cameraError) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        {hiddenCanvas}
        <p className="text-sm text-muted-foreground text-center max-w-xs">{cameraError}</p>
        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
          <Upload className="mr-1.5 h-4 w-4" />
          Importer une photo
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={handleFileUpload}
        />
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    )
  }

  // Live viewfinder
  return (
    <div className="flex flex-col items-center gap-4">
      {hiddenCanvas}
      <div className="relative w-full max-w-sm aspect-[3/4] rounded-lg overflow-hidden bg-black">
        {starting && (
          <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm">
            Demarrage de la camera...
          </div>
        )}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {/* Silhouette overlay */}
        <svg
          viewBox="0 0 200 280"
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ opacity: 0.3 }}
        >
          {/* Head */}
          <circle cx="100" cy="85" r="45" fill="none" stroke="white" strokeWidth="2" strokeDasharray="8 4" />
          {/* Shoulders */}
          <path
            d="M 30 210 Q 30 160 100 150 Q 170 160 170 210"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeDasharray="8 4"
          />
        </svg>
        {/* Camera toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 text-white hover:bg-white/20 h-8 w-8"
          onClick={toggleCamera}
        >
          <SwitchCamera className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        <Button onClick={handleCapture} disabled={starting}>
          <Camera className="mr-1.5 h-4 w-4" />
          Capturer
        </Button>
      </div>
      {/* Fallback file upload link */}
      <button
        type="button"
        className="text-xs text-muted-foreground hover:underline"
        onClick={() => fileInputRef.current?.click()}
      >
        Ou importer depuis un fichier
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={handleFileUpload}
      />
    </div>
  )
}
