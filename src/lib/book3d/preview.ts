import { getReaderManifest, getReaderPage } from '@/lib/api'

/** Most pages the 3D book ever fetches (4 leaves, two pages each). */
export const MAX_PREVIEW_PAGES = 8

const cache = new Map<string, { at: number; pages: string[] | null }>()
const inflight = new Map<string, Promise<string[] | null>>()
const TTL_MS = 5 * 60 * 1000

/**
 * The first pages the reader is allowed to see, as plain text, through the
 * same secure reader the Read button uses: the server decides what is
 * allowed (`allowed_pages`), each page URL is signed and short-lived, and the
 * PDF itself never reaches the browser. Resolves to null when nothing is
 * allowed or the request fails; the book then shows its title page instead.
 * Only called when the reader opens the book in 3D, never on the home page.
 */
export function loadPreviewPages(bookId: string | number): Promise<string[] | null> {
  const key = String(bookId)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.pages)
  const running = inflight.get(key)
  if (running) return running
  const p = (async () => {
    try {
      const m = await getReaderManifest(key)
      const allowed = Math.max(0, Math.min(m.allowed_pages || 0, MAX_PREVIEW_PAGES))
      const entries = (m.pages || []).filter((e) => e.page >= 1 && e.page <= allowed).slice(0, MAX_PREVIEW_PAGES)
      const out: string[] = []
      for (const e of entries) {
        const got = await getReaderPage(e.url)
        out.push(got.text || '')
      }
      const pages = out.some((t) => t.trim()) ? out : null
      cache.set(key, { at: Date.now(), pages })
      return pages
    } catch {
      cache.set(key, { at: Date.now(), pages: null })
      return null
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, p)
  return p
}
