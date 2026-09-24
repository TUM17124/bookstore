'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { TextRun } from '@/lib/pdf-editor-types'
import { familyOption, type FontFamily } from '@/lib/pdf-editor-fonts'

export type RunStyle = Omit<TextRun, 'text'>

export type RichTextEditorHandle = {
  focus(): void
  /** Re-applies the last selection this editor had before focus left it —
   * lets a toolbar control (font/size/color/bold/italic) run its own
   * click without permanently stealing the user's place in the text. */
  restoreSelection(): void
  /** Applies a style patch to the current selection (if any characters are
   * highlighted) or arms it as the style newly-typed characters will use
   * from the current caret position onward (if the caret is just
   * collapsed, nothing highlighted). Never touches text outside that.
   * Returns the resulting full runs array synchronously (React state
   * updates are async, so a caller that needs the new value right away —
   * e.g. to push an undo-history entry — can't just read the `runs` prop
   * back immediately after calling this). */
  applyStyle(patch: Partial<RunStyle>): TextRun[]
  /** The style the toolbar should currently display — the active
   * selection's style, or the style at the caret, or the block default. */
  getActiveStyle(): RunStyle
}

const ZERO_WIDTH = '​'

function styleToCss(style: RunStyle): React.CSSProperties {
  return {
    fontFamily: familyOption(style.fontFamily).cssFamily,
    // Matches the page canvas's own convention (it renders at ~1 CSS px
    // per PDF point, not true 96dpi pt-to-px, since the container is
    // deliberately sized to the page's point-width in px) — same 0.9
    // empirical factor the old textarea-based renderer used, so switching
    // editors doesn't change the on-screen text size.
    fontSize: `${Math.max(8, style.fontSizePt * 0.9)}px`,
    color: style.color,
    fontWeight: style.bold ? 'bold' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
  }
}

function makeSpan(run: TextRun): HTMLSpanElement {
  const span = document.createElement('span')
  span.dataset.run = '1'
  span.dataset.fontFamily = run.fontFamily
  span.dataset.fontSizePt = String(run.fontSizePt)
  span.dataset.color = run.color
  span.dataset.bold = run.bold ? '1' : '0'
  span.dataset.italic = run.italic ? '1' : '0'
  Object.assign(span.style, styleToCss(run))
  span.textContent = run.text
  return span
}

function styleFromSpan(span: HTMLElement): RunStyle {
  return {
    fontFamily: (span.dataset.fontFamily as FontFamily) || 'Helvetica',
    fontSizePt: Number(span.dataset.fontSizePt) || 12,
    color: span.dataset.color || '#111111',
    bold: span.dataset.bold === '1',
    italic: span.dataset.italic === '1',
  }
}

function sameStyle(a: RunStyle, b: RunStyle) {
  return (
    a.fontFamily === b.fontFamily &&
    a.fontSizePt === b.fontSizePt &&
    a.color === b.color &&
    a.bold === b.bold &&
    a.italic === b.italic
  )
}

/** Walks the container's direct children, turning each run span (and any
 * stray bare text node the browser inserted) back into a TextRun, merging
 * adjacent runs that ended up with identical style so repeated edits don't
 * fragment into an ever-growing pile of one-character spans. */
function domToRuns(container: HTMLElement, fallback: RunStyle): TextRun[] {
  const runs: TextRun[] = []
  for (const node of Array.from(container.childNodes)) {
    let text = ''
    let style = fallback
    if (node.nodeType === Node.TEXT_NODE) {
      text = node.textContent || ''
      const prevSpan = node.previousSibling
      if (prevSpan instanceof HTMLElement && prevSpan.dataset.run) style = styleFromSpan(prevSpan)
    } else if (node instanceof HTMLElement) {
      text = node.textContent || ''
      style = node.dataset.run ? styleFromSpan(node) : fallback
    }
    text = text.replace(new RegExp(ZERO_WIDTH, 'g'), '')
    if (!text) continue
    const last = runs[runs.length - 1]
    if (last && sameStyle(last, style)) last.text += text
    else runs.push({ text, ...style })
  }
  return runs
}

function rebuildDom(container: HTMLElement, runs: TextRun[]) {
  container.innerHTML = ''
  const source = runs.length ? runs : []
  for (const run of source) container.appendChild(makeSpan(run))
}

function isWithin(container: HTMLElement, node: Node | null) {
  return !!node && container.contains(node)
}

/** Inserts `node` as a genuine TOP-LEVEL child of `container`, at the
 * position given by a (boundaryNode, boundaryOffset) pair — the same pair
 * Range.startContainer/startOffset give you. Range.insertNode() alone is
 * NOT enough for this: when the boundary sits inside an existing run
 * span's text, insertNode() splits that text node but inserts the new
 * node AS A SIBLING WITHIN THAT SAME SPAN, not as a sibling of the span
 * itself — so a style change silently nests inside (and gets visually
 * absorbed by) the old run instead of taking effect as its own run. This
 * showed up as: a per-word color/size change looked right while the
 * editor stayed focused (nested inline styles still render), then
 * reverted the moment focus left and the non-editing preview re-read
 * `runs` from state — because domToRuns() only walks direct children, so
 * the nested span's text got folded into its OLD-styled parent when read
 * back, discarding the new style entirely. Used by BOTH the collapsed-
 * caret and text-selection branches of applyStyle, since both hit this
 * exact same nesting hazard. */
function insertTopLevelAt(container: HTMLElement, boundaryNode: Node, boundaryOffset: number, node: Node) {
  if (boundaryNode.nodeType === Node.TEXT_NODE) {
    const parent = boundaryNode.parentElement
    if (parent === container) {
      // A bare text node directly in the container — split it in place.
      const text = boundaryNode.textContent || ''
      const before = text.slice(0, boundaryOffset)
      const after = text.slice(boundaryOffset)
      if (before) container.insertBefore(document.createTextNode(before), boundaryNode)
      container.insertBefore(node, boundaryNode)
      if (after) container.insertBefore(document.createTextNode(after), boundaryNode)
      container.removeChild(boundaryNode)
      return
    }
    if (parent instanceof HTMLElement && parent.dataset.run) {
      // Inside a run span's text — split the span into "before"/"after"
      // runs of its own style, with the new node as a top-level sibling
      // sitting between them.
      const fullText = parent.textContent || ''
      const hostStyle = styleFromSpan(parent)
      const before = fullText.slice(0, boundaryOffset)
      const after = fullText.slice(boundaryOffset)
      const beforeSpan = before ? makeSpan({ text: before, ...hostStyle }) : null
      const afterSpan = after ? makeSpan({ text: after, ...hostStyle }) : null
      if (beforeSpan) container.insertBefore(beforeSpan, parent)
      container.insertBefore(node, parent)
      if (afterSpan) container.insertBefore(afterSpan, parent)
      container.removeChild(parent)
      return
    }
  }
  if (boundaryNode === container) {
    // Boundary already expressed as a top-level child index — insertNode
    // semantics are safe here since there's no run-span to nest inside.
    const ref = container.childNodes[boundaryOffset] || null
    container.insertBefore(node, ref)
    return
  }
  container.appendChild(node)
}

export const RichTextEditor = forwardRef<
  RichTextEditorHandle,
  {
    runs: TextRun[]
    align: 'left' | 'center' | 'right'
    defaultStyle: RunStyle
    onRunsChange: (runs: TextRun[]) => void
    onBlurEditor: (relatedTarget: Node | null) => void
    onEscape: () => void
    className?: string
    style?: React.CSSProperties
    /** When provided, this block auto-grows instead of showing the
     * overflow outline: called with the content's current pixel height
     * whenever it changes, so the caller can grow the block's own height
     * to match (see startBlankTextAt/autoGrow in the editor page). Omit
     * for blocks with a meaningful fixed size (Insert-Text-Box-style or a
     * Phase 2 edit of existing page content), which should overflow +
     * hint instead of silently resizing themselves. */
    onContentHeightChange?: (heightPx: number) => void
  }
>(function RichTextEditor(
  { runs, align, defaultStyle, onRunsChange, onBlurEditor, onEscape, className, style, onContentHeightChange },
  ref,
) {
  const elRef = useRef<HTMLDivElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const mountedForRef = useRef<string | null>(null)

  // Rebuild the DOM from `runs` only when this is a fresh mount (switching
  // to a different element) — NOT on every keystroke. Typing already
  // mutates the DOM directly (that's the source of truth while an edit
  // session is live); rebuilding on every React re-render here would fight
  // the live cursor and reset it after every character.
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    rebuildDom(el, runs)
    mountedForRef.current = 'mounted'
    checkOverflow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Two different answers to "content is taller than the box," depending
  // on why the box has the size it does:
  //  - A block with a meaningful fixed size (Insert-Text-Box-style, or a
  //    Phase 2 edit of existing page content) visibly overflows past it
  //    (approved approach: never silently clip — that reads as data loss)
  //    rather than reflowing the rest of the page. The dashed outline is a
  //    heads-up that only shows while actively editing; it goes away the
  //    moment you click elsewhere, so it never clutters the export
  //    preview — export itself already draws all wrapped lines
  //    unconditionally, so an overflowing block exports exactly as shown
  //    here.
  //  - A block created by clicking blank space has no such fixed size to
  //    respect — it's supposed to grow. onContentHeightChange hands the
  //    caller the content's real height so IT can grow the block instead.
  function checkOverflow() {
    const el = elRef.current
    if (!el) return
    if (onContentHeightChange) {
      onContentHeightChange(el.scrollHeight)
      return
    }
    const overflowing = el.scrollHeight > el.clientHeight + 1
    el.style.outline = overflowing ? '1px dashed #f59e0b' : ''
    el.style.outlineOffset = overflowing ? '2px' : ''
  }

  function syncFromDom(): TextRun[] {
    const el = elRef.current
    if (!el) return runs
    const next = domToRuns(el, defaultStyle)
    const final = next.length ? next : [{ text: '', ...defaultStyle }]
    onRunsChange(final)
    checkOverflow()
    return final
  }

  function saveSelectionIfWithin() {
    const el = elRef.current
    const sel = window.getSelection()
    if (!el || !sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (isWithin(el, range.startContainer)) savedRangeRef.current = range.cloneRange()
  }

  useImperativeHandle(ref, () => ({
    focus() {
      elRef.current?.focus()
    },
    restoreSelection() {
      const el = elRef.current
      const range = savedRangeRef.current
      if (!el || !range) return
      el.focus()
      try {
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      } catch {
        // stale range (DOM changed since it was saved) — just focus instead
      }
    },
    applyStyle(patch) {
      const el = elRef.current
      if (!el) return runs
      const range = savedRangeRef.current
      if (!range || !isWithin(el, range.startContainer)) return runs

      if (range.collapsed) {
        // Nothing highlighted — arm a zero-width marker span at the caret
        // so only characters typed FROM HERE ON use the new style; text
        // already there, before or after the caret, is untouched.
        const base = resolveStyleAt(el, range, defaultStyle)
        const marker = makeSpan({ text: ZERO_WIDTH, ...base, ...patch })
        insertTopLevelAt(el, range.startContainer, range.startOffset, marker)

        const sel = window.getSelection()
        const newRange = document.createRange()
        newRange.setStart(marker.firstChild!, 1)
        newRange.collapse(true)
        sel?.removeAllRanges()
        sel?.addRange(newRange)
        savedRangeRef.current = newRange.cloneRange()
        mergeAdjacentRuns(el)
        return syncFromDom()
      }

      const startSpan = range.startContainer instanceof HTMLElement
        ? range.startContainer
        : range.startContainer.parentElement
      const baseStyle = startSpan instanceof HTMLElement && startSpan.dataset.run
        ? styleFromSpan(startSpan)
        : defaultStyle

      // Capture the start boundary BEFORE extraction — extractContents()
      // only removes/splits content AT OR AFTER this point, so the
      // (node, offset) pair for the range's start is still meaningful
      // afterward (e.g. a text node that had "world" cut from its end
      // still ends exactly at this same offset).
      const boundaryNode = range.startContainer
      const boundaryOffset = range.startOffset

      const frag = range.extractContents()
      const text = frag.textContent || ''
      const newSpan = makeSpan({ text, ...baseStyle, ...patch })
      insertTopLevelAt(el, boundaryNode, boundaryOffset, newSpan)

      // Collapse the selection to just after the newly styled run — matches
      // how a toolbar pick behaves elsewhere in this app (focus returns,
      // selection doesn't linger highlighted).
      const sel = window.getSelection()
      const newRange = document.createRange()
      newRange.setStartAfter(newSpan)
      newRange.collapse(true)
      sel?.removeAllRanges()
      sel?.addRange(newRange)
      savedRangeRef.current = newRange.cloneRange()

      mergeAdjacentRuns(el)
      return syncFromDom()
    },
    getActiveStyle() {
      const el = elRef.current
      const range = savedRangeRef.current
      if (!el || !range || !isWithin(el, range.startContainer)) return defaultStyle
      return resolveStyleAt(el, range, defaultStyle)
    },
  }))

  return (
    <div
      ref={elRef}
      contentEditable
      suppressContentEditableWarning
      onInput={syncFromDom}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseUp={saveSelectionIfWithin}
      onKeyUp={saveSelectionIfWithin}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.currentTarget.blur()
          onEscape()
          return
        }
        if (e.key === 'Enter') {
          // A plain literal "\n" text character (not a <div>/<br> block
          // split) — matches the export wrapper's existing split('\n')
          // convention and renders correctly under whitespace-pre-wrap,
          // so line breaks survive the DOM<->runs round trip untouched.
          e.preventDefault()
          const sel = window.getSelection()
          if (!sel || sel.rangeCount === 0) return
          const range = sel.getRangeAt(0)
          range.deleteContents()
          const nl = document.createTextNode('\n')
          range.insertNode(nl)
          range.setStartAfter(nl)
          range.collapse(true)
          sel.removeAllRanges()
          sel.addRange(range)
          savedRangeRef.current = range.cloneRange()
          syncFromDom()
        }
      }}
      onBlur={(e) => {
        saveSelectionIfWithin()
        onBlurEditor(e.relatedTarget as Node | null)
      }}
      className={className}
      style={{ ...style, textAlign: align }}
    />
  )
})

/** The style that should apply if the user starts typing right now: the
 * run immediately before the caret (matches how every mainstream editor
 * continues in the style of what you just typed), falling back to the run
 * immediately after, falling back to the block default. */
function resolveStyleAt(container: HTMLElement, range: Range, fallback: RunStyle): RunStyle {
  const node = range.startContainer
  const findSpan = (n: Node | null): HTMLElement | null => {
    if (!n) return null
    if (n instanceof HTMLElement && n.dataset.run) return n
    if (n.nodeType === Node.TEXT_NODE) {
      const parent = n.parentElement
      if (parent && parent !== container && parent.dataset.run) return parent
    }
    return null
  }

  if (node.nodeType === Node.TEXT_NODE) {
    const span = findSpan(node)
    if (span) return styleFromSpan(span)
  } else if (node instanceof HTMLElement) {
    const children = Array.from(node.childNodes)
    const before = children[range.startOffset - 1]
    const after = children[range.startOffset]
    const span = findSpan(before || null) || findSpan(after || null)
    if (span) return styleFromSpan(span)
  }
  return fallback
}

function mergeAdjacentRuns(container: HTMLElement) {
  let node = container.firstChild
  while (node && node.nextSibling) {
    const next = node.nextSibling
    if (
      node instanceof HTMLElement &&
      next instanceof HTMLElement &&
      node.dataset.run &&
      next.dataset.run &&
      sameStyle(styleFromSpan(node), styleFromSpan(next))
    ) {
      node.textContent = (node.textContent || '') + (next.textContent || '')
      next.remove()
      continue
    }
    node = next
  }
}


