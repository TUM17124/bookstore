'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { PDFDocument } from '@cantoo/pdf-lib'
import {
  FileUp,
  FilePlus2,
  Type,
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
  FileImage,
  ScanText,
  Minimize2,
  CheckSquare,
  ChevronDown,
} from 'lucide-react'
import { isLoggedIn } from '@/lib/auth-client'
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
import { FormFieldPanel } from '@/components/pdf-editor/form-field-panel'
import { SecurityPanel } from '@/components/pdf-editor/security-panel'
import { WatermarkPanel } from '@/components/pdf-editor/watermark-panel'
import { SignatureModal } from '@/components/pdf-editor/signature-modal'

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

function newTextElement(pageId: string): TextElement {
  return {
    id: uid(),
    pageId,
    type: 'text',
    xf: 0.12,
    yf: 0.12,
    wf: 0.4,
    hf: 0.08,
    text: 'New text',
    fontSizePt: 20,
    color: '#111111',
    fontFamily: DEFAULT_FONT_FAMILY,
    bold: false,
    italic: false,
    align: 'left',
    url: '',
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
  const [ocrPages, setOcrPages] = useState<Record<string, OcrPageResult>>({})
  const [compressOpen, setCompressOpen] = useState(false)
  const [compressQuality, setCompressQuality] = useState(0.7)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const mergeInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imagesToPdfInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  const historyRef = useRef(new EditorHistory())
  const applyingHistory = useRef(false)

  const activePage = pages.find((p) => p.id === activePageId) || null
  const selectedElement = elements.find((e) => e.id === selectedId) || null

  const openMismatch = openPassword !== '' && openPasswordConfirm !== '' && openPassword !== openPasswordConfirm
  const ownerMismatch =
    ownerPassword !== '' && ownerPasswordConfirm !== '' && ownerPassword !== ownerPasswordConfirm
  const securityReady = !securityEnabled || (!openMismatch && !ownerMismatch)

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

  // --- Elements ----------------------------------------------------------

  function addText() {
    if (!activePageId) return
    const el = newTextElement(activePageId)
    const next = [...elements, el]
    setElements(next)
    pushHistory({ elements: next })
    setSelectedId(el.id)
    setEditingTextId(el.id)
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
  }

  function createFormField(kind: FormFieldElement['fieldKind']) {
    if (!activePageId) return
    const el: FormFieldElement = {
      id: uid(),
      pageId: activePageId,
      type: 'formField',
      xf: 0.12,
      yf: 0.12,
      wf: kind === 'checkbox' ? 0.04 : 0.35,
      hf: kind === 'checkbox' ? 0.03 : 0.05,
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

  function updateDetectedField(id: string, patch: Partial<DetectedField>) {
    setDetectedFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function commitElementChange() {
    pushHistory({ elements })
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

  // --- Render --------------------------------------------------------

  if (stage === 'entry') {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
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
    <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-foreground/15 hover:bg-foreground/5"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">PDF Editor</h1>
            <p className="text-xs text-foreground/55">
              Editing stays in your browser — nothing is uploaded until you download.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={!historyRef.current.canUndo()}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/15 hover:bg-foreground/5 disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!historyRef.current.canRedo()}
            aria-label="Redo"
            title="Redo (Ctrl+Y)"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/15 hover:bg-foreground/5 disabled:opacity-30"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <div className="mx-1 h-6 w-px bg-foreground/10" />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
            aria-label="Zoom out"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/15 hover:bg-foreground/5"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-10 text-center text-xs text-foreground/60">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
            aria-label="Zoom in"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/15 hover:bg-foreground/5"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            aria-label="Fit to width"
            title="Fit to width"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/15 hover:bg-foreground/5"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-[240px_1fr_180px]">
        {/* Toolbar */}
        <div className="order-2 flex flex-col gap-4 lg:order-1">
          <div className="rounded-2xl border border-foreground/10 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/40">Insert</h2>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={addText}
                disabled={!activePageId}
                className="inline-flex items-center gap-2 rounded-lg border border-foreground/10 px-3 py-2 text-sm font-medium hover:bg-foreground/5 disabled:opacity-50"
              >
                <Type className="h-4 w-4" />
                Add text
              </button>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={!activePageId}
                className="inline-flex items-center gap-2 rounded-lg border border-foreground/10 px-3 py-2 text-sm font-medium hover:bg-foreground/5 disabled:opacity-50"
              >
                <ImagePlus className="h-4 w-4" />
                Add image
              </button>
              <button
                type="button"
                onClick={() => setSignatureOpen(true)}
                disabled={!activePageId}
                className="inline-flex items-center gap-2 rounded-lg border border-foreground/10 px-3 py-2 text-sm font-medium hover:bg-foreground/5 disabled:opacity-50"
              >
                <PenTool className="h-4 w-4" />
                Add signature
              </button>
              <button
                type="button"
                onClick={() => mergeInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-foreground/10 px-3 py-2 text-sm font-medium hover:bg-foreground/5"
              >
                <FilePlus className="h-4 w-4" />
                Merge another PDF
              </button>
              <button
                type="button"
                onClick={() => imagesToPdfInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-foreground/10 px-3 py-2 text-sm font-medium hover:bg-foreground/5"
              >
                <Images className="h-4 w-4" />
                Images → PDF pages
              </button>
              <button
                type="button"
                onClick={() => {
                  setSplitMode((v) => !v)
                  setSelectedForSplit([])
                }}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                  splitMode ? 'border-foreground bg-foreground/10' : 'border-foreground/10 hover:bg-foreground/5'
                }`}
              >
                <Scissors className="h-4 w-4" />
                {splitMode ? 'Cancel extract' : 'Extract / export pages'}
              </button>
              {splitMode && (
                <>
                  <button
                    type="button"
                    onClick={handleExtractClick}
                    disabled={selectedForSplit.length === 0 || busy}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-50"
                  >
                    Export {selectedForSplit.length || ''} page{selectedForSplit.length === 1 ? '' : 's'} as PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleImageExportClick}
                    disabled={selectedForSplit.length === 0 || busy}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-foreground/15 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    <FileImage className="h-4 w-4" />
                    As image{selectedForSplit.length === 1 ? '' : 's'} (zip)
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleOcrClick}
                disabled={!pages.some((p) => p.source.kind === 'copy') || busy}
                className="inline-flex items-center gap-2 rounded-lg border border-foreground/10 px-3 py-2 text-sm font-medium hover:bg-foreground/5 disabled:opacity-50"
              >
                <ScanText className="h-4 w-4" />
                OCR this document
              </button>
              <button
                type="button"
                onClick={() => setCompressOpen((v) => !v)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                  compressOpen ? 'border-foreground bg-foreground/10' : 'border-foreground/10 hover:bg-foreground/5'
                }`}
              >
                <Minimize2 className="h-4 w-4" />
                Compress
              </button>
              {compressOpen && (
                <div className="rounded-lg border border-foreground/10 p-2.5">
                  <p className="text-[11px] text-foreground/55">
                    Re-encodes every page as a compressed image. Best for
                    scanned or image-heavy PDFs — text stops being
                    selectable/searchable.
                  </p>
                  <label className="mt-2 block text-xs text-foreground/55">
                    Quality ({Math.round(compressQuality * 100)}%)
                    <input
                      type="range"
                      min={0.3}
                      max={0.95}
                      step={0.05}
                      value={compressQuality}
                      onChange={(e) => setCompressQuality(Number(e.target.value))}
                      className="mt-1 w-full"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleCompressClick}
                    disabled={busy}
                    className="mt-2 w-full rounded-full bg-foreground py-1.5 text-xs font-semibold text-background disabled:opacity-50"
                  >
                    Compress & download
                  </button>
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
            </div>
          </div>

          <div className="rounded-2xl border border-foreground/10 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/40">Form fields</h2>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => createFormField('text')}
                disabled={!activePageId}
                title="Add text field"
                className="flex flex-col items-center gap-1 rounded-lg border border-foreground/15 py-2 text-[10px] hover:bg-foreground/5 disabled:opacity-50"
              >
                <Type className="h-4 w-4" />
                Text
              </button>
              <button
                type="button"
                onClick={() => createFormField('checkbox')}
                disabled={!activePageId}
                title="Add checkbox"
                className="flex flex-col items-center gap-1 rounded-lg border border-foreground/15 py-2 text-[10px] hover:bg-foreground/5 disabled:opacity-50"
              >
                <CheckSquare className="h-4 w-4" />
                Check
              </button>
              <button
                type="button"
                onClick={() => createFormField('dropdown')}
                disabled={!activePageId}
                title="Add dropdown"
                className="flex flex-col items-center gap-1 rounded-lg border border-foreground/15 py-2 text-[10px] hover:bg-foreground/5 disabled:opacity-50"
              >
                <ChevronDown className="h-4 w-4" />
                Dropdown
              </button>
            </div>
          </div>

          <AnnotationToolbar
            tool={tool}
            onToolChange={setTool}
            color={toolColor}
            onColorChange={setToolColor}
            strokeWidth={toolStrokeWidth}
            onStrokeWidthChange={setToolStrokeWidth}
          />

          {selectedElement?.type === 'text' && (
            <TextPanel
              element={selectedElement}
              onChange={(patch) => {
                updateElement(selectedElement.id, patch)
                pushHistory({ elements: elements.map((e) => (e.id === selectedElement.id ? { ...e, ...patch } as EditorElement : e)) })
              }}
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

          <button
            type="button"
            onClick={handleDownloadClick}
            disabled={busy || !securityReady}
            title="Ctrl+S"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
          >
            {securityEnabled ? <Lock className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            Download PDF
          </button>
        </div>

        {/* Canvas */}
        <div className="order-1 flex flex-col gap-4 lg:order-2">
          <div
            className="mx-auto rounded-lg border border-foreground/10 bg-white shadow-sm"
            style={{
              width: `min(100%, ${zoomWidth}px)`,
              aspectRatio: activePage ? `${activePage.widthPt} / ${activePage.heightPt}` : '1 / 1.414',
            }}
          >
            <div
              ref={canvasRef}
              onPointerDown={() => tool === 'select' && setSelectedId(null)}
              className="relative h-full w-full overflow-hidden rounded-lg"
              style={{
                transform: activePage?.rotationDeg ? `rotate(${activePage.rotationDeg}deg)` : undefined,
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

              {elements
                .filter((e) => e.pageId === activePageId)
                .map((el) => (
                  <OverlayElement
                    key={el.id}
                    element={el}
                    containerRef={canvasRef}
                    selected={selectedId === el.id}
                    onSelect={() => tool === 'select' && setSelectedId(el.id)}
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
                        <textarea
                          autoFocus
                          value={el.text}
                          onPointerDown={(e) => e.stopPropagation()}
                          onChange={(e) => updateElement(el.id, { text: e.target.value })}
                          onBlur={() => {
                            setEditingTextId(null)
                            commitElementChange()
                          }}
                          className="h-full w-full resize-none border-none bg-white/70 p-1 leading-tight outline-none"
                          style={textCssStyle(el)}
                        />
                      ) : (
                        <div
                          className={`h-full w-full overflow-hidden whitespace-pre-wrap break-words p-1 leading-tight ${el.url ? 'underline' : ''}`}
                          style={{ ...textCssStyle(el), textAlign: el.align }}
                        >
                          {el.text || 'Double-click to edit'}
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
          <p className="text-center text-xs text-foreground/45">
            {tool === 'select'
              ? 'Drag to move, drag the blue handle to resize, double-click text to edit.'
              : 'Drag on the page to draw. Switch back to Select when done.'}
          </p>
        </div>

        {/* Pages sidebar */}
        <div className="order-3">
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
      </div>

      {busy && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30">
          <div className="flex items-center gap-3 rounded-2xl bg-background px-5 py-4 shadow-2xl">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">{busyLabel || 'Working…'}</span>
          </div>
        </div>
      )}

      <SignatureModal open={signatureOpen} onClose={() => setSignatureOpen(false)} onInsert={insertSignature} />

      <ExportGateModal open={gateOpen} onClose={() => setGateOpen(false)} />
    </main>
  )
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0.02, v))
}

function textCssStyle(el: TextElement): CSSProperties {
  return {
    fontSize: `${Math.max(8, el.fontSizePt * 0.9)}px`,
    color: el.color,
    ...fontOptionCss(el.fontFamily, el.bold, el.italic),
  }
}
