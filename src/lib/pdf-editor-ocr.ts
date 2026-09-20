import { renderPdfPageToCanvas } from '@/lib/pdfjs-loader'

export type OcrWord = { text: string; x0: number; y0: number; x1: number; y1: number }
export type OcrPageResult = { words: OcrWord[]; canvasWidth: number; canvasHeight: number; scale: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let workerPromise: Promise<any> | null = null

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const ns = await import('tesseract.js')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Tesseract = (ns as any).default ?? ns
      return Tesseract.createWorker('eng')
    })()
  }
  return workerPromise
}

/** Runs OCR on one rasterized PDF page and returns per-word bounding boxes
 * (in the rasterized canvas's pixel space, at the given `scale`) so the
 * caller can position an invisible, searchable text layer over the
 * original page content at export time. */
export async function ocrPdfPage(bytes: Uint8Array, pageNumber: number, scale = 2): Promise<OcrPageResult> {
  const canvas = await renderPdfPageToCanvas(bytes, pageNumber, scale)
  const worker = await getWorker()
  const { data } = await worker.recognize(canvas, {}, { blocks: true })

  const words: OcrWord[] = []
  for (const block of data.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        for (const word of line.words || []) {
          if (word.text && word.text.trim()) {
            words.push({ text: word.text, x0: word.bbox.x0, y0: word.bbox.y0, x1: word.bbox.x1, y1: word.bbox.y1 })
          }
        }
      }
    }
  }

  return { words, canvasWidth: canvas.width, canvasHeight: canvas.height, scale }
}

/** Frees the OCR worker's WASM/worker-thread resources. Call once OCR is
 * done for the session (e.g. leaving the editor) — not after every page,
 * since re-creating the worker re-downloads the language data. */
export async function terminateOcrWorker() {
  if (!workerPromise) return
  const worker = await workerPromise
  workerPromise = null
  await worker.terminate()
}


