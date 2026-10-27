import { describe, expect, it, vi } from "vitest"
import { bookShareText, bookShareUrl, nativeShare, shareTargets } from "./share"
import { getBookPageUrls, getPublicPageUrls, parseBookSitemap } from "./book-pages"
import sitemapFn from "@/app/sitemap"

describe("share helpers", () => {
  it("shares the public /b/ page, never /?book=", () => {
    expect(bookShareUrl({ id: 313, slug: "the-art-of-quiet" })).toBe("https://plugyard.com/b/the-art-of-quiet/")
    expect(bookShareUrl({ id: 313 })).toBe("https://plugyard.com/b/313/") // the server 301s this to the slug
    expect(bookShareUrl({ id: 313, slug: "x", shareUrl: "https://plugyard.com/b/canonical/" })).toBe("https://plugyard.com/b/canonical/")
    expect(bookShareUrl({ id: 1, slug: "a b/c" })).not.toContain("?book=")
  })

  it("share text is '<Title> by <Author> on PlugYard'", () => {
    expect(bookShareText({ title: "Nairobi Nights", author: "R. Kamau" })).toBe("Nairobi Nights by R. Kamau on PlugYard")
    expect(bookShareText({ title: "Untitled", author: "Unknown" })).toBe("Untitled on PlugYard")
  })

  it("has every fallback target with the link and text encoded", () => {
    const url = "https://plugyard.com/b/a-b/"
    const t = shareTargets(url, "A & B by C on PlugYard")
    expect(t.map((x) => x.id)).toEqual(["whatsapp", "facebook", "x", "telegram", "linkedin", "email"])
    expect(t[0].href).toBe(`https://wa.me/?text=${encodeURIComponent(`A & B by C on PlugYard ${url}`)}`)
    expect(t[1].href).toContain(encodeURIComponent(url))
    expect(t[2].href).toContain("text=A%20%26%20B%20by%20C%20on%20PlugYard")
    expect(t[5].href.startsWith("mailto:?subject=")).toBe(true)
    for (const x of t) expect(x.href).not.toMatch(/[\s<>"]/)
  })

  it("uses the Web Share API when present, reports cancel, and falls back when absent", async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    expect(await nativeShare({ id: 1, title: "T", author: "A", slug: "t" }, { share })).toBe("shared")
    expect(share).toHaveBeenCalledWith({ title: "T", text: "T by A on PlugYard", url: "https://plugyard.com/b/t/" })
    const abort = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" }))
    expect(await nativeShare({ id: 1, title: "T" }, { share: abort })).toBe("cancelled")
    expect(await nativeShare({ id: 1, title: "T" }, {})).toBe("unsupported")
  })
})

describe("book pages in the sitemap", () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://plugyard.com/b/alpha/</loc></url>
    <url><loc>https://plugyard.com/b/beta-2/</loc></url>
    <url><loc>https://plugyard.com/b/alpha/</loc></url>
    <url><loc>https://evil.example/b/x/</loc></url>
    <url><loc>https://plugyard.com/?book=3</loc></url>
    <url><loc>https://plugyard.com/b/NoSlash</loc></url></urlset>`

  it("keeps only canonical https /b/<slug>/ URLs, once each", () => {
    expect(parseBookSitemap(xml)).toEqual(["https://plugyard.com/b/alpha/", "https://plugyard.com/b/beta-2/"])
  })

  it("reads them from the API origin and never fails the build", async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, text: async () => xml })
    expect(await getBookPageUrls(ok as unknown as typeof fetch, "https://plugyard.com/api")).toHaveLength(2)
    expect(ok.mock.calls[0][0]).toBe("https://plugyard.com/sitemap-books.xml")
    expect(await getBookPageUrls(vi.fn().mockRejectedValue(new Error("down")) as unknown as typeof fetch, "https://plugyard.com/api")).toEqual([])
    expect(await getBookPageUrls(vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch, "https://plugyard.com/api")).toEqual([])
    expect(await getBookPageUrls(ok as unknown as typeof fetch, undefined)).toEqual([])
  })

  it("sitemap.ts stays valid (static pages present, all https with trailing slash)", async () => {
    const urls = (await sitemapFn()).map((e) => e.url)
    expect(urls).toContain("https://plugyard.com/")
    for (const u of urls) expect(u).toMatch(/^https:\/\/plugyard\.com\/.*\/$|^https:\/\/plugyard\.com\/$/)
  })
})

describe("marketplace URLs in the sitemap", () => {
  it("loads only canonical public PlugYard URLs from known backend sitemap paths", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `<urlset>
        <url><loc>https://plugyard.com/listings/real-item/</loc></url>
        <url><loc>https://plugyard.com/categories/books/</loc></url>
        <url><loc>https://evil.example/listings/fake/</loc></url>
        <url><loc>https://plugyard.com/settings/private/</loc></url>
        <url><loc>https://plugyard.com/marketplace/?page=2</loc></url>
      </urlset>`,
    })
    expect(await getPublicPageUrls("sitemap-listings.xml", fetcher as unknown as typeof fetch, "https://plugyard.com/api"))
      .toEqual(["https://plugyard.com/listings/real-item/"])
    expect(fetcher.mock.calls[0][0]).toBe("https://plugyard.com/sitemap-listings.xml")
  })

  it("rejects unapproved sitemap names and tolerates a missing API", async () => {
    const fetcher = vi.fn()
    expect(await getPublicPageUrls("sitemap.xml", fetcher as unknown as typeof fetch, "https://plugyard.com/api")).toEqual([])
    expect(await getPublicPageUrls("sitemap-listings.xml", fetcher as unknown as typeof fetch, undefined)).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })
})
