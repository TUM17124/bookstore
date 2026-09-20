'use client'

import { useEffect, useState } from 'react'
import { Bold, Italic, AlignLeft, AlignCenter, AlignRight, Link2, X } from 'lucide-react'
import type { TextElement, TextAlign } from '@/lib/pdf-editor-types'
import { FONT_FAMILIES, type FontFamily } from '@/lib/pdf-editor-fonts'
import { normalizeLinkUrl, LINK_ACCENT_COLOR } from '@/lib/pdf-editor-links'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { RunStyle } from '@/components/pdf-editor/rich-text-editor'

// Buttons use onMouseDown+preventDefault (not onClick alone) so the browser
// never shifts focus away from the on-canvas textarea being edited — the
// same technique rich-text toolbars (Slate/TipTap/Draft.js) use to avoid
// interrupting an active edit/keyboard session.
function preventFocusSteal(e: React.MouseEvent) {
  e.preventDefault()
}

function LinkControl({
  element,
  onChange,
  onRefocusEditor,
}: {
  element: TextElement
  onChange: (patch: Partial<TextElement>) => void
  onRefocusEditor?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(element.url)
  const [error, setError] = useState('')
  const hasLink = !!element.url

  // Reset the draft to the element's current link whenever a different
  // element becomes selected, or when the popover is freshly reopened —
  // otherwise a leftover draft from editing a previous text box's link
  // could leak into this one.
  useEffect(() => {
    setDraft(element.url)
    setError('')
  }, [element.id, element.url])

  function apply() {
    if (!draft.trim()) {
      onChange({ url: '' })
      setOpen(false)
      onRefocusEditor?.()
      return
    }
    const normalized = normalizeLinkUrl(draft)
    if (!normalized) {
      setError('Enter a valid web address, e.g. plugyard.com')
      return
    }
    // First time this text gets a link — nudge it to look like one, the
    // same way Docs/Word auto-style newly-linked text. The color is still
    // just the element's ordinary `color` field, so it stays editable
    // afterward like any other text.
    onChange({ url: normalized, color: hasLink ? element.color : LINK_ACCENT_COLOR })
    setOpen(false)
    onRefocusEditor?.()
  }

  function remove() {
    onChange({ url: '' })
    setOpen(false)
    onRefocusEditor?.()
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onRefocusEditor?.()
      }}
    >
      <PopoverTrigger
        onMouseDown={preventFocusSteal}
        aria-label={hasLink ? 'Edit link' : 'Add link'}
        aria-pressed={hasLink}
        className={`flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-sm ${hasLink ? 'border-foreground bg-foreground/10' : 'border-foreground/15'}`}
      >
        <Link2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{hasLink ? 'Link' : 'Add link'}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="pdf-text-link-url">
          Link to
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id="pdf-text-link-url"
            type="text"
            autoFocus
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              if (error) setError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                apply()
              }
            }}
            placeholder="plugyard.com or https://…"
            aria-label="Link URL"
            className="h-8 min-w-0 flex-1 rounded-lg border border-foreground/15 bg-transparent px-2 text-sm text-foreground outline-none"
          />
          {hasLink && (
            <button
              type="button"
              onClick={remove}
              aria-label="Remove link"
              title="Remove link"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-foreground/15 text-foreground/60 hover:bg-foreground/5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="button"
          onClick={apply}
          className="h-8 rounded-lg bg-foreground text-sm font-semibold text-background"
        >
          {hasLink ? 'Update link' : 'Apply'}
        </button>
      </PopoverContent>
    </Popover>
  )
}

export function TextPanel({
  element,
  activeStyle,
  onStyleChange,
  onChange,
  onRefocusEditor,
}: {
  element: TextElement
  /** The font/size/color/bold/italic that should show as "current" right
   * now — the active selection's style if any text is highlighted, else
   * the style at the caret, else the block's own default. */
  activeStyle: RunStyle
  /** Applies a style patch to exactly the active selection, or arms it as
   * the style for what's typed next if nothing is selected — never the
   * whole block or document. See applyTextStyle in the editor page. */
  onStyleChange: (patch: Partial<RunStyle>) => void
  /** Still block-level: alignment and the link URL apply to the whole
   * text box, not a sub-selection — same as any word processor. */
  onChange: (patch: Partial<TextElement>) => void
  /** Called after a one-shot pick (font) or when a field blurs ambiguously,
   * so focus returns to the text being edited. */
  onRefocusEditor?: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
      <select
        value={activeStyle.fontFamily}
        onChange={(e) => {
          onStyleChange({ fontFamily: e.target.value as FontFamily })
          onRefocusEditor?.()
        }}
        aria-label="Font"
        className="h-8 shrink-0 rounded-lg border border-foreground/15 bg-transparent px-2 text-sm text-foreground"
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f.key} value={f.key} className="text-black">
            {f.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={() => onStyleChange({ bold: !activeStyle.bold })}
        aria-pressed={activeStyle.bold}
        aria-label="Bold"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${activeStyle.bold ? 'border-foreground bg-foreground/10' : 'border-foreground/15'}`}
      >
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={() => onStyleChange({ italic: !activeStyle.italic })}
        aria-pressed={activeStyle.italic}
        aria-label="Italic"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${activeStyle.italic ? 'border-foreground bg-foreground/10' : 'border-foreground/15'}`}
      >
        <Italic className="h-3.5 w-3.5" />
      </button>

      <div className="mx-0.5 h-6 w-px shrink-0 bg-foreground/10" />

      {([
        ['left', AlignLeft],
        ['center', AlignCenter],
        ['right', AlignRight],
      ] as [TextAlign, typeof AlignLeft][]).map(([align, Icon]) => (
        <button
          key={align}
          type="button"
          onMouseDown={preventFocusSteal}
          onClick={() => onChange({ align })}
          aria-pressed={element.align === align}
          aria-label={`Align ${align}`}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${element.align === align ? 'border-foreground bg-foreground/10' : 'border-foreground/15'}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}

      <div className="mx-0.5 h-6 w-px shrink-0 bg-foreground/10" />

      <input
        type="number"
        min={6}
        max={120}
        value={activeStyle.fontSizePt}
        onChange={(e) => onStyleChange({ fontSizePt: Number(e.target.value) || 12 })}
        onBlur={(e) => {
          if (!e.relatedTarget) onRefocusEditor?.()
        }}
        aria-label="Font size"
        className="h-8 w-14 shrink-0 rounded-lg border border-foreground/15 bg-transparent px-2 text-sm text-foreground"
      />
      <input
        type="color"
        value={activeStyle.color}
        onChange={(e) => onStyleChange({ color: e.target.value })}
        onBlur={(e) => {
          if (!e.relatedTarget) onRefocusEditor?.()
        }}
        aria-label="Color"
        title="Color"
        className="h-8 w-8 shrink-0 rounded-lg border border-foreground/15 bg-transparent p-0.5"
      />

      <LinkControl element={element} onChange={onChange} onRefocusEditor={onRefocusEditor} />
    </div>
  )
}


