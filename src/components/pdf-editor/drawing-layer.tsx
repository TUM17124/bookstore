'use client'

import { useState } from 'react'
import type { AnnotationTool } from './annotation-toolbar'

export function DrawingLayer({
  tool,
  containerRef,
  color,
  onCreateShape,
  onCreateDraw,
  onCreateNote,
}: {
  tool: AnnotationTool
  containerRef: React.RefObject<HTMLDivElement | null>
  color: string
  onCreateShape: (kind: Exclude<AnnotationTool, 'select' | 'pen' | 'note'>, xf: number, yf: number, wf: number, hf: number) => void
  onCreateDraw: (points: { x: number; y: number }[], xf: number, yf: number, wf: number, hf: number) => void
  onCreateNote: (xf: number, yf: number) => void
}) {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null)
  const [penPoints, setPenPoints] = useState<{ x: number; y: number }[]>([])

  if (tool === 'select') return null

  function toFrac(e: React.PointerEvent): { x: number; y: number } {
    const box = containerRef.current
    if (!box) return { x: 0, y: 0 }
    const rect = box.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    const p = toFrac(e)
    if (tool === 'note') {
      onCreateNote(p.x, p.y)
      return
    }
    setStart(p)
    setCurrent(p)
    if (tool === 'pen') setPenPoints([p])
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start) return
    const p = toFrac(e)
    setCurrent(p)
    if (tool === 'pen') setPenPoints((prev) => [...prev, p])
  }

  function finish() {
    if (!start || !current) {
      reset()
      return
    }
    if (tool === 'pen') {
      const pts = penPoints
      if (pts.length < 2) {
        reset()
        return
      }
      const xs = pts.map((p) => p.x)
      const ys = pts.map((p) => p.y)
      const xf = Math.min(...xs)
      const yf = Math.min(...ys)
      const wf = Math.max(0.01, Math.max(...xs) - xf)
      const hf = Math.max(0.01, Math.max(...ys) - yf)
      const local = pts.map((p) => ({ x: (p.x - xf) / wf, y: (p.y - yf) / hf }))
      onCreateDraw(local, xf, yf, wf, hf)
    } else {
      const xf = Math.min(start.x, current.x)
      const yf = Math.min(start.y, current.y)
      const wf = Math.max(0.02, Math.abs(current.x - start.x))
      const hf = Math.max(0.02, Math.abs(current.y - start.y))
      onCreateShape(tool as Exclude<AnnotationTool, 'select' | 'pen' | 'note'>, xf, yf, wf, hf)
    }
    reset()
  }

  function reset() {
    setStart(null)
    setCurrent(null)
    setPenPoints([])
  }

  return (
    <div
      className="absolute inset-0 z-20 touch-none"
      style={{ cursor: 'crosshair' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {tool === 'pen' && penPoints.length > 1 && (
          <polyline
            points={penPoints.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={0.6}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {tool !== 'pen' && start && current && (
          <rect
            x={Math.min(start.x, current.x) * 100}
            y={Math.min(start.y, current.y) * 100}
            width={Math.abs(current.x - start.x) * 100}
            height={Math.abs(current.y - start.y) * 100}
            fill="none"
            stroke={color}
            strokeDasharray="2,1"
            strokeWidth={0.4}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  )
}


