'use client'

import { Bold, Italic, AlignLeft, AlignCenter, AlignRight, Link2 } from 'lucide-react'
import type { TextElement, TextAlign } from '@/lib/pdf-editor-types'
import { FONT_FAMILIES, type FontFamily } from '@/lib/pdf-editor-fonts'

export function TextPanel({
  element,
  onChange,
}: {
  element: TextElement
  onChange: (patch: Partial<TextElement>) => void
}) {
  return (
    <div className="rounded-2xl border border-foreground/10 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/40">Text</h2>
      <label className="mt-3 block text-xs text-foreground/55">
        Font
        <select
          value={element.fontFamily}
          onChange={(e) => onChange({ fontFamily: e.target.value as FontFamily })}
          className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-2 py-1.5 text-sm text-foreground"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.key} value={f.key} className="text-black">
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 flex gap-1">
        <button
          type="button"
          onClick={() => onChange({ bold: !element.bold })}
          aria-pressed={element.bold}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border ${element.bold ? 'border-foreground bg-foreground/10' : 'border-foreground/15'}`}
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onChange({ italic: !element.italic })}
          aria-pressed={element.italic}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border ${element.italic ? 'border-foreground bg-foreground/10' : 'border-foreground/15'}`}
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <div className="mx-1 w-px bg-foreground/10" />
        {([
          ['left', AlignLeft],
          ['center', AlignCenter],
          ['right', AlignRight],
        ] as [TextAlign, typeof AlignLeft][]).map(([align, Icon]) => (
          <button
            key={align}
            type="button"
            onClick={() => onChange({ align })}
            aria-pressed={element.align === align}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border ${element.align === align ? 'border-foreground bg-foreground/10' : 'border-foreground/15'}`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      <label className="mt-3 block text-xs text-foreground/55">
        Font size
        <input
          type="number"
          min={6}
          max={120}
          value={element.fontSizePt}
          onChange={(e) => onChange({ fontSizePt: Number(e.target.value) || 12 })}
          className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-2 py-1.5 text-sm text-foreground"
        />
      </label>
      <label className="mt-3 block text-xs text-foreground/55">
        Color
        <input
          type="color"
          value={element.color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="mt-1 h-9 w-full rounded-lg border border-foreground/15 bg-transparent"
        />
      </label>
      <label className="mt-3 block text-xs text-foreground/55">
        Link URL (optional)
        <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-foreground/15 px-2">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
          <input
            type="url"
            value={element.url}
            onChange={(e) => onChange({ url: e.target.value })}
            placeholder="https://example.com"
            className="w-full bg-transparent py-1.5 text-sm text-foreground outline-none"
          />
        </div>
      </label>
    </div>
  )
}
