'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Link from 'next/link'
import { PDFDocument } from '@cantoo/pdf-lib'
import {
  FileUp,
  FilePlus2,
  ImagePlus,
  Images,
  Lock,
  Download,
  Loader2,
  ArrowLeft,
  PenTool,
  FilePlus,
  Scissors,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Fullscreen,
  FileImage,
  ScanText,
  Minimize2,
  Plus,
  Files,
  Shield,
  ChevronDown,
  FormInput,
  PanelRight,
  MousePointer2,
  RotateCw,
  Copy,
  Trash2,
  User,
} from 'lucide-react'
import { isLoggedIn, getStoredUser } from '@/lib/auth-client'
import { renderPdfPageToDataUrl } from '@/lib/pdfjs-loader'
import { buildFinalPdf, type SecurityOptions } from '@/lib/pdf-editor-export'
import { DEFAULT_FONT_FAMILY, fontOptionCss } from '@/lib/pdf-editor-fonts'
import {
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
  MAX_PDF_BYTES,
  MAX_IMAGE_BYTES,
  defaultWatermark,
  defaultPermissions,
  type EditorPage,
  type EditorElement,
  type TextElement,
  type ImageElement,
  type DrawElement,
  type ShapeElement,
  type NoteElement,
  type RedactElement,
  type FormFieldElement,
  type WatermarkConfig,
  type SecurityPermissions,
  type EditorSnapshot,
  type PageRotation,
} from '@/lib/pdf-editor-types'
import { EditorHistory } from '@/lib/pdf-editor-history'
import { saveDraft, loadDraft, clearDraft, type PdfEditorDraft } from '@/lib/pdf-editor-autosave'
import { detectFormFields, type DetectedField } from '@/lib/pdf-editor-forms'
import { pdfPagesToImageZip, compressPdfByRasterizing } from '@/lib/pdf-editor-convert'
import { ocrPdfPage, type OcrPageResult } from '@/lib/pdf-editor-ocr'
import { OverlayElement } from '@/components/pdf-editor/overlay-element'
import { ExportGateModal } from '@/components/pdf-editor/export-gate-modal'
import { TextPanel } from '@/components/pdf-editor/text-panel'
import { RichTextEditor, type RichTextEditorHandle, type RunStyle } from '@/components/pdf-editor/rich-text-editor'
import { PagesSidebar } from '@/components/pdf-editor/pages-sidebar'
import { AnnotationToolbar, type AnnotationTool } from '@/components/pdf-editor/annotation-toolbar'
import { DrawingLayer } from '@/components/pdf-editor/drawing-layer'
import {
  DrawPreview,
  ShapePreview,
  NotePreview,
  RedactPreview,
  FormFieldPreview,
} from '@/components/pdf-editor/element-preview'
import { DetectedFieldOverlay } from '@/components/pdf-editor/detected-field-overlay'
import { DetectedTextOverlay } from '@/components/pdf-editor/detected-text-overlay'
import { detectPageTextRuns, sampleBackgroundColor, type DetectedTextRun } from '@/lib/pdf-editor-text-layer'
import { FormFieldPanel } from '@/components/pdf-editor/form-field-panel'
import { SecurityPanel } from '@/components/pdf-editor/security-panel'
import { WatermarkPanel } from '@/components/pdf-editor/watermark-panel'
import { SignatureModal } from '@/components/pdf-editor/signature-modal'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function fileToBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.readAsArrayBuffer(file)
  })
}

function bytesToDataUrl(bytes: Uint8Array, mime: string) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return `data:${mime};base64,${btoa(binary)}`
}

/** A page's standard margin — used to bound how wide a freshly-clicked
 * blank-space text block starts out, so typing wraps at a sensible right
 * edge instead of running off the page. 1 inch (72pt) matches the "Normal"
 * margin every mainstream word processor defaults to. */
const PAGE_MARGIN_PT = 72

/** A brand-new, empty text block anchored at (xf, yf) — used for
 * click-to-type-anywhere on blank page space. Starts one line tall and
 * grows automatically as content wraps (see the autoGrow flag and its
 * handling in the RichTextEditor call site); its width is bounded by the
 * page's right margin from the moment it's created, so long lines wrap
 * there instead of extending indefinitely. */
function newBlankTextElement(pageId: string, xf: number, yf: number, page: EditorPage): TextElement {
  const fontSizePt = 12
  const color = '#111111'
  const fontFamily = DEFAULT_FONT_FAMILY
  const marginFraction = PAGE_MARGIN_PT / page.widthPt
  const wf = Math.max(0.08, 1 - marginFraction - xf)
  const hf = Math.min(1 - yf, (fontSizePt * 1.3) / page.heightPt)
  return {
    id: uid(),
    pageId,
    type: 'text',
    xf,
    yf,
    wf,
    hf,
    runs: [],
    fontSizePt,
    color,
    fontFamily,
    bold: false,
    italic: false,
    align: 'left',
    url: '',
    autoGrow: true,
  }
}

export default function PdfEditorPage() {
  const [stage, setStage] = useState<'entry' | 'editor'>('entry')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')

  const sourceDocsRef = useRef<(PDFDocument | null)[]>([])
  const sourceBytesRef = useRef<(Uint8Array | null)[]>([])

  const [pages, setPages] = useState<EditorPage[]>([])
  const [elements, setElements] = useState<EditorElement[]>([])
  const [watermark, setWatermark] = useState<WatermarkConfig>(defaultWatermark())
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)

  const [tool, setTool] = useState<AnnotationTool>('select')
  // Armed by picking a form field kind from Insert > Form field — the
  // NEXT click on the page places a small icon marker there (matching
  // Acrobat's Prepare Form tool), instead of dropping a fixed-position,
  // fully-sized widget the moment you pick it from the menu.
  const [placingFieldKind, setPlacingFieldKind] = useState<FormFieldElement['fieldKind'] | null>(null)
  const [toolColor, setToolColor] = useState('#ef4444')
  const [toolStrokeWidth, setToolStrokeWidth] = useState(3)
  const [zoom, setZoom] = useState(1)

  const [splitMode, setSplitMode] = useState(false)
  const [selectedForSplit, setSelectedForSplit] = useState<string[]>([])

  const [securityEnabled, setSecurityEnabled] = useState(false)
  const [openPassword, setOpenPassword] = useState('')
  const [openPasswordConfirm, setOpenPasswordConfirm] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [ownerPasswordConfirm, setOwnerPasswordConfirm] = useState('')
  const [permissions, setPermissions] = useState<SecurityPermissions>(defaultPermissions())

  const [gateOpen, setGateOpen] = useState(false)
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [draftPrompt, setDraftPrompt] = useState<PdfEditorDraft | null>(null)

  const [detectedFields, setDetectedFields] = useState<DetectedField[]>([])
  const [detectedTextRuns, setDetectedTextRuns] = useState<DetectedTextRun[]>([])
  const textDetectedForPageRef = useRef<Set<string>>(new Set())
  const [ocrPages, setOcrPages] = useState<Record<string, OcrPageResult>>({})
  const [compressOpen, setCompressOpen] = useState(false)
  const [compressQuality, setCompressQuality] = useState(0.7)
  const [showThumbnails, setShowThumbnails] = useState(true)
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  // The global site nav (with its own login/signup + account menu) is
  // hidden on this route so the editor can use the full viewport — this
  // folds a minimal equivalent (logo + account link) into the editor's
  // own chrome instead.
  const [authUser, setAuthUser] = useState<{ email: string; name?: string } | null>(null)
  const [authReady, setAuthReady] = useState(false)
  useEffect(() => {
    const sync = () => {
      setAuthUser(isLoggedIn() ? getStoredUser() : null)
      setAuthReady(true)
    }
    sync()
    window.addEventListener('auth-changed', sync)
    return () => window.removeEventListener('auth-changed', sync)
  }, [])

  // Mobile on-screen-keyboard detection: iOS Safari never resizes the layout
  // viewport when the keyboard opens (only the visual viewport shrinks), and
  // Android Chrome's own behavior varies by version/viewport-meta — so we
  // compare visualViewport.height against window.innerHeight, which covers
  // both, rather than trusting either measurement alone. Gated to mobile
  // widths so this can never fire (or matter) on desktop.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => {
      const isMobile = window.innerWidth < 1024
      const shrunk = vv.height < window.innerHeight * 0.75
      setKeyboardOpen(isMobile && shrunk)
    }
    vv.addEventListener('resize', onResize)
    onResize()
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const mergeInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imagesToPdfInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const richEditorRef = useRef<RichTextEditorHandle>(null)
  const textToolbarRef = useRef<HTMLDivElement>(null)
  const suppressTextBlurRef = useRef(false)

  const historyRef = useRef(new EditorHistory())
  const applyingHistory = useRef(false)

  const activePage = pages.find((p) => p.id === activePageId) || null
  const selectedElement = elements.find((e) => e.id === selectedId) || null

  const openMismatch = openPassword !== '' && openPasswordConfirm !== '' && openPassword !== openPasswordConfirm
  const ownerMismatch =
    ownerPassword !== '' && ownerPasswordConfirm !== '' && ownerPassword !== ownerPasswordConfirm
  const securityReady = !securityEnabled || (!openMismatch && !ownerMismatch)

  function fitPage() {
    const el = viewportRef.current
    if (!el || !activePage) return
    const availW = el.clientWidth - 32
    const availH = el.clientHeight - 32
    const widthForHeight = availH * (activePage.widthPt / activePage.heightPt)
    const targetWidth = Math.max(120, Math.min(availW, widthForHeight))
    setZoom(Math.max(0.5, Math.min(2, +(targetWidth / 600).toFixed(2))))
  }

  function pushHistory(next: Partial<EditorSnapshot>) {
    if (applyingHistory.current) return
    historyRef.current.push({
      pages: next.pages ?? pages,
      elements: next.elements ?? elements,
      watermark: next.watermark ?? watermark,
    })
  }

  function undo() {
    const snap = historyRef.current.undo()
    if (!snap) return
    applyingHistory.current = true
    setPages(snap.pages)
    setElements(snap.elements)
    setWatermark(snap.watermark)
    setSelectedId(null)
    applyingHistory.current = false
  }

  function redo() {
    const snap = historyRef.current.redo()
    if (!snap) return
    applyingHistory.current = true
    setPages(snap.pages)
    setElements(snap.elements)
    setWatermark(snap.watermark)
    setSelectedId(null)
    applyingHistory.current = false
  }

  // --- Back navigation ---------------------------------------------------

  function resetToEntry() {
    sourceDocsRef.current = []
    sourceBytesRef.current = []
    setPages([])
    setElements([])
    setWatermark(defaultWatermark())
    setActivePageId(null)
    setSelectedId(null)
    setEditingTextId(null)
    setEditingNoteId(null)
    setTool('select')
    setSplitMode(false)
    setSelectedForSplit([])
    setDetectedFields([])
    setOcrPages({})
    setCompressOpen(false)
    setError('')
    setSecurityEnabled(false)
    setOpenPassword('')
    setOpenPasswordConfirm('')
    setOwnerPassword('')
    setOwnerPasswordConfirm('')
    setPermissions(defaultPermissions())
    setStage('entry')
  }

  useEffect(() => {
    function onPopState() {
      resetToEntry()
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function enterEditor() {
    window.history.pushState({ pdfEditorStage: 'editor' }, '', window.location.href)
  }

  function goBack() {
    window.history.back()
  }

  // --- Restore-draft prompt on mount -------------------------------------

  useEffect(() => {
    loadDraft().then((draft) => {
      if (draft && draft.snapshot.pages.length > 0) setDraftPrompt(draft)
    })
  }, [])

  function restoreDraft(draft: PdfEditorDraft) {
    sourceDocsRef.current = draft.sourceBytesList.map(() => null)
    sourceBytesRef.current = draft.sourceBytesList
    setPages(draft.snapshot.pages)
    setElements(draft.snapshot.elements)
    setWatermark(draft.snapshot.watermark)
    setActivePageId(draft.snapshot.pages[0]?.id ?? null)
    historyRef.current.reset(draft.snapshot)
    enterEditor()
    setStage('editor')
    setDraftPrompt(null)
    // Rehydrate PDFDocument objects for any 'copy' pages in the background.
    Promise.all(
      draft.sourceBytesList.map((bytes) => (bytes ? PDFDocument.load(bytes, { ignoreEncryption: true }) : null)),
    ).then((docs) => {
      sourceDocsRef.current = docs
    })
  }

  function discardDraft() {
    void clearDraft()
    setDraftPrompt(null)
  }

  // Debounced autosave whenever document content changes.
  useEffect(() => {
    if (stage !== 'editor' || pages.length === 0) return
    const t = setTimeout(() => {
      void saveDraft({
        savedAt: Date.now(),
        snapshot: { pages, elements, watermark },
        sourceBytesList: sourceBytesRef.current,
      })
    }, 1500)
    return () => clearTimeout(t)
  }, [stage, pages, elements, watermark])

  // --- Loading -------------------------------------------------------

  async function loadPdfFile(file: File): Promise<{ doc: PDFDocument; bytes: Uint8Array } | null> {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('That file does not look like a PDF. Please choose a .pdf file.')
      return null
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(`That PDF is too large. The limit is ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB.`)
      return null
    }
    const bytes = await fileToBytes(file)
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    if (doc.isEncrypted) {
      setError('This PDF is password-protected. Remove its password before editing it here.')
      return null
    }
    return { doc, bytes }
  }

  async function handleFileChosen(file: File) {
    setError('')
    setBusy(true)
    setBusyLabel('Opening your PDF…')
    try {
      const loaded = await loadPdfFile(file)
      if (!loaded) return
      sourceDocsRef.current = [loaded.doc]
      sourceBytesRef.current = [loaded.bytes]
      const newPages: EditorPage[] = loaded.doc.getPages().map((p, i) => {
        const { width, height } = p.getSize()
        return {
          id: uid(),
          widthPt: width,
          heightPt: height,
          rotationDeg: 0,
          previewDataUrl: null,
          source: { kind: 'copy', docIndex: 0, originalIndex: i },
        }
      })
      setPages(newPages)
      setElements([])
      setActivePageId(newPages[0]?.id ?? null)
      historyRef.current.reset({ pages: newPages, elements: [], watermark })
      enterEditor()
      setStage('editor')
      detectFormFields(sourceDocsRef.current, newPages)
        .then(setDetectedFields)
        .catch(() => {})
    } catch {
      setError('Could not open that PDF. It may be corrupted or in an unsupported format.')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  async function handleMergeFileChosen(file: File) {
    setError('')
    setBusy(true)
    setBusyLabel('Adding PDF…')
    try {
      const loaded = await loadPdfFile(file)
      if (!loaded) return
      const docIndex = sourceDocsRef.current.length
      sourceDocsRef.current = [...sourceDocsRef.current, loaded.doc]
      sourceBytesRef.current = [...sourceBytesRef.current, loaded.bytes]
      const appended: EditorPage[] = loaded.doc.getPages().map((p, i) => {
        const { width, height } = p.getSize()
        return {
          id: uid(),
          widthPt: width,
          heightPt: height,
          rotationDeg: 0,
          previewDataUrl: null,
          source: { kind: 'copy', docIndex, originalIndex: i },
        }
      })
      const next = [...pages, ...appended]
      setPages(next)
      pushHistory({ pages: next })
      if (!activePageId && appended[0]) setActivePageId(appended[0].id)
      detectFormFields(sourceDocsRef.current, next)
        .then(setDetectedFields)
        .catch(() => {})
    } catch {
      setError('Could not open that PDF to merge. It may be corrupted or in an unsupported format.')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  function handleStartBlank() {
    setError('')
    sourceDocsRef.current = []
    sourceBytesRef.current = []
    const page: EditorPage = {
      id: uid(),
      widthPt: A4_WIDTH_PT,
      heightPt: A4_HEIGHT_PT,
      rotationDeg: 0,
      previewDataUrl: null,
      source: { kind: 'blank' },
    }
    setPages([page])
    setElements([])
    setActivePageId(page.id)
    historyRef.current.reset({ pages: [page], elements: [], watermark })
    enterEditor()
    setStage('editor')
  }

  // Lazily rasterize the background preview for whichever page is active.
  useEffect(() => {
    if (!activePage || activePage.source.kind !== 'copy') return
    if (activePage.previewDataUrl) return
    const bytes = sourceBytesRef.current[activePage.source.docIndex]
    if (!bytes) return
    let cancelled = false
    renderPdfPageToDataUrl(bytes, activePage.source.originalIndex + 1)
      .then((dataUrl) => {
        if (cancelled) return
        setPages((prev) => prev.map((p) => (p.id === activePage.id ? { ...p, previewDataUrl: dataUrl } : p)))
      })
      .catch(() => {
        // Preview is best-effort; editing still works without it.
      })
    return () => {
      cancelled = true
    }
  }, [activePage])

  // Lazily detect existing text runs on whichever page is active — same
  // one-page-at-a-time, cache-once approach as the preview render above.
  // A scanned/image-only page's PDF has no extractable text layer at all
  // (pdf.js's getTextContent() just returns no items for it); that's
  // expected and not an error — it simply leaves nothing click-to-edit,
  // while blank-space insertion (unrelated to this detection) still works.
  useEffect(() => {
    if (!activePage || activePage.source.kind !== 'copy') return
    if (textDetectedForPageRef.current.has(activePage.id)) return
    const bytes = sourceBytesRef.current[activePage.source.docIndex]
    if (!bytes) return
    textDetectedForPageRef.current.add(activePage.id)
    let cancelled = false
    detectPageTextRuns(bytes, activePage.source.originalIndex + 1, activePage.id, activePage.widthPt, activePage.heightPt)
      .then((runs) => {
        if (cancelled) return
        setDetectedTextRuns((prev) => [...prev, ...runs])
      })
      .catch(() => {
        // No usable text layer (scanned/image-only page, or a pdf.js
        // failure) — leave it undetected rather than fail the whole editor.
      })
    return () => {
      cancelled = true
    }
  }, [activePage])

  // --- Elements ----------------------------------------------------------

  // Shared by addText and startEditingDetectedRun: mounts a text element
  // straight into edit mode, inside the same gesture that created it.
  // flushSync forces the editor to mount synchronously — a focus call one
  // tick later (e.g. via the autoFocus prop alone) is too late for iOS
  // Safari to reliably treat as user-initiated, so the on-screen keyboard
  // never opens. Base-ui's menu internally refocuses the clicked item
  // itself as part of its own close animation (its item stays focused for
  // the ~100ms close transition), which would blur the editor we're about
  // to focus and (via its onBlur) incorrectly end the edit session.
  // Suppress that blur, then keep reclaiming focus for a bounded window
  // until the menu's own handling has fully settled.
  function enterEditModeFor(el: TextElement, next: EditorElement[]) {
    suppressTextBlurRef.current = true
    flushSync(() => {
      setElements(next)
      setSelectedId(el.id)
      setEditingTextId(el.id)
    })
    pushHistory({ elements: next })
    richEditorRef.current?.focus()
    let attempts = 0
    const reclaim = () => {
      attempts += 1
      if (!richEditorRef.current) return // user navigated away in the meantime
      richEditorRef.current.focus()
      if (attempts < 15) {
        setTimeout(reclaim, 20)
      } else {
        suppressTextBlurRef.current = false
      }
    }
    setTimeout(reclaim, 20)
  }

  // Click-to-type on blank page space (Part G) — the direct replacement
  // for the old "Insert > Text box" step. Only ever reached when nothing
  // else handled the pointerdown first: every existing element and
  // detected-text region calls stopPropagation() in its own handler, so by
  // the time this fires, the click is genuinely on empty page background.
  function startBlankTextAt(e: React.PointerEvent) {
    if (tool !== 'select' || !activePageId || !activePage) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return
    const xf = clamp01((e.clientX - rect.left) / rect.width)
    const yf = clamp01((e.clientY - rect.top) / rect.height)
    const el = newBlankTextElement(activePageId, xf, yf, activePage)
    enterEditModeFor(el, [...elements, el])
  }

  // Click-to-edit on an uploaded PDF's own existing text (Phase 2): turns
  // one detected run into a live, editable TextElement seeded with its
  // content/position/font, then drops straight into edit mode — no
  // separate "insert a box" step. The run disappears from the detection
  // overlay immediately (it's now represented by the live element instead
  // of a click target), and a background-sampled cover color is captured
  // so export can paint over the original glyphs still baked into the
  // copied page underneath — see coverColor on TextElement.
  async function startEditingDetectedRun(run: DetectedTextRun) {
    if (tool !== 'select') return
    if (editingTextId) endTextEditing()
    setDetectedTextRuns((prev) => prev.filter((r) => r.id !== run.id))

    const coverColor = activePage?.previewDataUrl
      ? await sampleBackgroundColor(activePage.previewDataUrl, run.xf, run.yf, run.wf, run.hf)
      : '#ffffff'

    const style = { fontSizePt: run.fontSizePt, color: run.color, fontFamily: run.fontFamily, bold: run.bold, italic: run.italic }
    const el: TextElement = {
      id: uid(),
      pageId: run.pageId,
      type: 'text',
      xf: run.xf,
      yf: run.yf,
      wf: run.wf,
      hf: run.hf,
      runs: [{ text: run.text, ...style }],
      ...style,
      align: 'left',
      url: '',
      coverColor,
    }
    enterEditModeFor(el, [...elements, el])
  }

  async function addImage(file: File) {
    setError('')
    const format = file.type.includes('png') ? 'png' : file.type.includes('jpeg') || file.type.includes('jpg') ? 'jpg' : null
    if (!format) {
      setError('Images must be PNG or JPEG.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`That image is too large. The limit is ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`)
      return
    }
    if (!activePageId || !activePage) return
    try {
      const bytes = await fileToBytes(file)
      const dataUrl = bytesToDataUrl(bytes, format === 'png' ? 'image/png' : 'image/jpeg')
      const naturalAspect = await new Promise<number>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 1)
        img.onerror = () => reject(new Error('Could not read that image'))
        img.src = dataUrl
      })
      const wf = 0.35
      const hf = clamp01((wf * activePage.widthPt) / naturalAspect / activePage.heightPt)
      const el: ImageElement = {
        id: uid(),
        pageId: activePageId,
        type: 'image',
        xf: 0.1,
        yf: 0.1,
        wf,
        hf,
        dataUrl,
        bytes,
        format,
        naturalAspect,
      }
      const next = [...elements, el]
      setElements(next)
      pushHistory({ elements: next })
      setSelectedId(el.id)
    } catch {
      setError('Could not read that image file.')
    }
  }

  function insertSignature(result: { dataUrl: string; bytes: Uint8Array; naturalAspect: number }) {
    if (!activePageId || !activePage) return
    const wf = 0.3
    const hf = clamp01((wf * activePage.widthPt) / result.naturalAspect / activePage.heightPt)
    const el: ImageElement = {
      id: uid(),
      pageId: activePageId,
      type: 'image',
      xf: 0.15,
      yf: 0.7,
      wf,
      hf,
      dataUrl: result.dataUrl,
      bytes: result.bytes,
      format: 'png',
      naturalAspect: result.naturalAspect,
    }
    const next = [...elements, el]
    setElements(next)
    pushHistory({ elements: next })
    setSelectedId(el.id)
    setSignatureOpen(false)
  }

  function createShape(kind: ShapeElement['shapeKind'] | 'redact', xf: number, yf: number, wf: number, hf: number) {
    if (!activePageId) return
    if (kind === 'redact') {
      const el: RedactElement = { id: uid(), pageId: activePageId, type: 'redact', xf, yf, wf, hf }
      const next = [...elements, el]
      setElements(next)
      pushHistory({ elements: next })
      setSelectedId(el.id)
      setTool('select')
      return
    }
    const el: ShapeElement = {
      id: uid(),
      pageId: activePageId,
      type: 'shape',
      xf,
      yf,
      wf,
      hf,
      shapeKind: kind,
      color: toolColor,
      strokeWidthPt: toolStrokeWidth,
      fillOpacity: kind === 'highlight' ? 0.4 : 0,
    }
    const next = [...elements, el]
    setElements(next)
    pushHistory({ elements: next })
    // Land the user in an immediately-adjustable state (resize/move handles
    // visible) instead of leaving them stuck on the draw tool with no way
    // to tweak what they just drew without manually switching tools first.
    setSelectedId(el.id)
    setTool('select')
  }

  // Small, icon-sized marker at (xf, yf) — matches Acrobat's Prepare Form
  // tool: placing a field drops a compact marker, not a rendered preview
  // of its filled-in content. Actual configuration (options, name, default
  // state) lives in FormFieldPanel once the marker is selected, not as
  // visible placeholder text sitting on the page.
  function createFormField(kind: FormFieldElement['fieldKind'], xf: number, yf: number) {
    if (!activePageId) return
    const wf = kind === 'checkbox' ? 0.025 : kind === 'text' ? 0.14 : 0.05
    const hf = 0.022
    const el: FormFieldElement = {
      id: uid(),
      pageId: activePageId,
      type: 'formField',
      xf: clamp01(Math.min(xf, 1 - wf)),
      yf: clamp01(Math.min(yf, 1 - hf)),
      wf,
      hf,
      fieldKind: kind,
      name: '',
      value: '',
      checked: false,
      options: kind === 'dropdown' ? ['Option 1', 'Option 2'] : [],
      fontSizePt: 12,
    }
    const next = [...elements, el]
    setElements(next)
    pushHistory({ elements: next })
    setSelectedId(el.id)
  }

  function createDraw(points: { x: number; y: number }[], xf: number, yf: number, wf: number, hf: number) {
    if (!activePageId) return
    const el: DrawElement = {
      id: uid(),
      pageId: activePageId,
      type: 'draw',
      xf,
      yf,
      wf,
      hf,
      points,
      color: toolColor,
      strokeWidthPt: toolStrokeWidth,
    }
    const next = [...elements, el]
    setElements(next)
    pushHistory({ elements: next })
  }

  function createNote(xf: number, yf: number) {
    if (!activePageId) return
    const el: NoteElement = {
      id: uid(),
      pageId: activePageId,
      type: 'note',
      xf,
      yf,
      wf: 0.045,
      hf: 0.03,
      text: '',
      color: toolColor,
    }
    const next = [...elements, el]
    setElements(next)
    pushHistory({ elements: next })
    setSelectedId(el.id)
    setEditingNoteId(el.id)
    setTool('select')
  }

  function updateElement(id: string, patch: Partial<EditorElement>) {
    setElements((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...patch } as EditorElement) : e)))
  }

  // Applies a font/size/color/bold/italic change to EXACTLY the active
  // selection (or the caret's type-forward point) while a text block is
  // being edited — never the whole block, never the whole document. Only
  // falls back to "the whole block" when the block is merely selected but
  // not actively being edited (no live cursor to target), matching how a
  // toolbar acting on an unfocused text box behaves in most editors.
  function applyTextStyle(patch: Partial<RunStyle>) {
    if (!selectedElement || selectedElement.type !== 'text') return
    const el = selectedElement
    if (editingTextId === el.id && richEditorRef.current) {
      const runs = richEditorRef.current.applyStyle(patch)
      const nextElements = elements.map((e) => (e.id === el.id ? { ...e, runs } : e))
      setElements(nextElements)
      pushHistory({ elements: nextElements })
      return
    }
    const runs = el.runs.map((r) => ({ ...r, ...patch }))
    const nextElements = elements.map((e) => (e.id === el.id ? { ...e, ...patch, runs } : e))
    setElements(nextElements)
    pushHistory({ elements: nextElements })
  }

  function activeTextStyle(el: TextElement): RunStyle {
    if (editingTextId === el.id && richEditorRef.current) return richEditorRef.current.getActiveStyle()
    const first = el.runs[0]
    return first
      ? { fontFamily: first.fontFamily, fontSizePt: first.fontSizePt, color: first.color, bold: first.bold, italic: first.italic }
      : { fontFamily: el.fontFamily, fontSizePt: el.fontSizePt, color: el.color, bold: el.bold, italic: el.italic }
  }

  function updateDetectedField(id: string, patch: Partial<DetectedField>) {
    setDetectedFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function commitElementChange() {
    pushHistory({ elements })
  }

  // Ends the active text-editing session deterministically (as opposed to
  // relying on textarea blur timing, which fires for in-toolbar focus moves
  // too). Called from explicit "leave" actions: clicking the canvas
  // background, selecting a different element, Escape, or switching tools.
  function endTextEditing() {
    if (!editingTextId) return
    const id = editingTextId
    const el = elements.find((e) => e.id === id)
    // A blank-space click creates the element immediately (so the cursor
    // shows up instantly, matching Word/Docs), but if the user then
    // clicks away without ever typing anything, that leaves an invisible,
    // truly empty text box sitting on the page — clean those up instead
    // of committing them.
    if (el?.type === 'text' && el.autoGrow && el.runs.every((r) => !r.text.trim())) {
      const next = elements.filter((e) => e.id !== id)
      setElements(next)
      pushHistory({ elements: next })
      setEditingTextId(null)
      if (selectedId === id) setSelectedId(null)
      return
    }
    commitElementChange()
    setEditingTextId(null)
  }

  // Returns focus to the on-canvas text editor and restores its selection,
  // so picking a font/format option doesn't force the user to re-tap the
  // text box and lose their place — the same flow Google Docs' mobile
  // toolbar uses.
  function refocusTextEditor() {
    requestAnimationFrame(() => {
      richEditorRef.current?.restoreSelection()
    })
  }

  function deleteElement(id: string) {
    const next = elements.filter((e) => e.id !== id)
    setElements(next)
    pushHistory({ elements: next })
    if (selectedId === id) setSelectedId(null)
    if (editingTextId === id) setEditingTextId(null)
    if (editingNoteId === id) setEditingNoteId(null)
  }

  // --- Pages ---------------------------------------------------------

  function addPage() {
    const page: EditorPage = {
      id: uid(),
      widthPt: activePage?.widthPt ?? A4_WIDTH_PT,
      heightPt: activePage?.heightPt ?? A4_HEIGHT_PT,
      rotationDeg: 0,
      previewDataUrl: null,
      source: { kind: 'blank' },
    }
    const idx = pages.findIndex((p) => p.id === activePageId)
    const next = idx === -1 ? [...pages, page] : [...pages.slice(0, idx + 1), page, ...pages.slice(idx + 1)]
    setPages(next)
    pushHistory({ pages: next })
    setActivePageId(page.id)
    setSelectedId(null)
  }

  function removePage(pageId: string) {
    if (pages.length <= 1) return
    const idx = pages.findIndex((p) => p.id === pageId)
    const nextPages = pages.filter((p) => p.id !== pageId)
    const nextElements = elements.filter((e) => e.pageId !== pageId)
    setPages(nextPages)
    setElements(nextElements)
    pushHistory({ pages: nextPages, elements: nextElements })
    if (activePageId === pageId) {
      const fallback = nextPages[Math.max(0, idx - 1)] || nextPages[0]
      setActivePageId(fallback?.id ?? null)
    }
    setSelectedForSplit((prev) => prev.filter((id) => id !== pageId))
  }

  function duplicatePage(pageId: string) {
    const idx = pages.findIndex((p) => p.id === pageId)
    if (idx === -1) return
    const original = pages[idx]
    const newId = uid()
    const copy: EditorPage = { ...original, id: newId }
    const nextPages = [...pages.slice(0, idx + 1), copy, ...pages.slice(idx + 1)]
    const clonedElements: EditorElement[] = elements
      .filter((e) => e.pageId === pageId)
      .map((e) => ({ ...e, id: uid(), pageId: newId }) as EditorElement)
    const nextElements = [...elements, ...clonedElements]
    setPages(nextPages)
    setElements(nextElements)
    pushHistory({ pages: nextPages, elements: nextElements })
    setActivePageId(newId)
  }

  function rotatePage(pageId: string) {
    const next = pages.map((p) =>
      p.id === pageId ? { ...p, rotationDeg: (((p.rotationDeg + 90) % 360) as PageRotation) } : p,
    )
    setPages(next)
    pushHistory({ pages: next })
  }

  function reorderPages(fromId: string, toId: string) {
    const fromIdx = pages.findIndex((p) => p.id === fromId)
    const toIdx = pages.findIndex((p) => p.id === toId)
    if (fromIdx === -1 || toIdx === -1) return
    const next = [...pages]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    setPages(next)
    pushHistory({ pages: next })
  }

  function toggleSplitSelect(pageId: string) {
    setSelectedForSplit((prev) => (prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]))
  }

  // --- Export --------------------------------------------------------

  function withGate(run: () => void) {
    if (!isLoggedIn()) {
      setGateOpen(true)
      return
    }
    run()
  }

  function securityOptions(): SecurityOptions {
    return {
      enabled: securityEnabled,
      openPassword,
      ownerPassword,
      permissions,
    }
  }

  const buildExportBytes = useCallback(
    async (exportPages: EditorPage[], exportElements: EditorElement[]) => {
      const wm =
        watermark.enabled && watermark.scope === 'selected' && !watermark.selectedPageIds.length
          ? { ...watermark, selectedPageIds: activePageId ? [activePageId] : [] }
          : watermark
      return buildFinalPdf({
        sourceDocs: sourceDocsRef.current,
        sourceBytesList: sourceBytesRef.current,
        detectedFields,
        ocrPages,
        pages: exportPages,
        elements: exportElements,
        watermark: wm,
        security: securityOptions(),
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [watermark, activePageId, securityEnabled, openPassword, ownerPassword, permissions, detectedFields, ocrPages],
  )

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  const runExport = useCallback(
    async (exportPages: EditorPage[], exportElements: EditorElement[], filename: string) => {
      setError('')
      setBusy(true)
      setBusyLabel('Building your PDF…')
      try {
        const bytes = await buildExportBytes(exportPages, exportElements)
        downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), filename)
        void clearDraft()
      } catch (e) {
        setError(e instanceof Error ? `Could not build the PDF: ${e.message}` : 'Could not build the PDF.')
      } finally {
        setBusy(false)
        setBusyLabel('')
      }
    },
    [buildExportBytes],
  )

  function handleDownloadClick() {
    withGate(() => void runExport(pages, elements, 'plugyard-edited.pdf'))
  }

  function handleExtractClick() {
    const chosen = pages.filter((p) => selectedForSplit.includes(p.id))
    if (chosen.length === 0) return
    const chosenIds = new Set(chosen.map((p) => p.id))
    const chosenElements = elements.filter((e) => chosenIds.has(e.pageId))
    withGate(() => void runExport(chosen, chosenElements, 'plugyard-extracted.pdf'))
  }

  function handleImageExportClick() {
    const chosen = pages.filter((p) => selectedForSplit.includes(p.id))
    if (chosen.length === 0) return
    withGate(() =>
      void (async () => {
        setError('')
        setBusy(true)
        setBusyLabel('Building images…')
        try {
          const chosenIds = new Set(chosen.map((p) => p.id))
          const chosenElements = elements.filter((e) => chosenIds.has(e.pageId))
          const bytes = await buildExportBytes(chosen, chosenElements)
          const { blob, filename } = await pdfPagesToImageZip(
            bytes,
            chosen.map((_, i) => i + 1),
            'png',
            2.5,
          )
          downloadBlob(blob, filename)
          void clearDraft()
        } catch (e) {
          setError(e instanceof Error ? `Could not export images: ${e.message}` : 'Could not export images.')
        } finally {
          setBusy(false)
          setBusyLabel('')
        }
      })(),
    )
  }

  function handleImagesToPdfChosen(files: File[]) {
    void (async () => {
      setError('')
      setBusy(true)
      setBusyLabel('Adding images…')
      try {
        let newPages: EditorPage[] = []
        let newElements: EditorElement[] = []
        let lastPageId: string | null = null
        for (const file of Array.from(files)) {
          const format = file.type.includes('png') ? 'png' : file.type.includes('jpeg') || file.type.includes('jpg') ? 'jpg' : null
          if (!format) continue
          const bytes = await fileToBytes(file)
          const dataUrl = bytesToDataUrl(bytes, format === 'png' ? 'image/png' : 'image/jpeg')
          const naturalAspect = await new Promise<number>((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 1)
            img.onerror = () => reject(new Error('Could not read that image'))
            img.src = dataUrl
          })
          const widthPt = A4_WIDTH_PT
          const heightPt = widthPt / naturalAspect
          const page: EditorPage = {
            id: uid(),
            widthPt,
            heightPt,
            rotationDeg: 0,
            previewDataUrl: null,
            source: { kind: 'blank' },
          }
          const el: ImageElement = {
            id: uid(),
            pageId: page.id,
            type: 'image',
            xf: 0,
            yf: 0,
            wf: 1,
            hf: 1,
            dataUrl,
            bytes,
            format,
            naturalAspect,
          }
          newPages = [...newPages, page]
          newElements = [...newElements, el]
          lastPageId = page.id
        }
        if (newPages.length === 0) {
          setError('Could not read any of those images. Please choose PNG or JPEG files.')
          return
        }
        const nextPages = [...pages, ...newPages]
        const nextElements = [...elements, ...newElements]
        setPages(nextPages)
        setElements(nextElements)
        pushHistory({ pages: nextPages, elements: nextElements })
        if (!activePageId && lastPageId) setActivePageId(lastPageId)
      } catch {
        setError('Could not add those images.')
      } finally {
        setBusy(false)
        setBusyLabel('')
      }
    })()
  }

  function handleCompressClick() {
    withGate(() =>
      void (async () => {
        setError('')
        setBusy(true)
        setBusyLabel('Compressing…')
        try {
          const bytes = await buildExportBytes(pages, elements)
          const compressed = await compressPdfByRasterizing(bytes, 1.5, compressQuality)
          downloadBlob(new Blob([compressed as BlobPart], { type: 'application/pdf' }), 'plugyard-compressed.pdf')
        } catch (e) {
          setError(e instanceof Error ? `Could not compress the PDF: ${e.message}` : 'Could not compress the PDF.')
        } finally {
          setBusy(false)
          setBusyLabel('')
        }
      })(),
    )
  }

  async function handleOcrClick() {
    const copyPages = pages.filter((p) => p.source.kind === 'copy')
    if (copyPages.length === 0) return
    setError('')
    setBusy(true)
    try {
      const results: Record<string, OcrPageResult> = { ...ocrPages }
      for (let i = 0; i < copyPages.length; i++) {
        const page = copyPages[i]
        if (page.source.kind !== 'copy') continue
        setBusyLabel(`Reading page ${i + 1} of ${copyPages.length}…`)
        const bytes = sourceBytesRef.current[page.source.docIndex]
        if (!bytes) continue
        results[page.id] = await ocrPdfPage(bytes, page.source.originalIndex + 1)
      }
      setOcrPages(results)
    } catch (e) {
      setError(e instanceof Error ? `OCR failed: ${e.message}` : 'OCR failed.')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  // --- Keyboard shortcuts --------------------------------------------

  useEffect(() => {
    if (stage !== 'editor') return
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey
      if (!meta) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleDownloadClick()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, pages, elements])

  // Escape backs out of "placing a form field" mode without dropping one.
  useEffect(() => {
    if (!placingFieldKind) return
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setPlacingFieldKind(null)
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [placingFieldKind])

  // --- Render --------------------------------------------------------

  if (stage === 'entry') {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" aria-label="PlugYard home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="h-7 w-7 rounded-lg object-contain" />
            <span className="text-sm font-semibold">PlugYard</span>
          </Link>
          {authReady && (
            authUser ? (
              <Link href="/dashboard" className="text-sm font-medium text-foreground/70 hover:text-foreground">
                {authUser.name || authUser.email}
              </Link>
            ) : (
              <Link href="/login?next=/tools/pdf-editor" className="text-sm font-medium text-foreground/70 hover:text-foreground">
                Log in
              </Link>
            )
          )}
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold sm:text-3xl">PDF Editor</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-foreground/60">
            Edit text, annotate, sign, watermark, merge, split, fill forms,
            redact, convert and OCR PDFs — entirely in your browser. Nothing
            is uploaded anywhere until you
            choose to download it.
          </p>
        </div>

        {error && (
          <p className="mx-auto mt-6 max-w-md rounded-xl bg-red-500/10 px-4 py-3 text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {draftPrompt && (
          <div className="mx-auto mt-6 max-w-md rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm">
            <p className="text-foreground/80">
              You have an unsaved draft from {new Date(draftPrompt.savedAt).toLocaleString()}.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => restoreDraft(draftPrompt)}
                className="rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background"
              >
                Restore draft
              </button>
              <button
                type="button"
                onClick={discardDraft}
                className="rounded-full border border-foreground/15 px-3 py-1.5 text-xs font-semibold"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        <div className="mx-auto mt-8 grid max-w-xl gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-8 text-center transition-colors hover:border-foreground/20 hover:bg-foreground/[0.05]"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400">
              <FileUp className="h-6 w-6" />
            </span>
            <span className="font-semibold">Upload a PDF</span>
            <span className="text-xs text-foreground/55">Edit an existing PDF from your device</span>
          </button>

          <button
            type="button"
            onClick={handleStartBlank}
            className="flex flex-col items-center gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-8 text-center transition-colors hover:border-foreground/20 hover:bg-foreground/[0.05]"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <FilePlus2 className="h-6 w-6" />
            </span>
            <span className="font-semibold">Start from blank</span>
            <span className="text-xs text-foreground/55">Build a new PDF from a blank page</span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void handleFileChosen(f)
          }}
        />

        {busy && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30">
            <div className="flex items-center gap-3 rounded-2xl bg-background px-5 py-4 shadow-2xl">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm font-medium">{busyLabel || 'Working…'}</span>
            </div>
          </div>
        )}
      </main>
    )
  }

  const zoomWidth = Math.round(600 * zoom)

  return (
    <TooltipProvider delay={300}>
    <main className="flex h-dvh flex-col overflow-hidden">
      {/* Top toolbar — pinned, never scrolls with the page. Folds in a
         minimal logo/home link since the global site nav is hidden here. */}
      <div className="relative z-20 flex shrink-0 flex-wrap items-center gap-1.5 border-b border-foreground/10 bg-background px-3 py-2">
        <Link href="/" className="flex h-8 w-8 shrink-0 items-center justify-center" aria-label="PlugYard home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-6 w-6 rounded-md object-contain" />
        </Link>

        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-foreground/15 hover:bg-foreground/5"
          >
            <ArrowLeft className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Back</TooltipContent>
        </Tooltip>

        <span
          className="hidden shrink-0 text-sm font-semibold sm:inline"
          title="Editing stays in your browser — nothing is uploaded until you download."
        >
          PDF Editor
        </span>

        <div className="mx-1 h-6 w-px shrink-0 bg-foreground/10" />

        {/* Insert */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-foreground/15 px-2.5 text-sm font-medium hover:bg-foreground/5 data-[popup-open]:bg-foreground/10">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Insert</span>
          </DropdownMenuTrigger>
          {/* finalFocus=false: the menu's default "return focus to the
             trigger on close" fights a newly-inserted element's own
             imperative focus (see enterEditModeFor) — Insert picks always
             hand focus to something more useful than its own trigger
             button. Text itself is no longer inserted from here — click
             directly on the page instead (see startBlankTextAt). */}
          <DropdownMenuContent finalFocus={false}>
            <DropdownMenuItem onClick={() => imageInputRef.current?.click()} disabled={!activePageId}>
              <ImagePlus className="h-4 w-4" /> Image
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSignatureOpen(true)} disabled={!activePageId}>
              <PenTool className="h-4 w-4" /> Signature
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FormInput className="h-4 w-4" /> Form field
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => setPlacingFieldKind('text')} disabled={!activePageId}>
                    Text field
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPlacingFieldKind('checkbox')} disabled={!activePageId}>
                    Checkbox
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPlacingFieldKind('dropdown')} disabled={!activePageId}>
                    Dropdown
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Pages */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-foreground/15 px-2.5 text-sm font-medium hover:bg-foreground/5 data-[popup-open]:bg-foreground/10">
            <Files className="h-4 w-4" />
            <span className="hidden sm:inline">Pages</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={addPage}>
              <FilePlus2 className="h-4 w-4" /> Add blank page
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => imagesToPdfInputRef.current?.click()}>
              <Images className="h-4 w-4" /> Images → PDF pages
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => mergeInputRef.current?.click()}>
              <FilePlus className="h-4 w-4" /> Merge another PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => activePageId && rotatePage(activePageId)} disabled={!activePageId}>
              <RotateCw className="h-4 w-4" /> Rotate current page
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => activePageId && duplicatePage(activePageId)} disabled={!activePageId}>
              <Copy className="h-4 w-4" /> Duplicate current page
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => activePageId && removePage(activePageId)}
              disabled={!activePageId || pages.length <= 1}
              variant="destructive"
            >
              <Trash2 className="h-4 w-4" /> Delete current page
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setSplitMode((v) => !v)
                setSelectedForSplit([])
              }}
            >
              <Scissors className="h-4 w-4" /> {splitMode ? 'Cancel extract' : 'Extract / export pages…'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleOcrClick} disabled={!pages.some((p) => p.source.kind === 'copy') || busy}>
              <ScanText className="h-4 w-4" /> OCR this document
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCompressOpen((v) => !v)}>
              <Minimize2 className="h-4 w-4" /> Compress…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Security (password, permissions, watermark) */}
        <Popover>
          <PopoverTrigger className="group/security-trigger flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-foreground/15 px-2.5 text-sm font-medium hover:bg-foreground/5 data-[popup-open]:bg-foreground/10">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
            <ChevronDown className="ml-auto size-3.5 shrink-0 transition-transform duration-150 group-data-[popup-open]/security-trigger:rotate-180" />
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-[75vh] w-80 overflow-y-auto">
            <div className="flex flex-col gap-3">
              <SecurityPanel
                enabled={securityEnabled}
                onEnabledChange={setSecurityEnabled}
                openPassword={openPassword}
                onOpenPasswordChange={setOpenPassword}
                openPasswordConfirm={openPasswordConfirm}
                onOpenPasswordConfirmChange={setOpenPasswordConfirm}
                ownerPassword={ownerPassword}
                onOwnerPasswordChange={setOwnerPassword}
                ownerPasswordConfirm={ownerPasswordConfirm}
                onOwnerPasswordConfirmChange={setOwnerPasswordConfirm}
                permissions={permissions}
                onPermissionsChange={(patch) => setPermissions((prev) => ({ ...prev, ...patch }))}
              />
              <WatermarkPanel
                watermark={watermark}
                pageCount={pages.length}
                onChange={(patch) => {
                  const next = { ...watermark, ...patch }
                  setWatermark(next)
                  pushHistory({ watermark: next })
                }}
                onPickImage={async (file) => {
                  try {
                    const bytes = await fileToBytes(file)
                    const format: 'png' | 'jpg' = file.type.includes('png') ? 'png' : 'jpg'
                    const dataUrl = bytesToDataUrl(bytes, format === 'png' ? 'image/png' : 'image/jpeg')
                    const next = { ...watermark, imageBytes: bytes, imageDataUrl: dataUrl, imageFormat: format }
                    setWatermark(next)
                    pushHistory({ watermark: next })
                  } catch {
                    setError('Could not read that watermark image.')
                  }
                }}
              />
            </div>
          </PopoverContent>
        </Popover>

        <div className="mx-1 h-6 w-px shrink-0 bg-foreground/10" />

        {/* Edit: undo, redo, select tool */}
        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={undo}
            disabled={!historyRef.current.canUndo()}
            aria-label="Undo"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-foreground/15 hover:bg-foreground/5 disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={redo}
            disabled={!historyRef.current.canRedo()}
            aria-label="Redo"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-foreground/15 hover:bg-foreground/5 disabled:opacity-30"
          >
            <Redo2 className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={() => setTool('select')}
            aria-label="Select tool"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
              tool === 'select' ? 'border-foreground bg-foreground/10' : 'border-foreground/15 hover:bg-foreground/5'
            }`}
          >
            <MousePointer2 className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Select</TooltipContent>
        </Tooltip>

        <div className="mx-1 hidden h-6 w-px shrink-0 bg-foreground/10 sm:block" />

        {/* View: zoom, fit, thumbnails toggle */}
        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          <Tooltip>
            <TooltipTrigger
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
              aria-label="Zoom out"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-foreground/15 hover:bg-foreground/5"
            >
              <ZoomOut className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>Zoom out</TooltipContent>
          </Tooltip>
          <span className="w-10 text-center text-xs text-foreground/60">{Math.round(zoom * 100)}%</span>
          <Tooltip>
            <TooltipTrigger
              type="button"
              onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
              aria-label="Zoom in"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-foreground/15 hover:bg-foreground/5"
            >
              <ZoomIn className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>Zoom in</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              type="button"
              onClick={() => setZoom(1)}
              aria-label="Fit width"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-foreground/15 hover:bg-foreground/5"
            >
              <Maximize2 className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>Fit width</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              type="button"
              onClick={fitPage}
              aria-label="Fit page"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-foreground/15 hover:bg-foreground/5"
            >
              <Fullscreen className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>Fit page</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              type="button"
              onClick={() => setShowThumbnails((v) => !v)}
              aria-label="Toggle page thumbnails"
              className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                showThumbnails ? 'border-foreground bg-foreground/10' : 'border-foreground/15 hover:bg-foreground/5'
              }`}
            >
              <PanelRight className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>Page thumbnails</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={handleDownloadClick}
            disabled={busy || !securityReady}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3 text-sm font-semibold text-background disabled:opacity-50"
          >
            {securityEnabled ? <Lock className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">Download</span>
          </TooltipTrigger>
          <TooltipContent>Download (Ctrl+S)</TooltipContent>
        </Tooltip>

        {authReady && (
          <Tooltip>
            <TooltipTrigger
              type="button"
              onClick={() =>
                window.location.assign(authUser ? '/dashboard' : '/login?next=/tools/pdf-editor')
              }
              aria-label={authUser ? 'Account' : 'Log in'}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-foreground/15 hover:bg-foreground/5"
            >
              <User className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>{authUser ? authUser.name || authUser.email : 'Log in'}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {error && (
        <p className="mx-3 mt-2 shrink-0 rounded-xl bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Annotate tool strip — always visible, the primary way to pick a drawing tool */}
      <div className="shrink-0 border-b border-foreground/10 px-3 py-2">
        <AnnotationToolbar
          tool={tool}
          onToolChange={(t) => {
            if (t !== 'select') endTextEditing()
            setTool(t)
          }}
          color={toolColor}
          onColorChange={setToolColor}
          strokeWidth={toolStrokeWidth}
          onStrokeWidthChange={setToolStrokeWidth}
        />
      </div>

      {/* Contextual bar: selection properties / extract mode / compress — whichever applies */}
      {(selectedElement?.type === 'text' || selectedElement?.type === 'formField' || splitMode || compressOpen) && (
        <div ref={textToolbarRef} className="shrink-0 border-b border-foreground/10 px-3 py-2">
          {selectedElement?.type === 'text' && (
            <TextPanel
              element={selectedElement}
              activeStyle={activeTextStyle(selectedElement)}
              onStyleChange={applyTextStyle}
              onChange={(patch) => {
                updateElement(selectedElement.id, patch)
                pushHistory({ elements: elements.map((e) => (e.id === selectedElement.id ? { ...e, ...patch } as EditorElement : e)) })
              }}
              onRefocusEditor={refocusTextEditor}
            />
          )}
          {selectedElement?.type === 'formField' && (
            <FormFieldPanel
              element={selectedElement}
              onChange={(patch) => {
                updateElement(selectedElement.id, patch)
                pushHistory({ elements: elements.map((e) => (e.id === selectedElement.id ? { ...e, ...patch } as EditorElement : e)) })
              }}
            />
          )}
          {splitMode && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-foreground/55">Select pages in the sidebar, then export:</p>
              <button
                type="button"
                onClick={handleExtractClick}
                disabled={selectedForSplit.length === 0 || busy}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-50"
              >
                Export {selectedForSplit.length || ''} page{selectedForSplit.length === 1 ? '' : 's'} as PDF
              </button>
              <button
                type="button"
                onClick={handleImageExportClick}
                disabled={selectedForSplit.length === 0 || busy}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-foreground/15 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                <FileImage className="h-3.5 w-3.5" />
                As image{selectedForSplit.length === 1 ? '' : 's'} (zip)
              </button>
            </div>
          )}
          {compressOpen && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-foreground/55">
                Re-encodes every page as a compressed image — text stops being selectable/searchable.
              </p>
              <label className="flex items-center gap-2 text-xs text-foreground/55">
                Quality ({Math.round(compressQuality * 100)}%)
                <input
                  type="range"
                  min={0.3}
                  max={0.95}
                  step={0.05}
                  value={compressQuality}
                  onChange={(e) => setCompressQuality(Number(e.target.value))}
                  className="w-28"
                />
              </label>
              <button
                type="button"
                onClick={handleCompressClick}
                disabled={busy}
                className="rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-50"
              >
                Compress & download
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main content: canvas (scrolls internally) + page thumbnails */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div ref={viewportRef} className="min-h-0 min-w-0 flex-1 overflow-auto bg-foreground/[0.03] p-4 sm:p-8">
          <div
            className="mx-auto rounded-lg border border-foreground/10 bg-white shadow-sm"
            style={{
              width: `min(100%, ${zoomWidth}px)`,
              aspectRatio: activePage ? `${activePage.widthPt} / ${activePage.heightPt}` : '1 / 1.414',
            }}
          >
            <div
              ref={canvasRef}
              onPointerDown={(e) => {
                if (tool !== 'select') return
                if (placingFieldKind) {
                  const rect = canvasRef.current?.getBoundingClientRect()
                  if (rect && rect.width && rect.height) {
                    const xf = clamp01((e.clientX - rect.left) / rect.width)
                    const yf = clamp01((e.clientY - rect.top) / rect.height)
                    createFormField(placingFieldKind, xf, yf)
                  }
                  setPlacingFieldKind(null)
                  return
                }
                setSelectedId(null)
                endTextEditing()
                startBlankTextAt(e)
              }}
              className="relative h-full w-full overflow-hidden rounded-lg"
              style={{
                transform: activePage?.rotationDeg ? `rotate(${activePage.rotationDeg}deg)` : undefined,
                cursor: placingFieldKind ? 'crosshair' : undefined,
              }}
            >
              {activePage?.previewDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activePage.previewDataUrl}
                  alt=""
                  className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
                  draggable={false}
                />
              )}

              {tool === 'select' && (
                <DetectedTextOverlay
                  runs={detectedTextRuns.filter((r) => r.pageId === activePageId)}
                  onEdit={startEditingDetectedRun}
                />
              )}

              {elements
                .filter((e) => e.pageId === activePageId)
                .map((el) => (
                  <OverlayElement
                    key={el.id}
                    element={el}
                    containerRef={canvasRef}
                    selected={selectedId === el.id}
                    onSelect={() => {
                      if (tool !== 'select') return
                      if (editingTextId && editingTextId !== el.id) endTextEditing()
                      setSelectedId(el.id)
                    }}
                    onChange={(patch) => updateElement(el.id, patch)}
                    onCommit={commitElementChange}
                    onDelete={() => deleteElement(el.id)}
                    onEditText={
                      el.type === 'text'
                        ? () => setEditingTextId(el.id)
                        : el.type === 'note'
                          ? () => setEditingNoteId(el.id)
                          : undefined
                    }
                  >
                    {el.type === 'text' ? (
                      editingTextId === el.id ? (
                        <RichTextEditor
                          ref={richEditorRef}
                          runs={el.runs}
                          align={el.align}
                          defaultStyle={{
                            fontFamily: el.fontFamily,
                            fontSizePt: el.fontSizePt,
                            color: el.color,
                            bold: el.bold,
                            italic: el.italic,
                          }}
                          onRunsChange={(runs) => updateElement(el.id, { runs })}
                          onContentHeightChange={
                            el.autoGrow
                              ? (heightPx) => {
                                  const rect = canvasRef.current?.getBoundingClientRect()
                                  if (!rect || !rect.height) return
                                  const neededHf = Math.min(1 - el.yf, heightPx / rect.height)
                                  if (neededHf > el.hf + 0.001) updateElement(el.id, { hf: neededHf })
                                }
                              : undefined
                          }
                          onEscape={endTextEditing}
                          onBlurEditor={(relatedTarget) => {
                            if (suppressTextBlurRef.current) {
                              // A menu item we just clicked (e.g. Insert >
                              // Text box) is briefly reclaiming focus as
                              // part of its own internal close handling —
                              // not a real "leave the text box" action.
                              return
                            }
                            if (relatedTarget && textToolbarRef.current?.contains(relatedTarget)) {
                              // Focus moved into the related formatting toolbar
                              // (font/size/color/align) — keep the session alive
                              // so the user can come back and keep typing.
                              return
                            }
                            endTextEditing()
                          }}
                          className="h-full w-full overflow-visible whitespace-pre-wrap break-words border-none bg-white/70 p-1 leading-tight outline-none"
                          style={el.coverColor ? { backgroundColor: el.coverColor } : undefined}
                        />
                      ) : (
                        <div
                          className="h-full w-full overflow-hidden whitespace-pre-wrap break-words p-1 leading-tight"
                          style={{ textAlign: el.align, backgroundColor: el.coverColor || undefined }}
                        >
                          {el.runs.length ? (
                            el.runs.map((run, i) => (
                              <span
                                key={i}
                                className={el.url ? 'underline' : ''}
                                style={{
                                  ...fontOptionCss(run.fontFamily, run.bold, run.italic),
                                  fontSize: `${Math.max(8, run.fontSizePt * 0.9)}px`,
                                  color: run.color,
                                }}
                              >
                                {run.text}
                              </span>
                            ))
                          ) : (
                            <span className="opacity-50">Double-click to edit</span>
                          )}
                        </div>
                      )
                    ) : el.type === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={el.dataUrl}
                        alt=""
                        className="h-full w-full select-none object-contain"
                        draggable={false}
                      />
                    ) : el.type === 'draw' ? (
                      <DrawPreview el={el} />
                    ) : el.type === 'shape' ? (
                      <ShapePreview el={el} />
                    ) : el.type === 'redact' ? (
                      <RedactPreview />
                    ) : el.type === 'formField' ? (
                      <FormFieldPreview el={el} />
                    ) : (
                      <NotePreview el={el} />
                    )}
                  </OverlayElement>
                ))}

              <DetectedFieldOverlay
                fields={detectedFields.filter((f) => f.pageId === activePageId)}
                onChange={updateDetectedField}
              />

              {editingNoteId &&
                (() => {
                  const note = elements.find((e) => e.id === editingNoteId) as NoteElement | undefined
                  if (!note) return null
                  return (
                    <div
                      className="absolute z-30 w-48 rounded-lg border border-foreground/15 bg-background p-2 shadow-xl"
                      style={{
                        left: `min(${note.xf * 100}%, calc(100% - 12.5rem))`,
                        top: `min(${(note.yf + note.hf) * 100}%, calc(100% - 8rem))`,
                      }}
                    >
                      <textarea
                        autoFocus
                        value={note.text}
                        onChange={(e) => updateElement(note.id, { text: e.target.value })}
                        placeholder="Note text…"
                        className="h-20 w-full resize-none rounded border border-foreground/15 bg-transparent p-1.5 text-xs text-foreground outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNoteId(null)
                          commitElementChange()
                        }}
                        className="mt-1.5 w-full rounded-full bg-foreground py-1 text-xs font-semibold text-background"
                      >
                        Done
                      </button>
                    </div>
                  )
                })()}

              <DrawingLayer
                tool={tool}
                containerRef={canvasRef}
                color={toolColor}
                onCreateShape={createShape}
                onCreateDraw={createDraw}
                onCreateNote={createNote}
              />
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-foreground/45">
            {tool === 'select'
              ? 'Drag to move, drag the blue handle to resize, double-click text to edit.'
              : 'Drag on the page to draw. Switch back to Select when done.'}
          </p>
        </div>

        {showThumbnails && !keyboardOpen && (
          <div className="max-h-[136px] w-full shrink-0 overflow-x-auto border-t border-foreground/10 p-2 lg:h-auto lg:max-h-none lg:w-[176px] lg:overflow-x-visible lg:overflow-y-auto lg:border-t-0 lg:border-l">
            <PagesSidebar
              pages={pages}
              activePageId={activePageId}
              onSelect={(id) => {
                setActivePageId(id)
                setSelectedId(null)
              }}
              onReorder={reorderPages}
              onAdd={addPage}
              onRemove={removePage}
              onDuplicate={duplicatePage}
              onRotate={rotatePage}
              selectMode={splitMode}
              selectedForSplit={selectedForSplit}
              onToggleSelectForSplit={toggleSplitSelect}
            />
          </div>
        )}
      </div>

      {busy && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30">
          <div className="flex items-center gap-3 rounded-2xl bg-background px-5 py-4 shadow-2xl">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">{busyLabel || 'Working…'}</span>
          </div>
        </div>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void addImage(f)
        }}
      />
      <input
        ref={mergeInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void handleMergeFileChosen(f)
        }}
      />
      <input
        ref={imagesToPdfInputRef}
        type="file"
        accept="image/png,image/jpeg"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          e.target.value = ''
          if (files.length > 0) handleImagesToPdfChosen(files)
        }}
      />

      <SignatureModal open={signatureOpen} onClose={() => setSignatureOpen(false)} onInsert={insertSignature} />

      <ExportGateModal open={gateOpen} onClose={() => setGateOpen(false)} />
    </main>
    </TooltipProvider>
  )
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0.02, v))
}


