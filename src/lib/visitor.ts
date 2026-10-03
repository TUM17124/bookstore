/**
 * A random id for this browser (no personal data), so banner frequency caps
 * ("at most N times a day", "not again after closing it") also work for
 * guests. Sent as X-Visitor-Id; the server stores only a hash of it.
 * The inline preload script (lib/preload.ts) creates it the same way.
 */

export const VISITOR_KEY = "plugyard_vid"

export function getVisitorId(): string {
  if (typeof window === "undefined") return ""
  try {
    let id = localStorage.getItem(VISITOR_KEY)
    if (!id) {
      id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Math.random().toString(36).slice(2)}${Date.now()}`
      localStorage.setItem(VISITOR_KEY, id)
    }
    return id
  } catch {
    return ""
  }
}

/** The banners request path for a page (the preload script builds the same). */
export function bannersPath(placement: string, category = ""): string {
  const q = new URLSearchParams({ placement })
  if (category) q.set("category", category)
  return `/banners/?${q.toString()}`
}
