import { beforeEach, describe, expect, it, vi } from "vitest"

const manifest = vi.fn()
const page = vi.fn()
vi.mock("@/lib/api", () => ({ getReaderManifest: (...a: unknown[]) => manifest(...a), getReaderPage: (...a: unknown[]) => page(...a) }))

import { loadPreviewPages, MAX_PREVIEW_PAGES } from "./preview"

let n = 0
beforeEach(() => { manifest.mockReset(); page.mockReset(); n += 1 })
const id = () => `book-${n}`

describe("loadPreviewPages", () => {
  it("fetches only the pages the server allows, capped, one request each", async () => {
    manifest.mockResolvedValue({ allowed_pages: 3, pages: Array.from({ length: 50 }, (_, i) => ({ page: i + 1, url: `/p/${i + 1}` })) })
    page.mockImplementation(async (u: string) => ({ text: `text ${u}` }))
    const out = await loadPreviewPages(id())
    expect(out).toEqual(["text /p/1", "text /p/2", "text /p/3"])
    expect(page).toHaveBeenCalledTimes(3)
  })
  it("never asks for more than the cap even when the server allows everything", async () => {
    manifest.mockResolvedValue({ allowed_pages: 400, pages: Array.from({ length: 400 }, (_, i) => ({ page: i + 1, url: `/p/${i + 1}` })) })
    page.mockResolvedValue({ text: "x" })
    await loadPreviewPages(id())
    expect(page).toHaveBeenCalledTimes(MAX_PREVIEW_PAGES)
  })
  it("returns null with no request for pages when nothing is allowed, or on any error", async () => {
    manifest.mockResolvedValue({ allowed_pages: 0, pages: [] })
    expect(await loadPreviewPages(id())).toBeNull()
    expect(page).not.toHaveBeenCalled()
    n += 1
    manifest.mockRejectedValue(Object.assign(new Error("no"), { status: 403 }))
    expect(await loadPreviewPages(id())).toBeNull()
  })
  it("shares one request between callers and caches the answer", async () => {
    const b = id()
    manifest.mockResolvedValue({ allowed_pages: 1, pages: [{ page: 1, url: "/p/1" }] })
    page.mockResolvedValue({ text: "hello" })
    const [a, c] = await Promise.all([loadPreviewPages(b), loadPreviewPages(b)])
    await loadPreviewPages(b)
    expect(a).toEqual(["hello"]); expect(c).toEqual(["hello"])
    expect(manifest).toHaveBeenCalledTimes(1)
  })
})
