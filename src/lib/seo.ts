import type { Metadata } from "next"
import defaults from "@/lib/site-defaults.json"

/**
 * Part D: SEO texts (Django admin → Site: SEO), read once at BUILD time
 * from /api/site/seo/ - the site is a static export, so a change there
 * applies at the next build (the next deploy), as the admin page says.
 * If the API can't be reached during the build, the built-in texts
 * (site-defaults.json, generated from the backend's registry) are used.
 */

type SeoTexts = Record<string, string | string[]>

const FALLBACK = defaults.seo as SeoTexts
let pending: Promise<SeoTexts> | null = null

async function load(): Promise<SeoTexts> {
  const base = process.env.NEXT_PUBLIC_API_URL
  if (!base) return FALLBACK
  try {
    const res = await fetch(`${base}/site/seo/`, { cache: "force-cache", signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return FALLBACK
    const live = ((await res.json()) as { texts?: SeoTexts })?.texts || {}
    const out: SeoTexts = { ...FALLBACK }
    for (const key of Object.keys(FALLBACK)) {
      const v = live[key]
      if (Array.isArray(v) ? v.length : typeof v === "string" && v.trim()) out[key] = v
    }
    return out
  } catch {
    return FALLBACK
  }
}

/** All SEO texts (fetched once per build). */
export function getSeo(): Promise<SeoTexts> {
  if (!pending) pending = load()
  return pending
}

export function seoText(t: SeoTexts, key: string): string {
  const v = t[key]
  return Array.isArray(v) ? v.join(", ") : v || ""
}

export function seoList(t: SeoTexts, key: string): string[] {
  const v = t[key]
  return Array.isArray(v) ? v : (v || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
}

/** A page's metadata: its admin title/description over the page's other
 * settings (canonical URL, robots…). An empty description = the site's. */
export async function pageMetadata(page: string, base: Metadata = {}): Promise<Metadata> {
  const t = await getSeo()
  const title = seoText(t, `seo.page.${page}.title`)
  const description = seoText(t, `seo.page.${page}.description`) || seoText(t, "seo.description")
  return { ...base, ...(title ? { title } : {}), ...(description ? { description } : {}) }
}
