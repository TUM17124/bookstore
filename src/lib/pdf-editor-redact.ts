import { renderPdfPageToCanvas } from '@/lib/pdfjs-loader'

export type RedactionBox = { xf: number; yf: number; wf: number; hf: number }

/** Rasterizes one page of a PDF and paints solid black boxes over the given
 * regions directly on the pixel data — the underlying text/image content is
 * gone from the output, not just covered. Returns PNG bytes; the caller
 * embeds this as a full-page image in place of the original page content. */
export async function rasterizePageWithRedactions(
  bytes: Uint8Array,
  pageNumber: number,
  boxes: RedactionBox[],
  scale = 2.5,
): Promise<Uint8Array> {
  const canvas = await renderPdfPageToCanvas(bytes, pageNumber, scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000000'
  for (const b of boxes) {
    ctx.fillRect(b.xf * canvas.width, b.yf * canvas.height, b.wf * canvas.width, b.hf * canvas.height)
  }
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  )
  return new Uint8Array(await blob.arrayBuffer())
}


