import { PDFDocument } from '@cantoo/pdf-lib'
import { zipSync, type Zippable } from 'fflate'
import { renderPdfPageToCanvas, getPdfPageCount } from '@/lib/pdfjs-loader'

/** Rasterizes the given pages of a (already fully-built) PDF to PNG/JPG
 * images and bundles them into a single .zip — or returns one plain image
 * file directly when there's only one page, so a single-page export
 * doesn't need unzipping. */
export async function pdfPagesToImageZip(
  bytes: Uint8Array,
  pageNumbers: number[],
  format: 'png' | 'jpeg',
  scale: number,
): Promise<{ blob: Blob; filename: string }> {
  const mime = format === 'png' ? 'image/png' : 'image/jpeg'
  const ext = format === 'png' ? 'png' : 'jpg'

  const images: { name: string; bytes: Uint8Array }[] = []
  for (const pageNumber of pageNumbers) {
    const canvas = await renderPdfPageToCanvas(bytes, pageNumber, scale)
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), mime, 0.92),
    )
    images.push({ name: `page-${pageNumber}.${ext}`, bytes: new Uint8Array(await blob.arrayBuffer()) })
  }

  if (images.length === 1) {
    return { blob: new Blob([images[0].bytes as BlobPart], { type: mime }), filename: images[0].name }
  }

  const zipInput: Zippable = {}
  for (const img of images) zipInput[img.name] = img.bytes
  const zipped = zipSync(zipInput)
  return { blob: new Blob([zipped as BlobPart], { type: 'application/zip' }), filename: 'plugyard-pages.zip' }
}

/** Re-encodes every page of a PDF as a compressed JPEG image and rebuilds
 * the document from those images. Trades text-selectability/searchability
 * for file size — appropriate for image-heavy or scanned documents, not a
 * general-purpose compressor. */
export async function compressPdfByRasterizing(bytes: Uint8Array, scale: number, quality: number): Promise<Uint8Array> {
  const pageCount = await getPdfPageCount(bytes)

  const out = await PDFDocument.create()
  for (let i = 1; i <= pageCount; i++) {
    const canvas = await renderPdfPageToCanvas(bytes, i, scale)
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality),
    )
    const jpgBytes = new Uint8Array(await blob.arrayBuffer())
    const embedded = await out.embedJpg(jpgBytes)
    const page = out.addPage([embedded.width / scale, embedded.height / scale])
    page.drawImage(embedded, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() })
  }
  return out.save()
}


