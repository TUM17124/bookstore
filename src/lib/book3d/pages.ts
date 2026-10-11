/** Canvas painters for the pages of the 3D book. Pure drawing: no network. */

export const PAGE_W = 512
export const PAGE_H = 768
const PAPER = '#f6f1e3'
const INK = '#2b2620'

export function paintPaper(x: CanvasRenderingContext2D, w = PAGE_W, h = PAGE_H) {
  x.fillStyle = PAPER
  x.fillRect(0, 0, w, h)
}

/** Greedy word wrap; returns lines that fit `maxW`. */
export function wrapLines(x: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  for (const para of text.split(/\n+/)) {
    const words = para.trim().split(/\s+/).filter(Boolean)
    if (!words.length) continue
    let line = ''
    for (const wd of words) {
      const next = line ? line + ' ' + wd : wd
      if (x.measureText(next).width <= maxW || !line) line = next
      else {
        out.push(line)
        line = wd
      }
    }
    if (line) out.push(line)
    out.push('') // paragraph gap
  }
  while (out.length && out[out.length - 1] === '') out.pop()
  return out
}

/** A page of real book text, with its number. Long pages are cut at the bottom. */
export function paintTextPage(x: CanvasRenderingContext2D, text: string, pageNo: number, w = PAGE_W, h = PAGE_H) {
  paintPaper(x, w, h)
  const mx = 44
  const top = 54
  const bottom = h - 56
  x.fillStyle = INK
  x.textBaseline = 'alphabetic'
  x.textAlign = 'left'
  let size = 19
  let lines: string[] = []
  for (; size >= 11; size -= 1) {
    x.font = `${size}px Georgia, serif`
    lines = wrapLines(x, text, w - mx * 2)
    if (lines.length * size * 1.35 <= bottom - top) break
  }
  const lh = size * 1.35
  const maxLines = Math.floor((bottom - top) / lh)
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    if (lines[i]) x.fillText(lines[i], mx, top + i * lh)
  }
  if (lines.length > maxLines) {
    const g = x.createLinearGradient(0, bottom - 60, 0, bottom)
    g.addColorStop(0, 'rgba(246,241,227,0)')
    g.addColorStop(1, PAPER)
    x.fillStyle = g
    x.fillRect(0, bottom - 60, w, 60)
  }
  x.fillStyle = 'rgba(43,38,32,0.55)'
  x.font = '15px Georgia, serif'
  x.textAlign = 'center'
  x.fillText(String(pageNo), w / 2, h - 24)
}

/** Title page from metadata only. */
export function paintTitlePage(x: CanvasRenderingContext2D, title: string, author: string, w = PAGE_W, h = PAGE_H) {
  paintPaper(x, w, h)
  x.fillStyle = INK
  x.textAlign = 'center'
  x.textBaseline = 'alphabetic'
  let size = 38
  x.font = `700 ${size}px Georgia, serif`
  let lines = wrapLines(x, title, w - 110)
  while (lines.length > 4 && size > 22) {
    size -= 2
    x.font = `700 ${size}px Georgia, serif`
    lines = wrapLines(x, title, w - 110)
  }
  const lh = size * 1.25
  let y = h * 0.34
  for (const l of lines) {
    if (l) x.fillText(l, w / 2, y)
    y += lh
  }
  x.globalAlpha = 0.3
  x.fillRect(w / 2 - 36, y + 6, 72, 2)
  x.globalAlpha = 1
  x.font = 'italic 22px Georgia, serif'
  x.fillText(author, w / 2, y + 52)
}

/** Blank paper, optionally with one small centred note. */
export function paintBlankPage(x: CanvasRenderingContext2D, note?: string, w = PAGE_W, h = PAGE_H) {
  paintPaper(x, w, h)
  if (!note) return
  x.fillStyle = 'rgba(43,38,32,0.5)'
  x.font = 'italic 17px Georgia, serif'
  x.textAlign = 'center'
  x.fillText(note, w / 2, h * 0.52)
}

export type FacePlan = { kind: 'text'; text: string; no: number } | { kind: 'title' } | { kind: 'blank'; note?: string }

/**
 * What every face of the page leaves shows. Face 2k is the front of leaf k,
 * 2k+1 its back. Real text only; with no preview it is the title page and a
 * "Preview not available" note on blank paper. After the last real page:
 * blank paper marked "End of preview".
 */
export function planFaces(faces: number, preview: string[] | null): FacePlan[] {
  const plan: FacePlan[] = []
  if (!preview || !preview.length) {
    for (let i = 0; i < faces; i++) {
      if (i === 0) plan.push({ kind: 'title' })
      else if (i === 2) plan.push({ kind: 'blank', note: 'Preview not available' })
      else plan.push({ kind: 'blank' })
    }
    return plan
  }
  for (let i = 0; i < faces; i++) {
    if (i < preview.length) plan.push({ kind: 'text', text: preview[i], no: i + 1 })
    else plan.push({ kind: 'blank', note: i === preview.length ? 'End of preview' : undefined })
  }
  return plan
}

export function paintFace(x: CanvasRenderingContext2D, f: FacePlan, meta: { title: string; author: string }) {
  if (f.kind === 'text') paintTextPage(x, f.text, f.no)
  else if (f.kind === 'title') paintTitlePage(x, meta.title, meta.author)
  else paintBlankPage(x, f.note)
}
