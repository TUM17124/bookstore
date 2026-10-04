// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReaderBlock } from "@/lib/api"
import { ChapterList, EpubBlocks, chapterIndexFor, hasFigures } from "./epub-blocks"

const getReaderImage = vi.fn()
vi.mock("@/lib/api", () => ({ getReaderImage: (...a: unknown[]) => getReaderImage(...a) }))

let root: Root | null = null
let el: HTMLDivElement | null = null
async function render(ui: React.ReactElement) {
  el = document.createElement("div")
  document.body.append(el)
  root = createRoot(el)
  await act(async () => root!.render(ui))
}
beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  getReaderImage.mockReset()
  URL.createObjectURL = vi.fn(() => "blob:test/1")
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  act(() => root?.unmount())
  el?.remove()
  root = null
})

const CH = [
  { title: "One", page: 1 },
  { title: "Two", page: 4 },
  { title: "Three", page: 9 },
]

describe("chapters", () => {
  it("finds the current chapter from the page", () => {
    expect([1, 3, 4, 8, 9, 50].map((p) => chapterIndexFor(CH, p))).toEqual([0, 0, 1, 1, 2, 2])
    expect(chapterIndexFor([], 3)).toBe(-1)
    expect(chapterIndexFor([{ title: "x", page: 5 }], 2)).toBe(-1)
  })

  it("marks the current chapter and jumps to the chosen one", async () => {
    const go = vi.fn()
    await render(<ChapterList chapters={CH} page={5} onGo={go} />)
    const items = [...el!.querySelectorAll("button")]
    expect(items.map((b) => b.getAttribute("aria-current"))).toEqual([null, "location", null])
    await act(async () => items[2].click())
    expect(go).toHaveBeenCalledWith(9)
  })
})

describe("blocks", () => {
  it("only pages with images/tables use the block renderer", () => {
    expect(hasFigures([{ t: "p", x: "a" }])).toBe(false)
    expect(hasFigures(undefined)).toBe(false)
    expect(hasFigures([{ t: "table", rows: [["a"]] }])).toBe(true)
    expect(hasFigures([{ t: "img", a: 0, alt: "", url: "/u" }])).toBe(true)
  })

  it("renders tables with a header row", async () => {
    const blocks: ReaderBlock[] = [{ t: "table", rows: [["Name", "Qty"], ["Apple", "3"]] }]
    await render(<EpubBlocks blocks={blocks} fontSize={16} />)
    expect([...el!.querySelectorAll("th")].map((c) => c.textContent)).toEqual(["Name", "Qty"])
    expect([...el!.querySelectorAll("td")].map((c) => c.textContent)).toEqual(["Apple", "3"])
  })

  it("never turns book text into markup", async () => {
    const evil = '<img src=x onerror="window.__pwn=1"><script>window.__pwn=1</script>'
    const blocks: ReaderBlock[] = [
      { t: "h", x: evil },
      { t: "p", x: evil },
      { t: "table", rows: [[evil]] },
    ]
    await render(<EpubBlocks blocks={blocks} fontSize={16} />)
    expect(el!.querySelector("script")).toBeNull()
    expect(el!.querySelector("img")).toBeNull()
    expect(el!.textContent).toContain("<script>")
    expect((window as unknown as { __pwn?: number }).__pwn).toBeUndefined()
  })

  it("loads an image through the authenticated fetch and shows it from a blob URL", async () => {
    getReaderImage.mockResolvedValue(new Blob([new Uint8Array([1])], { type: "image/png" }))
    await render(<EpubBlocks blocks={[{ t: "img", a: 0, alt: "A cat", url: "/api/books/1/reader/assets/2/0/?sig=x" }]} fontSize={16} guestToken="g" />)
    await act(async () => {})
    expect(getReaderImage).toHaveBeenCalledWith("/api/books/1/reader/assets/2/0/?sig=x", "g")
    const img = el!.querySelector("img")!
    expect(img.getAttribute("src")).toBe("blob:test/1")
    expect(img.getAttribute("alt")).toBe("A cat")
    act(() => root!.unmount())
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test/1")
    root = null
  })

  it("falls back to the alt text when the image is refused", async () => {
    getReaderImage.mockRejectedValue(new Error("403"))
    await render(<EpubBlocks blocks={[{ t: "img", a: 0, alt: "A cat", url: "/u" }]} fontSize={16} />)
    await act(async () => {})
    expect(el!.querySelector("img")).toBeNull()
    expect(el!.textContent).toContain("A cat")
  })
})
