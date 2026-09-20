// Loads pdf.js from the same CDN + version already used by pdf-reader.tsx,
// so the browser only ever fetches one copy of it regardless of which
// component asks first.

declare global {
  interface Window {
    pdfjsLib?: {
      GlobalWorkerOptions: { workerSrc: string }
      getDocument: (opts: Record<string, unknown>) => { promise: Promise<any> }
    }
  }
}

let loading: Promise<void> | null = null

export function loadPdfJs(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'))
  if (window.pdfjsLib) return Promise.resolve()
  if (loading) return loading

  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('pdf.js failed to load'))
    document.body.appendChild(s)
  }).then(() => {
    window.pdfjsLib!.GlobalWorkerOptions.workerSrc =
      'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
  })

  return loading
}

/** Rasterize one page of a PDF (given as bytes) to a canvas. `scale`
 * controls render resolution (higher = sharper but slower/larger). */
export async function renderPdfPageToCanvas(
  bytes: Uint8Array,
  pageNumber: number,
  scale = 1.5,
): Promise<HTMLCanvasElement> {
  await loadPdfJs()
  // pdf.js transfers `data`'s underlying buffer to its worker (detaching
  // it in this thread), so hand it a copy — callers pass in bytes they
  // (or the rest of the editor, e.g. export) still need afterward.
  const pdf = await window.pdfjsLib!.getDocument({ data: bytes.slice() }).promise
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas
}

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  await loadPdfJs()
  const pdf = await window.pdfjsLib!.getDocument({ data: bytes.slice() }).promise
  return pdf.numPages
}

/** Rasterize one page of a PDF (given as bytes) to a PNG data URL, for use
 * as a background preview image while editing. `scale` controls render
 * resolution (higher = sharper but slower/larger). */
export async function renderPdfPageToDataUrl(
  bytes: Uint8Array,
  pageNumber: number,
  scale = 1.5,
): Promise<string> {
  const canvas = await renderPdfPageToCanvas(bytes, pageNumber, scale)
  return canvas.toDataURL('image/png')
}


