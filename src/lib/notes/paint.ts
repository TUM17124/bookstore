import { normalizeNoteText, quoteRanges } from "@/lib/pdf-notes"
import type { NoteColor } from "./types"

export type ColoredPiece = { text: string; color?: NoteColor | "plain"; noteId?: string; rangeStart?: number }

type Anchor = { id: string; quote: string; startOffset?: number | null; endOffset?: number | null; color: NoteColor | "" }

/**
 * Cut `text` (which starts at `start` in the page string) into plain pieces and
 * colour-tagged highlight pieces. Highlights come from each note's own
 * offsets (falling back to the quote text), exactly as the reader already
 * located them; overlapping highlights are clipped, the earlier one winning.
 */
export function colouredPieces(pageText: string, text: string, start: number, anchors: Anchor[]): ColoredPiece[] {
  if (!text) return []
  const clean = normalizeNoteText(pageText)
  const spans: { from: number; to: number; color: NoteColor | ""; id: string }[] = []
  for (const a of anchors) {
    const [range] = quoteRanges(clean, [{ quote: a.quote, startOffset: a.startOffset ?? undefined, endOffset: a.endOffset ?? undefined }])
    if (range) spans.push({ from: range[0], to: range[1], color: a.color || "yellow", id: a.id })
  }
  spans.sort((x, y) => x.from - y.from || x.to - y.to)
  const end = start + text.length
  const out: ColoredPiece[] = []
  let cursor = start
  let floor = 0
  for (const sp of spans) {
    const from = Math.max(sp.from, floor, start)
    const to = Math.min(sp.to, end)
    if (to <= from) continue
    if (from > cursor) out.push({ text: text.slice(cursor - start, from - start), color: "plain" })
    out.push({ text: text.slice(from - start, to - start), color: sp.color || "yellow", noteId: sp.id, rangeStart: sp.from })
    cursor = to
    floor = Math.max(floor, sp.to)
  }
  if (cursor < end) out.push({ text: text.slice(cursor - start), color: "plain" })
  return out.filter((p) => p.text.length > 0)
}
