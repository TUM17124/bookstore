'use client'

import { ImagePlus } from 'lucide-react'
import type { WatermarkConfig, WatermarkPosition } from '@/lib/pdf-editor-types'
import { FONT_FAMILIES, type FontFamily } from '@/lib/pdf-editor-fonts'

const POSITIONS: { key: WatermarkPosition; label: string }[] = [
  { key: 'diagonal', label: 'Diagonal' },
  { key: 'center', label: 'Center' },
  { key: 'top-left', label: 'Top left' },
  { key: 'top-right', label: 'Top right' },
  { key: 'bottom-left', label: 'Bottom left' },
  { key: 'bottom-right', label: 'Bottom right' },
]

export function WatermarkPanel({
  watermark,
  onChange,
  onPickImage,
  pageCount,
}: {
  watermark: WatermarkConfig
  onChange: (patch: Partial<WatermarkConfig>) => void
  onPickImage: (file: File) => void
  pageCount: number
}) {
  return (
    <div className="rounded-2xl border border-foreground/10 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/40">Watermark</h2>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={watermark.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
        Add a watermark
      </label>

      {watermark.enabled && (
        <div className="mt-3 space-y-3">
          <div className="flex gap-1 rounded-lg border border-foreground/10 p-1">
            <button
              type="button"
              onClick={() => onChange({ kind: 'text' })}
              className={`flex-1 rounded-md py-1 text-xs font-medium ${watermark.kind === 'text' ? 'bg-foreground text-background' : 'hover:bg-foreground/5'}`}
            >
              Text
            </button>
            <button
              type="button"
              onClick={() => onChange({ kind: 'image' })}
              className={`flex-1 rounded-md py-1 text-xs font-medium ${watermark.kind === 'image' ? 'bg-foreground text-background' : 'hover:bg-foreground/5'}`}
            >
              Image
            </button>
          </div>

          {watermark.kind === 'text' ? (
            <>
              <input
                type="text"
                value={watermark.text}
                onChange={(e) => onChange({ text: e.target.value })}
                placeholder="Watermark text"
                className="w-full rounded-lg border border-foreground/15 bg-transparent px-2 py-1.5 text-sm"
              />
              <select
                value={watermark.fontFamily}
                onChange={(e) => onChange({ fontFamily: e.target.value as FontFamily })}
                className="w-full rounded-lg border border-foreground/15 bg-transparent px-2 py-1.5 text-sm"
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f.key} value={f.key} className="text-black">
                    {f.label}
                  </option>
                ))}
              </select>
              <input
                type="color"
                value={watermark.color}
                onChange={(e) => onChange({ color: e.target.value })}
                className="h-9 w-full rounded-lg border border-foreground/15 bg-transparent"
              />
            </>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-foreground/20 px-3 py-3 text-xs text-foreground/60 hover:border-foreground/40">
              <ImagePlus className="h-4 w-4" />
              {watermark.imageDataUrl ? 'Image selected — click to change' : 'Choose an image'}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) onPickImage(f)
                }}
              />
            </label>
          )}

          <label className="block text-xs text-foreground/55">
            Position
            <select
              value={watermark.position}
              onChange={(e) => onChange({ position: e.target.value as WatermarkPosition })}
              className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-2 py-1.5 text-sm text-foreground"
            >
              {POSITIONS.map((p) => (
                <option key={p.key} value={p.key} className="text-black">
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-foreground/55">
            Opacity ({Math.round(watermark.opacity * 100)}%)
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={watermark.opacity}
              onChange={(e) => onChange({ opacity: Number(e.target.value) })}
              className="mt-1 w-full"
            />
          </label>

          <label className="block text-xs text-foreground/55">
            Size
            <input
              type="range"
              min={0.4}
              max={2.5}
              step={0.1}
              value={watermark.scale}
              onChange={(e) => onChange({ scale: Number(e.target.value) })}
              className="mt-1 w-full"
            />
          </label>

          <label className="block text-xs text-foreground/55">
            Apply to
            <select
              value={watermark.scope}
              onChange={(e) => onChange({ scope: e.target.value as 'all' | 'selected' })}
              className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-2 py-1.5 text-sm text-foreground"
            >
              <option value="all" className="text-black">
                All {pageCount} pages
              </option>
              <option value="selected" className="text-black">
                Only the current page
              </option>
            </select>
          </label>
        </div>
      )}
    </div>
  )
}
