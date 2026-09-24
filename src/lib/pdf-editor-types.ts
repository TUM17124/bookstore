import type { FontFamily } from '@/lib/pdf-editor-fonts'

export type ElementBase = {
  id: string
  pageId: string
  // Position/size as fractions (0..1) of the page's width/height, origin
  // top-left — independent of zoom, so they translate directly onto the
  // final PDF page's point dimensions at export time.
  xf: number
  yf: number
  wf: number
  hf: number
}

export type TextAlign = 'left' | 'center' | 'right'

/** One contiguous run of same-styled text within a text block. A block's
 * actual content is `runs`, not a single flat string — this is what lets
 * one word in the middle of a sentence carry its own font/size/color
 * independent of the rest, instead of one style applying to the whole
 * block. See rich-text-editor.tsx for how the contenteditable surface
 * reads/writes this array. */
export type TextRun = {
  text: string
  fontSizePt: number
  color: string
  fontFamily: FontFamily
  bold: boolean
  italic: boolean
}

export type TextElement = ElementBase & {
  type: 'text'
  runs: TextRun[]
  /** Style for a brand-new empty block (its first run) and the toolbar's
   * fallback when no run can be resolved (e.g. a totally empty editor) —
   * NOT applied to existing content. Live editing always reads/writes
   * per-run style via the runs above. */
  fontSizePt: number
  color: string
  fontFamily: FontFamily
  bold: boolean
  italic: boolean
  align: TextAlign
  /** Optional — when set, the text becomes a clickable link on export. */
  url: string
  /** Set when this element was created by clicking into a DETECTED run of
   * existing page content (an uploaded PDF's own text — see
   * pdf-editor-text-layer.ts) rather than inserted fresh. The original
   * glyphs are still baked into the copied page underneath, so export must
   * paint a rectangle in this sampled background color behind the new text
   * first, to actually hide them — not just draw over them visually in the
   * live editor. Undefined for elements the user placed on blank space. */
  coverColor?: string
  /** Set for a block created by clicking blank page space (Part G) — its
   * height grows automatically to fit typed content instead of showing
   * the overflow hint a fixed-size block would. Its width is still bounded
   * by the page's right margin from creation, so long lines wrap there
   * rather than growing the block wider. */
  autoGrow?: boolean
}

export function runsToPlainText(runs: TextRun[]): string {
  return runs.map((r) => r.text).join('')
}

export type ImageElement = ElementBase & {
  type: 'image'
  dataUrl: string
  bytes: Uint8Array
  format: 'png' | 'jpg'
  naturalAspect: number
}

/** A freehand pen stroke. `points` are fractions *within this element's own
 * bounding box* (0..1), so moving/resizing the box moves/scales the whole
 * stroke, same as any other element. */
export type DrawElement = ElementBase & {
  type: 'draw'
  points: { x: number; y: number }[]
  color: string
  strokeWidthPt: number
}

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow' | 'highlight' | 'underline' | 'strikethrough'

export type ShapeElement = ElementBase & {
  type: 'shape'
  shapeKind: ShapeKind
  color: string
  strokeWidthPt: number
  /** 0..1 fill opacity. Highlight uses this; other shapes are stroke-only. */
  fillOpacity: number
}

/** A classic PDF "sticky note" comment — a small icon on the page that
 * shows `text` when opened in a PDF reader. */
export type NoteElement = ElementBase & {
  type: 'note'
  text: string
  color: string
}

/** A box marking content to be permanently removed at export time. Renders
 * as a solid black box; on a page copied from an uploaded PDF, the whole
 * page is rasterized and the underlying data is actually gone from the
 * output — not just visually covered. See pdf-editor-redact.ts. */
export type RedactElement = ElementBase & {
  type: 'redact'
}

export type FormFieldKind = 'text' | 'checkbox' | 'dropdown'

/** A brand-new interactive form field placed by the user (as opposed to a
 * field detected on an uploaded PDF — see DetectedField in
 * pdf-editor-forms.ts). Created directly as a real AcroForm field in the
 * exported document. */
export type FormFieldElement = ElementBase & {
  type: 'formField'
  fieldKind: FormFieldKind
  name: string
  value: string
  checked: boolean
  options: string[]
  fontSizePt: number
}

export type EditorElement =
  | TextElement
  | ImageElement
  | DrawElement
  | ShapeElement
  | NoteElement
  | RedactElement
  | FormFieldElement

export type PageRotation = 0 | 90 | 180 | 270

export type EditorPage = {
  id: string
  widthPt: number
  heightPt: number
  rotationDeg: PageRotation
  /** Rasterized background for a page copied from an uploaded PDF; null
   * for a blank page created in the editor. */
  previewDataUrl: string | null
  /** Where this page's content comes from at export time. `docIndex`
   * indexes into the editor's `sourceDocs` array (supports merging pages
   * from more than one uploaded PDF into a single document). */
  source: { kind: 'blank' } | { kind: 'copy'; docIndex: number; originalIndex: number }
}

export type WatermarkKind = 'text' | 'image'
export type WatermarkPosition = 'center' | 'diagonal' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export type WatermarkConfig = {
  enabled: boolean
  kind: WatermarkKind
  text: string
  fontFamily: FontFamily
  color: string
  imageDataUrl: string
  imageBytes: Uint8Array | null
  imageFormat: 'png' | 'jpg'
  opacity: number
  position: WatermarkPosition
  scale: number
  /** Which pages get the watermark. */
  scope: 'all' | 'selected'
  selectedPageIds: string[]
}

export function defaultWatermark(): WatermarkConfig {
  return {
    enabled: false,
    kind: 'text',
    text: 'CONFIDENTIAL',
    fontFamily: 'Helvetica',
    color: '#ff0000',
    imageDataUrl: '',
    imageBytes: null,
    imageFormat: 'png',
    opacity: 0.25,
    position: 'diagonal',
    scale: 1,
    scope: 'all',
    selectedPageIds: [],
  }
}

export type SecurityPermissions = {
  printing: boolean
  copying: boolean
  modifying: boolean
  annotating: boolean
}

export function defaultPermissions(): SecurityPermissions {
  return { printing: true, copying: true, modifying: true, annotating: true }
}

/** The document-content part of editor state — what undo/redo snapshots
 * and the autosave draft both capture. Selection/UI state is intentionally
 * excluded. */
export type EditorSnapshot = {
  pages: EditorPage[]
  elements: EditorElement[]
  watermark: WatermarkConfig
}

export const A4_WIDTH_PT = 595.28
export const A4_HEIGHT_PT = 841.89

export const MAX_PDF_BYTES = 25 * 1024 * 1024 // 25MB
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8MB


