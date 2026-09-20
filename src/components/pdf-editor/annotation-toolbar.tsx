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
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

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

/** A compact, always-visible horizontal tool strip — the annotate/markup
 * tool palette real editors (Figma, Acrobat) keep pinned, as opposed to a
 * one-click "insert" command buried in a menu. */
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
  const showColor = tool !== 'select' && tool !== 'redact'
  const showStroke = showColor && tool !== 'note' && tool !== 'highlight'

  return (
    <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
      {TOOLS.map((t) => (
        <Tooltip key={t.key}>
          <TooltipTrigger
            type="button"
            aria-label={t.label}
            onClick={() => onToolChange(t.key)}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
              tool === t.key ? 'border-foreground bg-foreground/10' : 'border-foreground/15 hover:bg-foreground/5'
            }`}
          >
            <t.icon className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>{t.label}</TooltipContent>
        </Tooltip>
      ))}

      {showColor && (
        <>
          <div className="mx-1 h-6 w-px shrink-0 bg-foreground/10" />
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            aria-label="Color"
            title="Color"
            className="h-8 w-8 shrink-0 rounded-lg border border-foreground/15 bg-transparent p-0.5"
          />
        </>
      )}
      {showStroke && (
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-foreground/55">
          <span className="hidden sm:inline">Width</span>
          <input
            type="range"
            min={1}
            max={12}
            value={strokeWidth}
            onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
            className="w-20"
          />
        </label>
      )}

      {tool === 'pen' && <span className="hidden shrink-0 text-[11px] text-foreground/45 md:inline">Drag to draw.</span>}
      {tool === 'note' && <span className="hidden shrink-0 text-[11px] text-foreground/45 md:inline">Click to drop a note.</span>}
      {tool !== 'select' && tool !== 'pen' && tool !== 'note' && tool !== 'redact' && (
        <span className="hidden shrink-0 text-[11px] text-foreground/45 md:inline">Drag to draw the shape.</span>
      )}
      {tool === 'redact' && (
        <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-600 dark:text-red-400">
          Permanent — flattens the page on export
        </span>
      )}
    </div>
  )
}


