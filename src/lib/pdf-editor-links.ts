/** The accent color auto-applied to text the first time a link is added to
 * it — matches the universal web convention for "this is a hyperlink"
 * rather than inventing a new app-specific link color, since nothing in
 * this codebase has an established one. Still just a starting value: it's
 * the element's ordinary `color` field, so the user can change it like any
 * other text afterward. */
export const LINK_ACCENT_COLOR = '#2563eb'

/** Normalizes user-typed link input into a URL pdf-lib/PDF viewers will
 * actually treat as absolute and clickable. Returns null when the input is
 * empty (meaning "no link") or can't be turned into a valid http(s) URL.
 *
 * A bare domain like "plugyard.com" has no scheme — most PDF viewers won't
 * resolve a schemeless URI action, so this is the auto-prepend that makes
 * the common case of typing a bare domain actually work. */
export function normalizeLinkUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const parsed = new URL(withScheme)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname || !parsed.hostname.includes('.')) return null
    return parsed.toString()
  } catch {
    return null
  }
}


