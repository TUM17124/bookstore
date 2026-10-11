/**
 * Sharing a book: always the public /b/<slug>/ page (rich previews + indexable),
 * never the app URL /?book=<id>. Pure helpers, no DOM, so they are easy to test.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://plugyard.com").replace(/\/+$/, "")

export type Shareable = { id: string | number; title: string; author?: string; slug?: string | null; shareUrl?: string | null }

/** The server gives the canonical URL; without it /b/<id>/ also works (it 301s to the slug). */
export function bookShareUrl(book: Pick<Shareable, "id" | "slug" | "shareUrl">): string {
  if (book.shareUrl) return book.shareUrl
  const key = book.slug || String(book.id)
  return `${SITE_URL}/b/${encodeURIComponent(key)}/`
}

/** "<Title> by <Author> on PlugYard" */
export function bookShareText(book: Pick<Shareable, "title" | "author">): string {
  const by = book.author && book.author.trim() && book.author !== "Unknown" ? ` by ${book.author.trim()}` : ""
  return `${book.title}${by} on PlugYard`
}

export type ShareTarget = { id: string; label: string; href: string }

export function shareTargets(url: string, text: string): ShareTarget[] {
  const u = encodeURIComponent(url)
  const t = encodeURIComponent(text)
  return [
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
    { id: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { id: "x", label: "X", href: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
    { id: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${u}&text=${t}` },
    { id: "linkedin", label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { id: "email", label: "Email", href: `mailto:?subject=${t}&body=${encodeURIComponent(`${text}\n${url}`)}` },
  ]
}

export type NativeShareResult = "shared" | "cancelled" | "unsupported"

/** Web Share API; "unsupported" means the caller should show the fallback menu. */
export async function nativeShare(
  book: Pick<Shareable, "id" | "title" | "author" | "slug" | "shareUrl">,
  nav: Pick<Navigator, "share"> | { share?: undefined } = typeof navigator === "undefined" ? {} : navigator,
): Promise<NativeShareResult> {
  if (typeof nav.share !== "function") return "unsupported"
  try {
    await nav.share({ title: book.title, text: bookShareText(book), url: bookShareUrl(book) })
    return "shared"
  } catch (e) {
    return (e as { name?: string })?.name === "AbortError" ? "cancelled" : "unsupported"
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement("textarea")
      ta.value = text
      ta.setAttribute("readonly", "")
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand("copy")
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}
