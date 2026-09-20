import { loadPdfJs } from '@/lib/pdfjs-loader'
import type { FontFamily } from '@/lib/pdf-editor-fonts'

/** One existing text run detected on an uploaded PDF page — positioned in
 * the same xf/yf/wf/hf fraction space as every other editor element (and
 * the same raw/unrotated PDF-point frame detectFormFields already uses for
 * form-field widgets), so it overlays correctly without any extra
 * transform. Clicking one seeds an editable TextElement at this position —
 * see startEditingDetectedRun in the editor page. */
export type DetectedTextRun = {
  id: string
  pageId: string
  text: string
  xf: number
  yf: number
  wf: number
  hf: number
  fontSizePt: number
  fontFamily: FontFamily
  bold: boolean
  italic: boolean
  /** Best-effort — pdf.js's getTextContent() does not expose the actual
   * fill color used to paint the glyphs (only font/position data), so this
   * is always black. Covers the overwhelming common case; a user can still
   * recolor after clicking in, same as any other text edit. */
  color: string
}

function guessFontFamily(name: string): FontFamily {
  const n = name.toLowerCase()
  if (n.includes('courier') || n.includes('mono') || n.includes('consol')) return 'Courier'
  // "sans-serif" contains the substring "serif" — pdf.js's own generic CSS
  // fallback for a standard sans font is literally "sans-serif", so a
  // plain .includes('serif') check misclassifies every ordinary Helvetica/
  // Arial run as Times. Requiring a serif hit to NOT also be a sans-serif
  // hit fixes that without losing real serif-font detection.
  const looksSerif =
    (n.includes('serif') && !n.includes('sans-serif') && !n.includes('sans serif')) ||
    n.includes('times') ||
    n.includes('georgia') ||
    n.includes('garamond') ||
    n.includes('minion')
  if (looksSerif) return 'TimesRoman'
  return 'Helvetica'
}

/** pdf.js's TextItem doesn't have an explicit bold/italic flag — the font's
 * own PostScript-ish name is the only signal available (e.g.
 * "Helvetica-BoldOblique", "Arial,Bold"), same heuristic every pdf.js-based
 * text-layer tool relies on. */
function guessBoldItalic(name: string): { bold: boolean; italic: boolean } {
  const n = name.toLowerCase()
  return {
    bold: n.includes('bold') || n.includes('black') || n.includes('heavy'),
    italic: n.includes('italic') || n.includes('oblique'),
  }
}

type PdfTextItem = {
  str?: string
  transform?: number[]
  width?: number
  height?: number
  fontName?: string
}

/** Detects every text run on one page of an uploaded PDF, in the page's
 * own point-space (matching EditorPage.widthPt/heightPt) — deliberately
 * NOT run through a rotation-aware viewport, so a page with no intrinsic
 * rotation (the overwhelming common case) lines up exactly with the
 * existing preview render and with detectFormFields' own widget rectangles,
 * which use this same raw frame. A source PDF with genuine intrinsic page
 * rotation baked into its own /Rotate entry shares this same limitation
 * with the existing form-field overlay — not a new gap Phase 2 introduces. */
export async function detectPageTextRuns(
  bytes: Uint8Array,
  pageNumber: number,
  pageId: string,
  widthPt: number,
  heightPt: number,
): Promise<DetectedTextRun[]> {
  if (!widthPt || !heightPt) return []
  await loadPdfJs()
  const pdf = await window.pdfjsLib!.getDocument({ data: bytes.slice() }).promise
  const page = await pdf.getPage(pageNumber)
  const content = await page.getTextContent()

  const runs: DetectedTextRun[] = []
  let idx = 0
  for (const raw of content.items as PdfTextItem[]) {
    const text = raw.str
    if (!text || !text.trim() || !raw.transform) continue

    const [a, b, , d, e, f] = raw.transform
    const fontSizePt = Math.hypot(a, b) || Math.abs(d) || 12
    const runWidthPt = raw.width || fontSizePt * text.length * 0.5
    const runHeightPt = raw.height || fontSizePt * 1.15

    // (e, f) is the run's baseline-start point in the page's raw point
    // space (bottom-left origin, y-up). The box spans from baseline up to
    // baseline + runHeightPt, PLUS a descender allowance below the
    // baseline — without it, characters like g/j/p/q/y and commas visibly
    // peek out beneath the covering rectangle when this run gets edited
    // (confirmed live: a "g" and comma bled through before this was
    // added). 0.25*fontSize is a standard rough descender depth.
    const descenderPt = fontSizePt * 0.25
    const totalHeightPt = runHeightPt + descenderPt
    const hf = totalHeightPt / heightPt
    const yf = 1 - (f + runHeightPt) / heightPt

    const style = (content.styles as Record<string, { fontFamily?: string }> | undefined)?.[raw.fontName || '']
    const nameForGuess = style?.fontFamily || raw.fontName || ''

    runs.push({
      id: `${pageId}:${idx++}`,
      pageId,
      text,
      xf: e / widthPt,
      yf,
      wf: runWidthPt / widthPt,
      hf,
      fontSizePt,
      fontFamily: guessFontFamily(nameForGuess),
      ...guessBoldItalic(nameForGuess),
      color: '#000000',
    })
  }
  return runs
}

/** Samples the page's own rendered preview image just outside a detected
 * run's tight bounding box, to get a covering-rectangle color close to the
 * real page background at that spot — handles a plain white page and a
 * colored/scanned one the same way, rather than assuming white. Sampling
 * just outside the box's edges (not its center) avoids landing on the
 * text's own glyph pixels most of the time. */
export function sampleBackgroundColor(
  previewDataUrl: string,
  xf: number,
  yf: number,
  wf: number,
  hf: number,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx || canvas.width === 0 || canvas.height === 0) {
        resolve('#ffffff')
        return
      }
      ctx.drawImage(img, 0, 0)
      const pixelAt = (fx: number, fy: number) => {
        const x = Math.min(canvas.width - 1, Math.max(0, Math.round(fx * canvas.width)))
        const y = Math.min(canvas.height - 1, Math.max(0, Math.round(fy * canvas.height)))
        return ctx.getImageData(x, y, 1, 1).data
      }
      const marginY = Math.max(0.005, hf * 0.15)
      const marginX = Math.max(0.003, wf * 0.03)
      const samples = [
        pixelAt(xf - marginX, yf - marginY),
        pixelAt(xf + wf + marginX, yf - marginY),
        pixelAt(xf - marginX, yf + hf + marginY),
      ]
      let r = 0
      let g = 0
      let b = 0
      for (const s of samples) {
        r += s[0]
        g += s[1]
        b += s[2]
      }
      const n = samples.length
      const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0')
      resolve(`#${hex(r)}${hex(g)}${hex(b)}`)
    }
    img.onerror = () => resolve('#ffffff')
    img.src = previewDataUrl
  })
}


