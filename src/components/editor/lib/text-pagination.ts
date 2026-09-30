/**
 * Split a text box's wrapped lines across pages.
 *
 * The editor used to decide "this line still fits" from `fontSize * lineHeight`
 * and to recover line boundaries with `indexOf` on Fabric's visual lines. Both
 * fail for a real paste: Fabric's line box is taller than that estimate (so the
 * caret paints past the bottom margin before a break is triggered), and a
 * wrapped line is not always a unique substring (a failed search aborted the
 * whole split and left every line on the first page).
 *
 * Callers measure lines (or use {@link wrapPlainText} when measurement cannot
 * be reconciled with the source string). This module only packs those lines
 * into page slices and rebuilds each slice's text in reading order.
 */

export interface FlowLine {
  /** Inclusive start into the source string. */
  start: number;
  /** Exclusive end into the source string. The gap before the next line (a
   * wrap space or a hard newline) sits between `end` and the next `start`. */
  end: number;
  /** Full line box, including leading, in the same units as the page room. */
  height: number;
}

export interface FlowSlice {
  start: number;
  end: number;
  height: number;
  /** Indexes into the `lines` array passed to {@link paginateFlowLines}. */
  lineIndexes: number[];
}

export interface MeasuredVisualLine {
  text: string;
  /** Source characters after this line that are not part of the next visual
   * line. Ignored for the last line. `1` for a hard newline or a wrap space
   * Fabric consumed; `0` when the next line continues immediately. */
  gapAfter: number;
  height: number;
}

/**
 * Rebuild source offsets from visual lines. Returns null when the walk does
 * not consume the source exactly — the caller should wrap the string itself
 * rather than ship a sliced paste with holes or duplicates.
 */
export function flowLinesFromMeasured(
  sourceLength: number,
  measured: MeasuredVisualLine[],
): FlowLine[] | null {
  if (measured.length === 0) return sourceLength === 0 ? [] : null;
  const lines: FlowLine[] = [];
  let cursor = 0;
  for (let i = 0; i < measured.length; i += 1) {
    const item = measured[i]!;
    const start = cursor;
    const end = start + item.text.length;
    if (end > sourceLength) return null;
    lines.push({ start, end, height: Math.max(item.height, 1) });
    cursor = end;
    if (i < measured.length - 1) {
      const gap = Math.max(0, item.gapAfter);
      if (cursor + gap > sourceLength) return null;
      cursor += gap;
    }
  }
  if (cursor !== sourceLength) return null;
  return lines;
}

/**
 * Greedy word wrap used when Fabric's visual lines cannot be mapped back onto
 * the source. Hard newlines start a new paragraph. A wrap breaks at the last
 * space that fits, and an overlong token is split so it cannot run past the
 * right edge. The space that caused a wrap is not part of either line; a slice
 * that keeps both lines still covers it because the slice spans `start…end`.
 */
export function wrapPlainText(
  text: string,
  charsPerLine: number,
  lineHeight: number,
): FlowLine[] {
  const width = Math.max(1, Math.floor(charsPerLine));
  const height = Math.max(lineHeight, 1);
  const lines: FlowLine[] = [];
  const paragraphs = text.split("\n");
  let base = 0;
  for (let p = 0; p < paragraphs.length; p += 1) {
    const paragraph = paragraphs[p]!;
    if (paragraph.length === 0) {
      lines.push({ start: base, end: base, height });
    } else {
      let index = 0;
      while (index < paragraph.length) {
        let end = Math.min(paragraph.length, index + width);
        if (end < paragraph.length) {
          const space = paragraph.lastIndexOf(" ", end);
          if (space > index) end = space;
        }
        lines.push({ start: base + index, end: base + end, height });
        index = end;
        while (paragraph[index] === " ") index += 1;
      }
    }
    base += paragraph.length;
    if (p < paragraphs.length - 1) base += 1;
  }
  return lines;
}

/**
 * Pack lines into pages. `firstRoom` is the space from the box top to the
 * bottom margin; `nextRoom` is the full content height of every following
 * page. A line taller than the room still occupies a page on its own — it is
 * never dropped and never stacked under another line that would push it
 * further past the margin.
 */
export function paginateFlowLines(
  lines: FlowLine[],
  firstRoom: number,
  nextRoom: number,
): FlowSlice[] {
  if (lines.length === 0) return [];
  const pages: FlowSlice[] = [];
  let room = Number.isFinite(firstRoom) ? firstRoom : 0;
  let current: number[] = [];
  let used = 0;

  const flush = () => {
    if (current.length === 0) return;
    const first = lines[current[0]!]!;
    const last = lines[current[current.length - 1]!]!;
    let height = 0;
    for (const index of current) height += lines[index]!.height;
    pages.push({
      start: first.start,
      end: last.end,
      height,
      lineIndexes: current,
    });
    current = [];
    used = 0;
    room = Math.max(Number.isFinite(nextRoom) ? nextRoom : 0, 1);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const height = lines[i]!.height;
    if (current.length > 0 && used + height > room + 0.5) flush();
    current.push(i);
    used += height;
  }
  flush();
  return pages;
}

/**
 * Exclusive source range for one page slice.
 * Every character belongs to exactly one slice — no overlap, no dropped
 * wrap-spaces. Using visual-line `.join("\\n")` was what put page 1's
 * characters onto the last page.
 */
export function flowSliceSourceText(
  text: string,
  slices: FlowSlice[],
  index: number,
): string {
  const slice = slices[index];
  if (!slice) return "";
  const start = Math.max(0, slice.start);
  const end =
    index < slices.length - 1
      ? Math.max(start, slices[index + 1]!.start)
      : text.length;
  return text.slice(start, end);
}

/** Visual lines of one page, joined so a later bake keeps every line. */
export function flowSliceContent(
  text: string,
  _lines: FlowLine[],
  slice: FlowSlice,
): string {
  return text.slice(slice.start, slice.end);
}
