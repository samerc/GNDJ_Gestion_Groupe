// A box to sign with a finger (phone) or the mouse: draws with pointer events on a canvas sized to its box (sharp on
// retina screens). Reports a PNG data URL after each stroke, or null when cleared. « Effacer » starts again.
import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SignaturePad({ onChange }: { onChange: (png: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [empty, setEmpty] = useState(true)

  // Size the canvas to its CSS box × device pixel ratio once mounted (a resize would erase it, so only once).
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ratio = window.devicePixelRatio || 1
    // offsetWidth/Height = layout size, unaffected by the dialog's opening zoom animation (getBoundingClientRect isn't).
    c.width = Math.round(c.offsetWidth * ratio)
    c.height = Math.round(c.offsetHeight * ratio)
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
  }, [])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Screen → canvas coordinates, corrected for any CSS transform on the way (rect is the transformed box).
    const c = e.currentTarget
    const rect = c.getBoundingClientRect()
    return { x: (e.clientX - rect.left) * (c.offsetWidth / rect.width), y: (e.clientY - rect.top) * (c.offsetHeight / rect.height) }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = point(e)
    // A dot for a simple tap.
    const ctx = e.currentTarget.getContext('2d')!
    ctx.beginPath(); ctx.arc(last.current.x, last.current.y, 1, 0, Math.PI * 2); ctx.fillStyle = '#111827'; ctx.fill()
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return
    e.preventDefault()
    const p = point(e)
    const ctx = e.currentTarget.getContext('2d')!
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    last.current = p
  }
  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    setEmpty(false)
    onChange(canvasRef.current!.toDataURL('image/png'))
  }
  const clear = () => {
    const c = canvasRef.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setEmpty(true)
    onChange(null)
  }

  return (
    <div className="space-y-1.5">
      <div className="relative rounded-lg border-2 border-dashed border-input bg-white">
        <canvas ref={canvasRef} aria-label="Cadre de signature"
          className="block h-40 w-full cursor-crosshair touch-none rounded-lg"
          onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerLeave={end} />
        {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">Signez ici avec le doigt</span>}
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={empty}><Eraser className="mr-1.5 h-4 w-4" />Effacer</Button>
      </div>
    </div>
  )
}
