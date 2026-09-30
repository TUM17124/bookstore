/**
 * Highlights and thoughts on a flowing PDF page.
 *
 * Page text in the reader is stored as one whitespace-collapsed string. A
 * highlight is that same string (or a slice of it). These helpers find those
 * slices and cut a sentence into plain and highlighted pieces so the reader
 * can paint them without losing the surrounding sentence buttons.
 */

export type PdfThought = {
  id: string
  page: number
  quote: string
  thought: string
  startOffset?: number
  endOffset?: number
}

export type TextPiece = {
  text: string
  marked: boolean
  rangeStart?: number
}

export type QuoteLike =
  | string
  | {
      quote?: string
      startOffset?: number
      endOffset?: number
    }

export function notesStorageKey(
  bookId: string | undefined,
  url: string,
): string {
  const stem = (bookId || url.split("?")[0] || "book").trim()
  return `plugyard-pdf-notes:${stem}`
}

export function normalizeNoteText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function firstQuoteRange(
  clean: string,
  raw: string,
): [number, number] | null {
  const quote = normalizeNoteText(raw)
  if (quote.length < 2) return null
  const at = clean.indexOf(quote)
  if (at < 0) return null
  return [at, at + quote.length]
}

function exactOffsetRange(
  clean: string,
  item: { startOffset?: number; endOffset?: number; quote?: string },
): [number, number] | null {
  const start = Number(item.startOffset)
  const end = Number(item.endOffset)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null
  }
  // A stale pair must never paint the wrong passage: when the slice no longer
  // reads as the saved quote (or a leading prefix of it), fall back to the
  // first matching occurrence. Accepting a prefix handles the case where the
  // stored endOffset cuts the quote short (e.g. the user highlighted only
  // part of the word) — the slice is genuine, just shorter than expected.
  const quote = normalizeNoteText(item.quote || "")
  const slice = clean.slice(start, end)
  if (quote.length >= 2 && (slice.length === 0 || (slice !== quote && !quote.startsWith(slice)))) {
    return null
  }
  return [
    Math.max(0, Math.min(clean.length, start)),
    Math.max(0, Math.min(clean.length, end)),
  ]
}

export function highlightRangeFor(
  pageText: string,
  thought: QuoteLike,
): [number, number] | null {
  const clean = normalizeNoteText(pageText)
  if (!clean) return null

  if (typeof thought === "string") {
    return firstQuoteRange(clean, thought)
  }

  return exactOffsetRange(clean, thought) || firstQuoteRange(clean, thought.quote || "")
}

/** The same ranges as `quoteRanges`, but each thought carries its exact offsets. */
export function thoughtRanges(
  pageText: string,
  thoughts: QuoteLike[],
): Array<[number, number]> {
  return quoteRanges(pageText, thoughts)
}

/** Non-overlapping [start, end) ranges inside the page text. */
export function quoteRanges(
  pageText: string,
  quotes: QuoteLike[],
): Array<[number, number]> {
  const clean = normalizeNoteText(pageText)
  const ranges: Array<[number, number]> = []

  for (const raw of quotes) {
    const range = highlightRangeFor(clean, raw)
    if (range) ranges.push(range)
  }

  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: Array<[number, number]> = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (!last || range[0] > last[1]) merged.push([range[0], range[1]])
    else last[1] = Math.max(last[1], range[1])
  }
  return merged
}

/**
 * Cut `text`, which begins at `start` in the page string, into plain and
 * highlighted pieces. Ranges that only partly overlap the slice are clipped.
 */
export function piecesBetween(
  text: string,
  start: number,
  ranges: Array<[number, number]>,
): TextPiece[] {
  if (!text) return []
  const end = start + text.length
  const local = ranges
    .map(([rangeStart, rangeEnd]) => ({
      from: Math.max(rangeStart, start) - start,
      to: Math.min(rangeEnd, end) - start,
      absStart: rangeStart,
    }))
    .filter((range) => range.to > range.from)
  if (!local.length) return [{ text, marked: false }]
  const pieces: TextPiece[] = []
  let cursor = 0
  for (const range of local) {
    if (range.from > cursor) {
      pieces.push({ text: text.slice(cursor, range.from), marked: false })
    }
    pieces.push({
      text: text.slice(range.from, range.to),
      marked: true,
      rangeStart: range.absStart,
    })
    cursor = range.to
  }
  if (cursor < text.length) {
    pieces.push({ text: text.slice(cursor), marked: false })
  }
  return pieces.filter((piece) => piece.text.length > 0)
}

export function occurrenceIndex(haystack: string, needle: string, at: number) {
  if (!needle) return 0
  let count = 0
  let from = 0
  while (from <= at) {
    const index = haystack.indexOf(needle, from)
    if (index < 0 || index > at) break
    if (index === at) return count
    count += 1
    from = index + Math.max(needle.length, 1)
  }
  return count
}

export function nthOccurrence(haystack: string, needle: string, n: number) {
  if (!needle) return -1
  let from = 0
  for (let i = 0; i <= n; i += 1) {
    const index = haystack.indexOf(needle, from)
    if (index < 0) return -1
    if (i === n) return index
    from = index + Math.max(needle.length, 1)
  }
  return -1
}

export function rawToNormalizedOffset(raw: string, rawOffset: number) {
  const collapsed = raw.replace(/\s+/g, " ")
  const lead = collapsed.length - collapsed.trimStart().length
  const normalized = collapsed.trim()
  const prefix = raw.slice(0, Math.max(0, rawOffset)).replace(/\s+/g, " ")
  return Math.max(0, Math.min(normalized.length, prefix.length - lead))
}