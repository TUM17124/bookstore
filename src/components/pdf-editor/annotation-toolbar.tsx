'use client'

import {
  MousePointer2,
  Pencil,
  Square,
  Circle,
  Minus,
  ArrowUpRight,
  Highlighter,
  Underline as UnderlineIcon,
  Strikethrough as StrikethroughIcon,
  StickyNote,
  EyeOff,
} from 'lucide-react'
import type { ShapeKind } from '@/lib/pdf-editor-types'

export type AnnotationTool = 'select' | 'pen' | ShapeKind | 'note' | 'redact'

const TOOLS: { key: AnnotationTool; label: string; icon: typeof MousePointer2 }[] = [
  { key: 'select', label: 'Select', icon: MousePointer2 },
  { key: 'pen', label: 'Pen', icon: Pencil },
  { key: 'rect', label: 'Rectangle', icon: Square },
  { key: 'ellipse', label: 'Ellipse', icon: Circle },
  { key: 'line', label: 'Line', icon: Minus },
  { key: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { key: 'highlight', label: 'Highlight', icon: Highlighter },
  { key: 'underline', label: 'Underline', icon: UnderlineIcon },
  { key: 'strikethrough', label: 'Strikethrough', icon: StrikethroughIcon },
  { key: 'note', label: 'Sticky note', icon: StickyNote },
  { key: 'redact', label: 'Redact (permanent)', icon: EyeOff },
]

export function AnnotationToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  strokeWidth,
  onStrokeWidthChange,
}: {
  tool: AnnotationTool
  onToolChange: (t: AnnotationTool) => void
  color: string
  onColorChange: (c: string) => void
  strokeWidth: number
  onStrokeWidthChange: (w: number) => void
}) {
  return (
    <div className="rounded-2xl border border-foreground/10 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/40">Annotate</h2>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-label={t.label}
            title={t.label}
            onClick={() => onToolChange(t.key)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
              tool === t.key ? 'border-foreground bg-foreground/10' : 'border-foreground/15 hover:bg-foreground/5'
            }`}
          >
            <t.icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      {tool !== 'select' && tool !== 'redact' && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-foreground/55">
            Color
            <input
              type="color"
              value={color}
              onChange={(e) => onColorChange(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-foreground/15 bg-transparent"
            />
          </label>
          {tool !== 'note' && tool !== 'highlight' && (
            <label className="block text-xs text-foreground/55">
              Stroke width
              <input
                type="range"
                min={1}
                max={12}
                value={strokeWidth}
                onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>
          )}
          <p className="text-[11px] text-foreground/45">
            {tool === 'pen'
              ? 'Drag on the page to draw.'
              : tool === 'note'
                ? 'Click on the page to drop a note.'
                : 'Drag on the page to draw the shape.'}
          </p>
        </div>
      )}

      {tool === 'redact' && (
        <div className="mt-3 rounded-lg bg-red-500/10 p-2.5 text-[11px] text-red-600 dark:text-red-400">
          Drag a box over content to remove. On export, that page is
          permanently flattened to an image and the covered content is gone
          for good — this can&apos;t be undone once downloaded.
        </div>
      )}
    </div>
  )
}
