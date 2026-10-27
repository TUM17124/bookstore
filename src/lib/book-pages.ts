/**
 * The public book pages (https://plugyard.com/b/<slug>/) for the sitemap.
 * Read at build time from the API's /sitemap-books.xml (published books only).
 * Best effort: if the API is unreachable the build never fails, the sitemap
 * just has no book entries (and robots.txt also points crawlers at the live
 * /sitemap-books.xml, which is always current).
 */

const SITE = "https://plugyard.com"
const MAX_PAGES = 5000
const PUBLIC_SITEMAP_PATHS: Record<string, string> = {
  "sitemap-listings.xml": "/listings/",
  "sitemap-sellers.xml": "/sellers/",
  "sitemap-categories.xml": "/categories/",
  "sitemap-auctions.xml": "/auctions/",
}
const URL_RE = /^https:\/\/plugyard\.com\/b\/[a-z0-9-]{1,90}\/$/

export function parseBookSitemap(xml: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const url = m[1]
    if (URL_RE.test(url) && !seen.has(url)) {
      seen.add(url)
      out.push(url)
      if (out.length >= MAX_PAGES) break
    }
  }
  return out
}

export async function getBookPageUrls(
  fetcher: typeof fetch = fetch,
  apiUrl: string | undefined = process.env.NEXT_PUBLIC_API_URL,
): Promise<string[]> {
  if (!apiUrl) return []
  try {
    const origin = new URL(apiUrl).origin
    const res = await fetcher(`${origin}/sitemap-books.xml`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    return parseBookSitemap(await res.text())
  } catch {
    return []
  }
}

/** Public detail/category URLs from the existing backend sitemap endpoints.
 * Only the known public sitemap names and PlugYard canonical URLs are accepted. */
export async function getPublicPageUrls(
  sitemap: string,
  fetcher: typeof fetch = fetch,
  apiUrl: string | undefined = process.env.NEXT_PUBLIC_API_URL,
): Promise<string[]> {
  const allowedPath = PUBLIC_SITEMAP_PATHS[sitemap]
  if (!apiUrl || !allowedPath) return []
  try {
    const origin = new URL(apiUrl).origin
    const response = await fetcher(`${origin}/${sitemap}`, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) return []
    const urls = new Set<string>()
    for (const match of (await response.text()).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      try {
        const url = new URL(match[1])
        if (url.origin === SITE && url.search === "" && url.hash === "" && url.pathname.startsWith(allowedPath)) {
          urls.add(url.href)
          if (urls.size >= MAX_PAGES) break
        }
      } catch {
        // Ignore malformed entries rather than putting them in the static sitemap.
      }
    }
    return [...urls]
  } catch {
    return []
  }
}

export const BOOK_SITE = SITE
