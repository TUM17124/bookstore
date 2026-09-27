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
}

export type TextPiece = {
  text: string
  marked: boolean
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

/** Non-overlapping [start, end) ranges of each quote inside the page text. */
export function quoteRanges(
  pageText: string,
  quotes: string[],
): Array<[number, number]> {
  const clean = normalizeNoteText(pageText)
  const ranges: Array<[number, number]> = []
  for (const raw of quotes) {
    const quote = normalizeNoteText(raw)
    if (quote.length < 2) continue
    let from = 0
    while (from < clean.length) {
      const at = clean.indexOf(quote, from)
      if (at < 0) break
      ranges.push([at, at + quote.length])
      from = at + quote.length
    }
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
    .map(
      ([rangeStart, rangeEnd]) =>
        [
          Math.max(rangeStart, start) - start,
          Math.min(rangeEnd, end) - start,
        ] as [number, number],
    )
    .filter(([rangeStart, rangeEnd]) => rangeEnd > rangeStart)
  if (!local.length) return [{ text, marked: false }]
  const pieces: TextPiece[] = []
  let cursor = 0
  for (const [rangeStart, rangeEnd] of local) {
    if (rangeStart > cursor) {
      pieces.push({ text: text.slice(cursor, rangeStart), marked: false })
    }
    pieces.push({ text: text.slice(rangeStart, rangeEnd), marked: true })
    cursor = rangeEnd
  }
  if (cursor < text.length) {
    pieces.push({ text: text.slice(cursor), marked: false })
  }
  return pieces.filter((piece) => piece.text.length > 0)
}
