import { PDFDocument, PDFName, PDFString, TextRenderingMode, degrees, rgb } from '@cantoo/pdf-lib'
import type {
  EditorPage,
  EditorElement,
  TextElement,
  ShapeElement,
  DrawElement,
  NoteElement,
  FormFieldElement,
  RedactElement,
  WatermarkConfig,
  SecurityPermissions,
} from '@/lib/pdf-editor-types'
import { resolveStandardFont, fontCacheKey, type FontFamily } from '@/lib/pdf-editor-fonts'
import { buildFilledFlattenedDoc, type DetectedField } from '@/lib/pdf-editor-forms'
import { rasterizePageWithRedactions } from '@/lib/pdf-editor-redact'
import type { OcrPageResult } from '@/lib/pdf-editor-ocr'

type PdfPage = ReturnType<PDFDocument['addPage']>
type PdfFont = Awaited<ReturnType<PDFDocument['embedFont']>>
type PdfImage = Awaited<ReturnType<PDFDocument['embedPng']>>

export type SecurityOptions = {
  enabled: boolean
  openPassword: string
  ownerPassword: string
  permissions: SecurityPermissions
}

export async function buildFinalPdf({
  sourceDocs,
  sourceBytesList = [],
  detectedFields = [],
  ocrPages = {},
  pages,
  elements,
  watermark,
  security,
}: {
  sourceDocs: (PDFDocument | null)[]
  sourceBytesList?: (Uint8Array | null)[]
  detectedFields?: DetectedField[]
  ocrPages?: Record<string, OcrPageResult>
  pages: EditorPage[]
  elements: EditorElement[]
  watermark: WatermarkConfig
  security: SecurityOptions
}): Promise<Uint8Array> {
  const finalDoc = await PDFDocument.create()
  const imageCache = new Map<string, PdfImage>()
  const fontCache = new Map<string, PdfFont>()

  async function fontFor(family: FontFamily, bold: boolean, italic: boolean) {
    const key = fontCacheKey(family, bold, italic)
    let f = fontCache.get(key)
    if (!f) {
      f = await finalDoc.embedFont(resolveStandardFont(family, bold, italic))
      fontCache.set(key, f)
    }
    return f
  }

  async function embedImage(dataUrl: string, bytes: Uint8Array, format: 'png' | 'jpg') {
    let embedded = imageCache.get(dataUrl)
    if (!embedded) {
      embedded = format === 'png' ? await finalDoc.embedPng(bytes) : await finalDoc.embedJpg(bytes)
      imageCache.set(dataUrl, embedded)
    }
    return embedded
  }

  // --- Form fields: fill + flatten on scratch copies of each affected
  // source document, so the live, still-interactive documents the editor
  // session holds are never mutated. ---------------------------------
  const fieldsByDocIndex = new Map<number, DetectedField[]>()
  for (const f of detectedFields) {
    const arr = fieldsByDocIndex.get(f.docIndex) || []
    arr.push(f)
    fieldsByDocIndex.set(f.docIndex, arr)
  }
  const filledDocs = new Map<number, PDFDocument>()
  const filledBytes = new Map<number, Uint8Array>()
  for (const [docIndex, fields] of fieldsByDocIndex) {
    const bytes = sourceBytesList[docIndex]
    if (!bytes) continue
    const filled = await buildFilledFlattenedDoc(bytes, fields)
    filledDocs.set(docIndex, filled)
    filledBytes.set(docIndex, await filled.save())
  }
  function effectiveSourceDoc(docIndex: number): PDFDocument | null {
    return filledDocs.get(docIndex) || sourceDocs[docIndex] || null
  }
  function effectiveSourceBytes(docIndex: number): Uint8Array | null {
    return filledBytes.get(docIndex) || sourceBytesList[docIndex] || null
  }

  const newPageById = new Map<string, PdfPage>()
  let formCache: ReturnType<PDFDocument['getForm']> | null = null

  for (const page of pages) {
    const redactEls = elements.filter(
      (e): e is RedactElement => e.pageId === page.id && e.type === 'redact',
    )

    let newPage: PdfPage
    if (page.source.kind === 'copy' && redactEls.length > 0) {
      const bytes = effectiveSourceBytes(page.source.docIndex)
      if (bytes) {
        const raster = await rasterizePageWithRedactions(
          bytes,
          page.source.originalIndex + 1,
          redactEls.map((el) => ({ xf: el.xf, yf: el.yf, wf: el.wf, hf: el.hf })),
        )
        const embedded = await finalDoc.embedPng(raster)
        newPage = finalDoc.addPage([page.widthPt, page.heightPt])
        newPage.drawImage(embedded, { x: 0, y: 0, width: page.widthPt, height: page.heightPt })
      } else {
        newPage = finalDoc.addPage([page.widthPt, page.heightPt])
      }
    } else if (page.source.kind === 'copy') {
      const doc = effectiveSourceDoc(page.source.docIndex)
      newPage = doc
        ? finalDoc.addPage((await finalDoc.copyPages(doc, [page.source.originalIndex]))[0])
        : finalDoc.addPage([page.widthPt, page.heightPt])
    } else {
      newPage = finalDoc.addPage([page.widthPt, page.heightPt])
    }

    if (page.rotationDeg) newPage.setRotation(degrees(page.rotationDeg))
    newPageById.set(page.id, newPage)

    for (const el of elements.filter((e) => e.pageId === page.id)) {
      if (el.type === 'text') {
        const font = await fontFor(el.fontFamily, el.bold, el.italic)
        drawTextElement(newPage, el, page, font)
        if (el.url?.trim()) {
          addLinkAnnotation(newPage, el.url.trim(), rectFor(el, page))
        }
      } else if (el.type === 'image') {
        const embedded = await embedImage(el.dataUrl, el.bytes, el.format)
        const r = rectFor(el, page)
        newPage.drawImage(embedded, { x: r.x, y: r.y, width: r.width, height: r.height })
      } else if (el.type === 'draw') {
        drawFreehand(newPage, el, page)
      } else if (el.type === 'shape') {
        drawShape(newPage, el, page)
      } else if (el.type === 'note') {
        addNoteAnnotation(newPage, el, page)
      } else if (el.type === 'redact') {
        // 'copy' pages were already rasterized-and-blacked-out above; a
        // blank page has no hidden content underneath, so a plain black
        // box is sufficient and correct.
        if (page.source.kind === 'blank') {
          const r = rectFor(el, page)
          newPage.drawRectangle({ x: r.x, y: r.y, width: r.width, height: r.height, color: rgb(0, 0, 0) })
        }
      } else if (el.type === 'formField') {
        if (!formCache) formCache = finalDoc.getForm()
        const font = await fontFor('Helvetica', false, false)
        drawFormField(formCache, newPage, el, page, font)
      }
    }

    const ocr = ocrPages[page.id]
    if (ocr) {
      const font = await fontFor('Helvetica', false, false)
      drawOcrTextLayer(newPage, page, ocr, font)
    }
  }

  if (watermark.enabled) {
    const targetPages =
      watermark.scope === 'all' ? pages : pages.filter((p) => watermark.selectedPageIds.includes(p.id))
    const font = watermark.kind === 'text' ? await fontFor(watermark.fontFamily, false, false) : null
    const image =
      watermark.kind === 'image' && watermark.imageBytes
        ? await embedImage(watermark.imageDataUrl, watermark.imageBytes, watermark.imageFormat)
        : null
    for (const page of targetPages) {
      const newPage = newPageById.get(page.id)
      if (!newPage) continue
      drawWatermark(newPage, page, watermark, font, image)
    }
  }

  if (security.enabled) {
    finalDoc.encrypt({
      userPassword: security.openPassword,
      ownerPassword: security.ownerPassword || security.openPassword,
      permissions: {
        printing: security.permissions.printing ? 'highResolution' : false,
        copying: security.permissions.copying,
        modifying: security.permissions.modifying,
        annotating: security.permissions.annotating,
      },
    })
  }

  return finalDoc.save()
}

function rectFor(el: EditorElement, page: EditorPage) {
  return {
    x: el.xf * page.widthPt,
    y: page.heightPt - (el.yf + el.hf) * page.heightPt,
    width: el.wf * page.widthPt,
    height: el.hf * page.heightPt,
  }
}

function drawTextElement(page: PdfPage, el: TextElement, editorPage: EditorPage, font: PdfFont) {
  const r = rectFor(el, editorPage)
  const lines = wrapText(el.text || '', font, el.fontSizePt, Math.max(1, r.width))
  const lineHeight = el.fontSizePt * 1.2
  const totalHeight = lines.length * lineHeight
  let y = r.y + r.height - Math.max(0, (r.height - totalHeight) / 2) - el.fontSizePt
  for (const line of lines) {
    const lineWidth = font.widthOfTextAtSize(line, el.fontSizePt)
    let x = r.x
    if (el.align === 'center') x = r.x + Math.max(0, (r.width - lineWidth) / 2)
    else if (el.align === 'right') x = r.x + Math.max(0, r.width - lineWidth)
    page.drawText(line, { x, y, size: el.fontSizePt, font, color: hexToRgb(el.color) })
    y -= lineHeight
  }
}

function wrapText(text: string, font: PdfFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ')
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
    }
    lines.push(line)
  }
  return lines
}

function drawFreehand(page: PdfPage, el: DrawElement, editorPage: EditorPage) {
  const r = rectFor(el, editorPage)
  const color = hexToRgb(el.color)
  for (let i = 1; i < el.points.length; i++) {
    const a = el.points[i - 1]
    const b = el.points[i]
    page.drawLine({
      start: { x: r.x + a.x * r.width, y: r.y + r.height - a.y * r.height },
      end: { x: r.x + b.x * r.width, y: r.y + r.height - b.y * r.height },
      thickness: el.strokeWidthPt,
      color,
      opacity: 1,
    })
  }
}

function drawShape(page: PdfPage, el: ShapeElement, editorPage: EditorPage) {
  const r = rectFor(el, editorPage)
  const color = hexToRgb(el.color)
  switch (el.shapeKind) {
    case 'rect':
      page.drawRectangle({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        borderColor: color,
        borderWidth: el.strokeWidthPt,
        color: el.fillOpacity > 0 ? color : undefined,
        opacity: el.fillOpacity > 0 ? el.fillOpacity : 1,
        borderOpacity: 1,
      })
      break
    case 'ellipse':
      page.drawEllipse({
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        xScale: r.width / 2,
        yScale: r.height / 2,
        borderColor: color,
        borderWidth: el.strokeWidthPt,
        color: el.fillOpacity > 0 ? color : undefined,
        opacity: el.fillOpacity > 0 ? el.fillOpacity : 1,
        borderOpacity: 1,
      })
      break
    case 'line':
    case 'underline':
    case 'strikethrough': {
      const y = el.shapeKind === 'line' ? r.y + r.height / 2 : el.shapeKind === 'underline' ? r.y : r.y + r.height / 2
      page.drawLine({
        start: { x: r.x, y },
        end: { x: r.x + r.width, y },
        thickness: el.strokeWidthPt,
        color,
      })
      break
    }
    case 'arrow': {
      const start = { x: r.x, y: r.y + r.height / 2 }
      const end = { x: r.x + r.width, y: r.y + r.height / 2 }
      page.drawLine({ start, end, thickness: el.strokeWidthPt, color })
      const headSize = Math.max(6, el.strokeWidthPt * 4)
      const angle = Math.atan2(end.y - start.y, end.x - start.x)
      const leftWing = angle + (Math.PI * 5) / 6
      const rightWing = angle - (Math.PI * 5) / 6
      page.drawLine({
        start: end,
        end: { x: end.x + headSize * Math.cos(leftWing), y: end.y + headSize * Math.sin(leftWing) },
        thickness: el.strokeWidthPt,
        color,
      })
      page.drawLine({
        start: end,
        end: { x: end.x + headSize * Math.cos(rightWing), y: end.y + headSize * Math.sin(rightWing) },
        thickness: el.strokeWidthPt,
        color,
      })
      break
    }
    case 'highlight':
      page.drawRectangle({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        color,
        opacity: el.fillOpacity || 0.4,
      })
      break
  }
}

/** Low-level annotation helpers — pdf-lib has no high-level drawLink/note
 * helper, so these build the /Annots entry directly. */
function pushAnnotation(page: PdfPage, dict: Record<string, unknown>) {
  const doc = page.doc
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = doc.context.obj(dict as any)
  const ref = doc.context.register(obj)
  const existing = page.node.Annots()
  if (existing) existing.push(ref)
  else page.node.set(PDFName.of('Annots'), doc.context.obj([ref]))
}

function addLinkAnnotation(
  page: PdfPage,
  url: string,
  rect: { x: number; y: number; width: number; height: number },
) {
  pushAnnotation(page, {
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
    Border: [0, 0, 0],
    A: page.doc.context.obj({ Type: 'Action', S: 'URI', URI: PDFString.of(url) }),
  })
}

function addNoteAnnotation(page: PdfPage, el: NoteElement, editorPage: EditorPage) {
  const r = rectFor(el, editorPage)
  pushAnnotation(page, {
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [r.x, r.y, r.x + Math.max(20, r.width), r.y + Math.max(20, r.height)],
    Contents: PDFString.of(el.text || ''),
    Name: 'Comment',
    Open: false,
    C: hexToColorArray(el.color),
  })
}

function drawWatermark(
  page: PdfPage,
  editorPage: EditorPage,
  wm: WatermarkConfig,
  font: PdfFont | null,
  image: PdfImage | null,
) {
  const w = editorPage.widthPt
  const h = editorPage.heightPt
  const rotate = wm.position === 'diagonal' ? Math.atan2(h, w) : 0

  if (wm.kind === 'text' && font) {
    const size = 48 * wm.scale
    const textWidth = font.widthOfTextAtSize(wm.text, size)
    const { x, y } = anchorFor(wm.position, w, h, textWidth, size)
    page.drawText(wm.text, {
      x,
      y,
      size,
      font,
      color: hexToRgb(wm.color),
      opacity: wm.opacity,
      rotate: degrees((rotate * 180) / Math.PI),
    })
  } else if (wm.kind === 'image' && image) {
    const baseWidth = w * 0.4 * wm.scale
    const imgHeight = baseWidth * (image.height / image.width)
    const { x, y } = anchorFor(wm.position, w, h, baseWidth, imgHeight)
    page.drawImage(image, { x, y, width: baseWidth, height: imgHeight, opacity: wm.opacity })
  }
}

function anchorFor(position: WatermarkConfig['position'], w: number, h: number, boxW: number, boxH: number) {
  const margin = 24
  switch (position) {
    case 'top-left':
      return { x: margin, y: h - margin - boxH }
    case 'top-right':
      return { x: w - margin - boxW, y: h - margin - boxH }
    case 'bottom-left':
      return { x: margin, y: margin }
    case 'bottom-right':
      return { x: w - margin - boxW, y: margin }
    case 'center':
    case 'diagonal':
    default:
      return { x: (w - boxW) / 2, y: (h - boxH) / 2 }
  }
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  return rgb(r || 0, g || 0, b || 0)
}

function hexToColorArray(hex: string) {
  const c = hexToRgb(hex)
  return [c.red, c.green, c.blue]
}

function drawFormField(
  form: ReturnType<PDFDocument['getForm']>,
  page: PdfPage,
  el: FormFieldElement,
  editorPage: EditorPage,
  font: PdfFont,
) {
  const r = rectFor(el, editorPage)
  const name = el.name.trim() || `field_${el.id}`
  try {
    if (el.fieldKind === 'text') {
      const tf = form.createTextField(name)
      tf.setText(el.value || '')
      tf.addToPage(page, { x: r.x, y: r.y, width: r.width, height: r.height, font })
    } else if (el.fieldKind === 'checkbox') {
      const cb = form.createCheckBox(name)
      if (el.checked) cb.check()
      cb.addToPage(page, { x: r.x, y: r.y, width: r.width, height: r.height })
    } else if (el.fieldKind === 'dropdown') {
      const dd = form.createDropdown(name)
      const options = el.options.length ? el.options : ['Option 1']
      dd.addOptions(options)
      dd.select(el.value || options[0])
      dd.addToPage(page, { x: r.x, y: r.y, width: r.width, height: r.height, font })
    }
  } catch {
    // Field name collision (e.g. two fields given the same name) — skip
    // rather than fail the whole export.
  }
}

/** Draws an invisible, OCR-derived text layer over the page so it becomes
 * searchable/selectable — the visible page content is untouched. Word
 * positions are approximate (mapped from the OCR canvas's pixel space back
 * to PDF points), which is standard for this technique. */
function drawOcrTextLayer(page: PdfPage, editorPage: EditorPage, ocr: OcrPageResult, font: PdfFont) {
  const s = ocr.scale
  for (const w of ocr.words) {
    const widthPt = (w.x1 - w.x0) / s
    const heightPt = (w.y1 - w.y0) / s
    if (widthPt <= 0 || heightPt <= 0) continue
    const x = w.x0 / s
    const y = editorPage.heightPt - w.y1 / s
    const naturalWidth = font.widthOfTextAtSize(w.text, heightPt) || widthPt
    const size = naturalWidth > 0 ? heightPt * (widthPt / naturalWidth) : heightPt
    try {
      page.drawText(w.text, { x, y, size: Math.max(1, size), font, renderMode: TextRenderingMode.Invisible })
    } catch {
      // A handful of glyphs the standard font can't encode shouldn't sink the whole OCR pass.
    }
  }
}
