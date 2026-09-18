'use client'

import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

const SIGNATURE_FONTS = [
  { key: 'dancing', label: 'Cursive', css: "'Dancing Script', cursive" },
  { key: 'great-vibes', label: 'Script', css: "'Great Vibes', cursive" },
] as const

let fontsLoaded = false
function ensureSignatureFonts() {
  if (fontsLoaded || typeof document === 'undefined') return
  fontsLoaded = true
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Great+Vibes&display=swap'
  document.head.appendChild(link)
}

function bytesFromDataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || ''
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function SignatureModal({
  open,
  onClose,
  onInsert,
}: {
  open: boolean
  onClose: () => void
  onInsert: (result: { dataUrl: string; bytes: Uint8Array; naturalAspect: number }) => void
}) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw')
  const [typedName, setTypedName] = useState('')
  const [fontKey, setFontKey] = useState<(typeof SIGNATURE_FONTS)[number]['key']>('dancing')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasStrokes, setHasStrokes] = useState(false)

  useEffect(() => {
    if (open) ensureSignatureFonts()
  }, [open])

  useEffect(() => {
    if (!open || mode !== 'draw') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#111111'
    setHasStrokes(false)
  }, [open, mode])

  if (!open) return null

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    drawing.current = true
    const p = canvasPoint(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = canvasPoint(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setHasStrokes(true)
  }

  function onPointerUp() {
    drawing.current = false
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasStrokes(false)
  }

  function insertDrawn() {
    const canvas = canvasRef.current
    if (!canvas || !hasStrokes) return
    const dataUrl = canvas.toDataURL('image/png')
    onInsert({ dataUrl, bytes: bytesFromDataUrl(dataUrl), naturalAspect: canvas.width / canvas.height })
  }

  function insertTyped() {
    const name = typedName.trim()
    if (!name) return
    const font = SIGNATURE_FONTS.find((f) => f.key === fontKey) || SIGNATURE_FONTS[0]
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 240
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#111111'
    ctx.font = `64px ${font.css}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name, canvas.width / 2, canvas.height / 2)
    const dataUrl = canvas.toDataURL('image/png')
    onInsert({ dataUrl, bytes: bytesFromDataUrl(dataUrl), naturalAspect: canvas.width / canvas.height })
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl bg-background p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">Add your signature</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-foreground/10"
          >
            ×
          </button>
        </div>

        <div className="mt-4 flex gap-1 rounded-lg border border-foreground/10 p-1">
          <button
            type="button"
            onClick={() => setMode('draw')}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium ${mode === 'draw' ? 'bg-foreground text-background' : 'hover:bg-foreground/5'}`}
          >
            Draw
          </button>
          <button
            type="button"
            onClick={() => setMode('type')}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium ${mode === 'type' ? 'bg-foreground text-background' : 'hover:bg-foreground/5'}`}
          >
            Type
          </button>
        </div>

        {mode === 'draw' ? (
          <>
            <div className="mt-4 overflow-hidden rounded-xl border border-foreground/15 bg-white">
              <canvas
                ref={canvasRef}
                width={600}
                height={220}
                className="h-[180px] w-full touch-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={clearCanvas}
                className="inline-flex items-center gap-1.5 text-xs text-foreground/55 hover:text-foreground"
              >
                <Eraser className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
            <button
              type="button"
              onClick={insertDrawn}
              disabled={!hasStrokes}
              className="mt-4 w-full rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
            >
              Use this signature
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Type your name"
              className="mt-4 w-full rounded-lg border border-foreground/15 bg-transparent px-3 py-2 text-sm"
            />
            <div className="mt-2 flex gap-2">
              {SIGNATURE_FONTS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFontKey(f.key)}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${fontKey === f.key ? 'border-foreground bg-foreground/10' : 'border-foreground/15'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex h-[100px] items-center justify-center rounded-xl border border-foreground/15 bg-white px-4">
              <span
                className="text-4xl text-black"
                style={{ fontFamily: SIGNATURE_FONTS.find((f) => f.key === fontKey)?.css }}
              >
                {typedName || 'Your name'}
              </span>
            </div>
            <button
              type="button"
              onClick={insertTyped}
              disabled={!typedName.trim()}
              className="mt-4 w-full rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
            >
              Use this signature
            </button>
          </>
        )}
      </div>
    </div>
  )
}
