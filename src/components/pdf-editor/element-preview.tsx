'use client'

import { StickyNote, EyeOff, CheckSquare, ChevronDown, CaseSensitive } from 'lucide-react'
import type { DrawElement, ShapeElement, NoteElement, FormFieldElement } from '@/lib/pdf-editor-types'

export function DrawPreview({ el }: { el: DrawElement }) {
  return (
    <svg className="h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline
        points={el.points.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
        fill="none"
        stroke={el.color}
        strokeWidth={0.6}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export function ShapePreview({ el }: { el: ShapeElement }) {
  const stroke = el.color
  const fill = el.shapeKind === 'highlight' ? el.color : 'none'
  const fillOpacity = el.shapeKind === 'highlight' ? el.fillOpacity || 0.4 : 0

  return (
    <svg className="h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
      {el.shapeKind === 'rect' && (
        <rect x={0} y={0} width={100} height={100} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
      )}
      {el.shapeKind === 'ellipse' && (
        <ellipse cx={50} cy={50} rx={50} ry={50} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
      )}
      {el.shapeKind === 'highlight' && <rect x={0} y={0} width={100} height={100} fill={fill} fillOpacity={fillOpacity} />}
      {el.shapeKind === 'line' && (
        <line x1={0} y1={50} x2={100} y2={50} stroke={stroke} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      )}
      {el.shapeKind === 'underline' && (
        <line x1={0} y1={95} x2={100} y2={95} stroke={stroke} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      )}
      {el.shapeKind === 'strikethrough' && (
        <line x1={0} y1={50} x2={100} y2={50} stroke={stroke} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      )}
      {el.shapeKind === 'arrow' && (
        <>
          <line x1={0} y1={50} x2={90} y2={50} stroke={stroke} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          <polygon points="90,42 100,50 90,58" fill={stroke} />
        </>
      )}
    </svg>
  )
}

export function RedactPreview() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-1 bg-black text-white">
      <EyeOff className="h-3.5 w-3.5 shrink-0 opacity-80" />
    </div>
  )
}

/** A compact icon marker at the field's placed position — NOT a rendered
 * preview of its filled-in content (no "Option 1 / Option 2" text, no
 * field-name label sitting on the page). Matches Acrobat's Prepare Form
 * tool: the page shows just enough to say "there's a field here"; actual
 * configuration (name, options, default state) lives in FormFieldPanel
 * once this marker is selected. */
export function FormFieldPreview({ el }: { el: FormFieldElement }) {
  const Icon = el.fieldKind === 'checkbox' ? CheckSquare : el.fieldKind === 'dropdown' ? ChevronDown : CaseSensitive
  return (
    <div
      title={el.name || `Untitled ${el.fieldKind} field`}
      className="flex h-full w-full items-center justify-center rounded border-2 border-dashed border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
    </div>
  )
}

export function NotePreview({ el }: { el: NoteElement }) {
  return (
    <div
      title={el.text}
      className="flex h-full w-full items-center justify-center rounded"
      style={{ backgroundColor: el.color, opacity: 0.85 }}
    >
      <StickyNote className="h-3/5 w-3/5 text-black/70" />
    </div>
  )
}


