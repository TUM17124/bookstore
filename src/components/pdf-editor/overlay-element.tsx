'use client'

import { useRef, useState } from 'react'
import type { EditorElement } from '@/lib/pdf-editor-types'

const MIN_FRACTION = 0.02

export function OverlayElement({
  element,
  containerRef,
  selected,
  onSelect,
  onChange,
  onCommit,
  onDelete,
  onEditText,
  children,
}: {
  element: EditorElement
  containerRef: React.RefObject<HTMLDivElement | null>
  selected: boolean
  onSelect: () => void
  onChange: (patch: Partial<EditorElement>) => void
  onCommit?: () => void
  onDelete: () => void
  onEditText?: () => void
  children: React.ReactNode
}) {
  const dragState = useRef<{
    mode: 'move' | 'resize'
    startX: number
    startY: number
    startXf: number
    startYf: number
    startWf: number
    startHf: number
  } | null>(null)
  const [, forceRender] = useState(0)

  function onPointerDown(e: React.PointerEvent, mode: 'move' | 'resize') {
    e.stopPropagation()
    e.preventDefault()
    onSelect()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragState.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startXf: element.xf,
      startYf: element.yf,
      startWf: element.wf,
      startHf: element.hf,
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragState.current
    const box = containerRef.current
    if (!d || !box) return
    const rect = box.getBoundingClientRect()
    const dxf = (e.clientX - d.startX) / rect.width
    const dyf = (e.clientY - d.startY) / rect.height

    if (d.mode === 'move') {
      const xf = clamp(d.startXf + dxf, 0, 1 - d.startWf)
      const yf = clamp(d.startYf + dyf, 0, 1 - d.startHf)
      onChange({ xf, yf })
    } else {
      const wf = clamp(d.startWf + dxf, MIN_FRACTION, 1 - d.startXf)
      const hf = clamp(d.startHf + dyf, MIN_FRACTION, 1 - d.startYf)
      onChange({ wf, hf })
    }
    forceRender((n) => n + 1)
  }

  function onPointerUp(e: React.PointerEvent) {
    if (dragState.current) {
      try {
        ;(e.target as Element).releasePointerCapture(e.pointerId)
      } catch {}
      onCommit?.()
    }
    dragState.current = null
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => onPointerDown(e, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onEditText}
      className={`absolute select-none touch-none ${
        selected ? 'outline outline-2 outline-offset-2 outline-sky-500' : 'outline outline-1 outline-dashed outline-foreground/25'
      }`}
      style={{
        left: `${element.xf * 100}%`,
        top: `${element.yf * 100}%`,
        width: `${element.wf * 100}%`,
        height: `${element.hf * 100}%`,
        cursor: 'grab',
      }}
    >
      {children}

      {selected && (
        <>
          <button
            type="button"
            aria-label="Delete"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold leading-none text-white shadow"
          >
            ×
          </button>
          <div
            role="presentation"
            onPointerDown={(e) => onPointerDown(e, 'resize')}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-background bg-sky-500 touch-none"
          />
        </>
      )}
    </div>
  )
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), Math.max(min, max))
}
